import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import os
spec=importlib.util.spec_from_file_location('installer',Path(__file__).with_name('installer-versets.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class InstallerTest(unittest.TestCase):
    def test_partial_write_restores_every_destination(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as tmp:
            root=Path(tmp);target=root/'VerseObs';pkg=root/'paquet'
            (target/'tools').mkdir(parents=True);(pkg/'payload/tools').mkdir(parents=True)
            entries=[];before={'control_panel.html':b'ORIGINAL-CONTROL','tools/server.js':b'ORIGINAL-SERVER'}
            for relative,data in before.items():
                (target/relative).write_bytes(data);after=b'NEW-'+data
                (pkg/'payload'/relative).write_bytes(after)
                entries.append(dict(path=relative,sha256=m.sha(after),accepted_before=[m.sha(data)]))
            (pkg/'manifest.json').write_text(json.dumps(dict(commit='fixture-test',files=entries)))
            write=Path.write_bytes
            def interrupted(path,data):
                if path.parent==target/'tools' and path.name.startswith('server.js') and data.startswith(b'NEW-'):
                    write(path,data[:5]);raise OSError('Panne synthétique pendant écriture')
                return write(path,data)
            with mock.patch.object(Path,'write_bytes',interrupted):
                with self.assertRaises(OSError):m.apply(pkg,target,True)
            for relative,data in before.items():self.assertEqual((target/relative).read_bytes(),data)
            self.assertEqual(list(target.rglob('*.tmp')),[])

    def test_interrupted_rollback_can_resume_and_rejects_unknown_edit(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as tmp:
            root=Path(tmp);target=root/'VerseObs';pkg=root/'paquet'
            (target/'tools').mkdir(parents=True);(pkg/'payload/tools').mkdir(parents=True)
            old={'control_panel.html':b'OLD-CONTROL','new.js':None,'tools/server.js':b'OLD-SERVER'}
            entries=[]
            for relative,before in old.items():
                if before is not None:(target/relative).write_bytes(before)
                data=b'NEW-'+relative.encode();(pkg/'payload'/relative).write_bytes(data)
                entries.append(dict(path=relative,sha256=m.sha(data),accepted_before=[m.sha(before) if before is not None else None]))
            (pkg/'manifest.json').write_text(json.dumps(dict(commit='fixture-test',files=entries)))
            backup=Path(m.apply(pkg,target,True)['backup']);write=m.atomic_write
            def fail_second(dest,data):
                if dest.name=='server.js':raise PermissionError('Panne de retour')
                return write(dest,data)
            with mock.patch.object(m,'atomic_write',fail_second):
                with self.assertRaises(PermissionError):m.rollback(backup,True)
            self.assertEqual((target/'control_panel.html').read_bytes(),old['control_panel.html'])
            self.assertFalse((target/'new.js').exists())
            # Une édition étrangère reste refusée même pendant une reprise.
            (target/'control_panel.html').write_bytes(b'UNKNOWN')
            with self.assertRaises(ValueError):m.rollback(backup,True)
            (target/'control_panel.html').write_bytes(old['control_panel.html'])
            m.rollback(backup,True)
            m.rollback(backup,True)  # idempotence après succès
            for relative,before in old.items():
                self.assertEqual((target/relative).read_bytes() if (target/relative).exists() else None,before)

    def test_inspect_apply_rollback_and_refuse_local_edit(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR')) as tmp:
            root=Path(tmp);target=root/'VerseObs';pkg=root/'paquet'
            (target/'tools').mkdir(parents=True);(pkg/'payload').mkdir(parents=True)
            (target/'control_panel.html').write_bytes(b'avant')
            (target/'tools/server.js').write_bytes(b'server')
            (pkg/'payload/control_panel.html').write_bytes(b'apres')
            (pkg/'payload/nouveau.js').write_bytes(b'neuf')
            manifest={'commit':'fixture-test','files':[
                {'path':'control_panel.html','sha256':m.sha(b'apres'),'accepted_before':[m.sha(b'avant')]},
                {'path':'nouveau.js','sha256':m.sha(b'neuf'),'accepted_before':[None]}]}
            (pkg/'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(m.apply(pkg,target)['mode'],'inspection seulement')
            self.assertEqual((target/'control_panel.html').read_bytes(),b'avant')
            result=m.apply(pkg,target,True)
            self.assertEqual((target/'nouveau.js').read_bytes(),b'neuf')
            backup=Path(result['backup'])
            (target/'control_panel.html').write_bytes(b'edition locale')
            with self.assertRaises(ValueError):m.rollback(backup,True)
            (target/'control_panel.html').write_bytes(b'apres')
            m.rollback(backup,True)
            self.assertEqual((target/'control_panel.html').read_bytes(),b'avant')
            self.assertFalse((target/'nouveau.js').exists())
            (target/'control_panel.html').write_bytes(b'edition locale')
            with self.assertRaises(ValueError):m.apply(pkg,target,True)
            self.assertFalse((target/'nouveau.js').exists())
            with self.assertRaises(ValueError):m.child(target,'../outside')
            with self.assertRaises(ValueError):m.child(target,'/outside')
            with self.assertRaises(ValueError):m.child(target,'..\\outside')


if __name__=='__main__':unittest.main()
