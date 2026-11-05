"""Lanceurs Mac éprouvés sous Bash avec OS/trousseau simulés ; pas un test matériel."""
import ast
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent

class MacLaunchers(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="verseobs-mac-", dir=os.environ.get("TMPDIR"))
        self.root=Path(self.tmp.name)/"Écoute avec espaces"
        self.root.mkdir()
        self.bin=Path(self.tmp.name)/"bin";self.bin.mkdir()
        self.log=Path(self.tmp.name)/"calls.jsonl"
        self.store=Path(self.tmp.name)/"faux-trousseau.json"
        self.env={k:v for k,v in os.environ.items() if not k.startswith("VERSEOBS_ECOUTE_")}
        self.env.update(PATH=str(self.bin)+":"+self.env["PATH"],USER="test-mac",LOG=str(self.log),STORE=str(self.store))
        for name in ("installer-mac.command","lancer-ecoute-mac.command","configurer-cles-mac.command"):
            shutil.copy(HERE/name,self.root/name)
        (self.root/"requirements.txt").write_text("sounddevice\n")
        self.stub("uname","#!/bin/sh\nprintf 'Darwin\\n'\n")
        self.stub("python3",f'''#!{sys.executable}
import json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['LOG'],'a') as f:f.write(json.dumps({{'args':args,'cwd':os.getcwd(),'keys':{{k:v for k,v in os.environ.items() if k.startswith('VERSEOBS_ECOUTE_')}}}})+'\\n')
if args==['-m','venv','.venv']:
 p=pathlib.Path('.venv/bin');p.mkdir(parents=True);(p/'python').symlink_to(pathlib.Path(__file__).resolve())
sys.exit(12 if os.environ.get('FAIL_INSTALL') and 'install' in args else 0)
''')
        self.stub("security",f'''#!{sys.executable}
import json,os,pathlib,shlex,sys
p=pathlib.Path(os.environ['STORE']);data=json.loads(p.read_text()) if p.exists() else {{}}
args=sys.argv[1:]
if args==['-i']:
 args=shlex.split(sys.stdin.readline());data[args[args.index('-s')+1]]=args[args.index('-w')+1];p.write_text(json.dumps(data))
elif args and args[0]=='find-generic-password':
 key=args[args.index('-s')+1]
 if key not in data:sys.exit(44)
 print(data[key])
else:sys.exit(1)
''')
    def tearDown(self): self.tmp.cleanup()
    def stub(self,name,text):
        p=self.bin/name;p.write_text(text);p.chmod(0o755)
    def run_script(self,name,*args,input="",**env):
        return subprocess.run(["bash",str(self.root/name),*args],input=input,text=True,capture_output=True,env={**self.env,**env},cwd=self.tmp.name)
    def calls(self):return [json.loads(x) for x in self.log.read_text().splitlines()]
    def test_install_and_launch_preserve_arguments_and_directory(self):
        result=self.run_script("installer-mac.command")
        self.assertEqual(result.returncode,0,result.stderr)
        calls=self.calls()
        self.assertIn(["-m","venv",".venv"],[c["args"] for c in calls])
        self.assertIn(["-m","pip","install","-r","requirements.txt"],[c["args"] for c in calls])
        self.assertIn(["ecoute.py","--preparer"],[c["args"] for c in calls])
        result=self.run_script("lancer-ecoute-mac.command","--fichier","culte avec espaces.wav","--tout-local")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.calls()[-1]["args"],["ecoute.py","--priorite-basse","--fichier","culte avec espaces.wav","--tout-local"])
        self.assertTrue(all(c["cwd"]==str(self.root) for c in self.calls()))
    def test_install_failure_stops_before_models(self):
        result=self.run_script("installer-mac.command",FAIL_INSTALL="1")
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any("--preparer" in c["args"] for c in self.calls()))
    def test_failed_keychain_write_is_not_reported_as_success(self):
        self.stub("security", "#!/bin/sh\nexit 0\n")
        result=self.run_script("configurer-cles-mac.command",input="cle-factice\n")
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn("Clé enregistrée",result.stdout)
        self.assertNotIn("cle-factice",result.stdout+result.stderr)
    def test_masked_input_keychain_roundtrip_no_plaintext_in_product(self):
        fixture='factice-"\\ ;$(false)'
        result=self.run_script("configurer-cles-mac.command",input=fixture+"\ncle-openai-factice\n\n")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertNotIn(fixture,result.stdout+result.stderr)
        self.run_script("installer-mac.command")
        result=self.run_script("lancer-ecoute-mac.command","--liste")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.calls()[-1]["keys"]["VERSEOBS_ECOUTE_ANTHROPIC_CLE"],fixture)
        self.assertEqual(self.calls()[-1]["keys"]["VERSEOBS_ECOUTE_OPENAI_CLE"],"cle-openai-factice")
        result=self.run_script("lancer-ecoute-mac.command","--tout-local")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.calls()[-1]["keys"],{})
        for p in self.root.glob("*"):
            if p.is_file(): self.assertNotIn(fixture,p.read_text())
        source=(self.root/"configurer-cles-mac.command").read_text()
        self.assertIn("read -r -s",source)
        self.assertNotIn('security add-generic-password',source) # jamais la clé en argv
        for p in self.root.glob("*.command"):
            self.assertNotRegex(p.read_text(),r"\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY)\b")

class MacPythonPortability(unittest.TestCase):
    def test_service_coreaudio_and_posix_priority(self):
        import ecoute
        import moteur
        devices=[dict(name="Micro Mac",max_input_channels=1,hostapi=0,default_samplerate=48000),dict(name="Sortie Mac",max_input_channels=0,hostapi=0)]
        sound=types.SimpleNamespace(query_hostapis=lambda:[{"name":"Core Audio"}],query_devices=lambda:devices)
        proc=types.SimpleNamespace(cpu_percent=lambda _:None,nice=lambda n:priorities.append(n))
        priorities=[]
        with patch.dict(sys.modules,{"sounddevice":sound,"psutil":types.SimpleNamespace(Process=lambda:proc)}), patch.object(ecoute.os,"name","posix"), patch.object(sys,"platform","darwin"):
            service=ecoute.Service(ecoute.parse(["--priorite-basse","--tout-local"]))
            self.assertEqual(priorities,[10])
            self.assertIs(service.proc,proc)
            stream=io.StringIO()
            with contextlib.redirect_stdout(stream): ecoute.main(["--liste"])
            self.assertIn("Micro Mac",stream.getvalue());self.assertIn("Core Audio",stream.getvalue());self.assertNotIn("Sortie Mac",stream.getvalue())
            self.assertEqual(moteur.list_devices()[0]["index"],0)
        # Tous les imports sont portables et aucune constante de chemin Windows n’est requise.
        tree=ast.parse((HERE/"ecoute.py").read_text())
        imports=[n.module for n in ast.walk(tree) if isinstance(n,ast.ImportFrom)]+[a.name for n in ast.walk(tree) if isinstance(n,ast.Import) for a in n.names]
        self.assertFalse(any(x and (x.startswith("win32") or x=="winreg") for x in imports))
        for n in ast.walk(tree):
            if isinstance(n,ast.Constant) and isinstance(n.value,str):
                self.assertNotRegex(n.value,r"[A-Za-z]:\\\\|Scripts\\\\|python\.exe")

if __name__=="__main__": unittest.main()
