"""Barrières réelles, y compris après un échec. À lancer sous flock."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'artifacts/verset/verification';out.mkdir(parents=True,exist_ok=True)
env=dict(os.environ);env.pop('PYTHONPATH',None)
# Cet interpréteur sélectionne les tests Python, pas l'audio réel de browser-captions.
env.pop('ECOUTE_PYTHON',None);env.pop('STUDIO_ONLY',None)
checks=[('check',['npm','run','check'],{}),('npm-test',['npm','test'],{}),
        ('python',[os.environ.get('ECOUTE_PYTHON','python3'),'-m','unittest','discover','-s','tools/ecoute','-p','test_*.py'],{}),
        ('installer',['python3','tools/test-installer-versets.py'],{})]
for name in ['motion','studio','dock','captions','heard']:
    checks.append(('browser-'+name,['node','tests/browser-'+name+'.mjs'],{}))
# Ces trois fichiers n'ont qu'un export : les exécuter directement ne teste rien.
# Le lanceur réel appelle les fonctions, même si la suite complète a échoué plus haut.
for section in ['paired','habillages','onglet']:
    checks.append(('browser-'+section,['node','tests/browser-studio.mjs'],{'STUDIO_ONLY':section}))

def manifest():
    paths=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
    return {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths if p and (ROOT/p).is_file()}

before=manifest()
(out/'source.json').write_text(json.dumps({'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip(),'files':before},indent=2),encoding='utf-8')
results=[]
for name,cmd,extra in checks:
    t=time.monotonic();logfile=out/(name+'.log')
    with logfile.open('w') as log:
        try:code=subprocess.run(cmd,cwd=ROOT,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT,timeout=1200).returncode
        except subprocess.TimeoutExpired:code=124
    text=logfile.read_text()
    if name.startswith('browser-') and ('skipped.' in text or not text.strip()):code=125
    results.append(dict(name=name,code=code,seconds=round(time.monotonic()-t,1),command=cmd,env=extra))
    (out/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(results[-1],flush=True)
unchanged=before==manifest()
(out/'source-unchanged.json').write_text(json.dumps({'unchanged':unchanged}),encoding='utf-8')
raise SystemExit(any(x['code'] for x in results) or not unchanged)
