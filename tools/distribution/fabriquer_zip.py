"""Fabrique les deux zips sans publication, à partir d’un commit local propre."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/livraison-2.93'
OUT.mkdir(parents=True,exist_ok=True)
if subprocess.run(['git','diff','--quiet','HEAD'],cwd=ROOT).returncode:
    raise SystemExit('Commitez le candidat avant de fabriquer les zips.')
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
root_files={'control_panel.html','browser_source.html','remote.html','sous-titres.html','package.json','package-lock.json'}
distribution={'installer.py','installer-mac.sh','lancer.cjs','windows.ps1','integrite.ps1','runtimes.tsv','voix.tsv'}
def include(p):
    if p in root_files or p.startswith(('assets/','data/')) or p in ('tools/server.js','tools/captions.js','tools/heard.js'):return True
    if p.startswith('tools/distribution/'):return Path(p).name in distribution
    if p.startswith('tools/ecoute/'):
        q=Path(p)
        return len(q.parts)==3 and not q.name.startswith('test_') and q.suffix in ('.py','.txt','.cmd','.command','.md')
    return False
files=sorted(p for p in tracked if p and include(p))
for required in root_files | {'tools/distribution/installer.py','tools/distribution/lancer.cjs','tools/distribution/voix.tsv','tools/ecoute/ecoute.py','tools/ecoute/voix.py','tools/ecoute/sortie_voix.py','tools/ecoute/relais_sortant.py','tools/ecoute/requirements-voix.txt','tools/heard.js'}:
    if required not in files:raise SystemExit('Fichier manquant : '+required)
manifest={'commit':sha,'build':'2.93','files':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in files}}
results=[]
for system,extension in [('Mac','.command'),('Windows','.cmd')]:
    target=OUT/('VerseObs-2.93-'+system+'.zip')
    entries={f'VerseObs/Application/{p}':(ROOT/p).read_bytes() for p in files}
    for action in ['Installer','Lancer']:
        name=action+' VerseObs'+extension
        data=(ROOT/name).read_bytes()
        if extension=='.cmd':data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
        entries['VerseObs/'+name]=data
    name='GUIDE-'+system.upper()+'.pdf';entries['VerseObs/'+name]=(ROOT/'tools/distribution'/name).read_bytes()
    entries['VerseObs/Application/manifest-livraison.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,data in sorted(entries.items()):
            info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.create_system=3
            executable=name.endswith(('.command','.sh'))
            info.external_attr=(0o100755 if executable else 0o100644)<<16
            info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,data)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==len(entries)
        assert all('/.venv/' not in n and '/node_modules/' not in n and '/.git/' not in n for n in archive.namelist())
        for name,data in entries.items():assert archive.read(name)==data
    results.append({'system':system,'path':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'entries':len(entries),'commit':sha})
(OUT/'verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'SHA256SUMS.txt').write_text(''.join(r['sha256']+'  '+Path(r['path']).name+'\n' for r in results),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
