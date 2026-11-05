"""Tests hors machine utilisateur : bootstrap Mac, téléchargement et arrêt portable."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('distribution',ROOT/'tools/distribution/installer.py')
assert SPEC and SPEC.loader
DIST=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(DIST)

class Portable(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'),prefix='verseobs-paquet-')
        self.root=Path(self.tmp.name)/'VerseObs avec espaces';self.root.mkdir()
    def tearDown(self):self.tmp.cleanup()
    def test_archive_alteree_refusee_avant_extraction(self):
        archive=self.root/'node.tar.gz';archive.write_bytes(b'fichier altere')
        with self.assertRaisesRegex(ValueError,'empreinte'):
            DIST.verify(archive,'0'*64)
        DIST.verify(archive,hashlib.sha256(archive.read_bytes()).hexdigest())
    def test_archive_chemin_exterieur_refuse(self):
        archive=self.root/'node.tar.gz'
        with tarfile.open(archive,'w:gz') as t:
            item=tarfile.TarInfo('../dehors');item.size=1;t.addfile(item,io.BytesIO(b'x'))
        with self.assertRaises(Exception):DIST.extract(archive,self.root/'dest')
        self.assertFalse((self.root/'dehors').exists())
    def test_installation_commune_sans_compilateur_ni_python_systeme(self):
        (self.root/'tools/distribution').mkdir(parents=True)
        (self.root/'tools/ecoute').mkdir(parents=True)
        archive=self.root/'fixture.tar.gz'
        with tarfile.open(archive,'w:gz') as t:
            data=b'fixture';item=tarfile.TarInfo('node-test/bin/node');item.mode=0o755;item.size=len(data);t.addfile(item,io.BytesIO(data))
        sha=hashlib.sha256(archive.read_bytes()).hexdigest()
        (self.root/'tools/distribution/runtimes.tsv').write_text('kind|target|folder|url|sha256\nnode|darwin-arm64|node-test|https://nodejs.org/dist/fixture|'+sha+'\n')
        calls=[]
        def run(args,**kwargs):calls.append((args,kwargs));return subprocess.CompletedProcess(args,0)
        with patch.object(DIST,'download',side_effect=lambda url,dest:shutil.copy(archive,dest)),patch.object(DIST.subprocess,'run',side_effect=run),patch.object(DIST,'install_voice') as voice:
            DIST.install(self.root,'darwin-arm64')
        voice.assert_called_once()
        self.assertEqual(voice.call_args.args[:2],(self.root,'darwin-arm64'))
        self.assertTrue((self.root/'.runtime/pret.json').exists())
        self.assertIn('--only-binary=:all:',calls[2][0])
        self.assertEqual(calls[1][0][0],DIST.sys.executable)
        self.assertIn('--ignore-scripts',calls[0][0])
        self.assertIn('--tout-local',calls[3][0])
        self.assertIn('v.prepare()',calls[4][0][-1])
        self.assertTrue(all(c[1]['env']['HF_HOME'].startswith(str(self.root)) for c in calls))
    def test_voix_installee_et_verifiee_avant_pip(self):
        tools=self.root/'tools/distribution';tools.mkdir(parents=True)
        content=b'composant voix verifie'
        sha=hashlib.sha256(content).hexdigest()
        names=['piper_tts-1.4.2-cp39-abi3-win_amd64.whl','en_US-ljspeech-medium.onnx','en_US-ljspeech-medium.onnx.json','MODEL_CARD']
        manifest='kind|target|filename|url|sha256\n'+''.join(
            f"{'piper' if i==0 else 'model'}|{'win32-x64' if i==0 else 'all'}|{name}|https://fixture/{name}|{sha}\n" for i,name in enumerate(names))
        (tools/'voix.tsv').write_text(manifest)
        calls=[]
        def run(args,**kwargs):
            self.assertTrue(all((self.root/'tools/ecoute/modeles'/name).read_bytes()==content for name in names[1:]))
            wheel=Path(args[-1]);self.assertEqual(wheel.read_bytes(),content)
            calls.append(args)
        with patch.object(DIST,'download',side_effect=lambda url,p:p.write_bytes(content)):
            DIST.install_voice(self.root,'win32-x64',Path('python-fixture'),run)
        self.assertEqual(len(calls),1)
        self.assertIn('--only-binary=:all:',calls[0])
        self.assertEqual(json.loads((self.root/'.runtime/voix-verifiee.json').read_text())['files'][names[1]],sha)
        for altered in names:
            with self.subTest(altered=altered):
                calls.clear()
                def download(url,path):path.write_bytes(b'altere' if url.endswith('/'+altered) else content)
                with patch.object(DIST,'download',side_effect=download):
                    with self.assertRaisesRegex(ValueError,'empreinte'):
                        DIST.install_voice(self.root,'win32-x64',Path('python-fixture'),run)
                self.assertEqual(calls,[])
                self.assertFalse((self.root/'.runtime/voix-verifiee.json').exists())

    def test_urls_et_empreintes_epinglees(self):
        rows=DIST.read_manifest(ROOT/'tools/distribution/runtimes.tsv')
        self.assertEqual(len(rows),6)
        self.assertEqual({(r['kind'],r['target']) for r in rows},{(k,t) for k in ['python','node'] for t in ['darwin-arm64','darwin-x64','win32-x64']})
        for row in rows:
            self.assertRegex(row['sha256'],r'^[a-f0-9]{64}$')
            self.assertTrue(row['url'].startswith(('https://nodejs.org/dist/','https://github.com/astral-sh/python-build-standalone/releases/download/')))
    def test_bootstrap_mac_sans_python_systeme_et_refus_alteration(self):
        tools=self.root/'tools/distribution';tools.mkdir(parents=True)
        shutil.copy(ROOT/'tools/distribution/installer-mac.sh',tools)
        (tools/'installer.py').write_text('# fixture\n')
        fake=self.root/'faux';fake.mkdir()
        def command(name,text):
            p=fake/name;p.write_text('#!/bin/bash\n'+text);p.chmod(0o755)
        command('uname','printf "Darwin\\n"\n')
        command('sysctl','printf "1\\n"\n')
        command('curl','while [[ "$1" != --output ]]; do shift; done; cp "$FIXTURE" "$2"\n')
        command('python3','printf "INTERDIT" >&2; exit 99\n')
        archive=self.root/'fixture.tar.gz'
        with tarfile.open(archive,'w:gz') as t:
            body=b'#!/bin/bash\nprintf "autonome uniquement\\n"\n';item=tarfile.TarInfo('python/bin/python3');item.mode=0o755;item.size=len(body);t.addfile(item,io.BytesIO(body))
        manifest=tools/'runtimes.tsv'
        def run(sha):
            manifest.write_text('kind|target|folder|url|sha256\npython|darwin-arm64|python|https://github.com/fixture.tar.gz|'+sha+'\n')
            return subprocess.run(['bash',str(tools/'installer-mac.sh'),str(self.root)],env={**os.environ,'PATH':str(fake)+':'+os.environ['PATH'],'FIXTURE':str(archive)},text=True,capture_output=True)
        good=run(hashlib.sha256(archive.read_bytes()).hexdigest());self.assertEqual(good.returncode,0,good.stdout+good.stderr);self.assertIn('autonome uniquement',good.stdout)
        bad=run('0'*64);self.assertNotEqual(bad.returncode,0);self.assertIn('empreinte',bad.stdout+bad.stderr)
        self.assertNotIn('INTERDIT',good.stdout+good.stderr+bad.stdout+bad.stderr)

if __name__=='__main__':unittest.main()
