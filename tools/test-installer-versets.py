import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import os
spec=importlib.util.spec_from_file_location('installer',Path(__file__).with_name('installer-versets.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class InstallerTest(unittest.TestCase):
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
