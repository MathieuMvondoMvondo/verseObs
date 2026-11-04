"""Prépare un paquet différentiel vérifié ; ne copie jamais vers un ordinateur distant."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile
ROOT=Path(__file__).resolve().parents[1]
BASES=['9a0df90','0d70401']


def git(*args):
    return subprocess.check_output(['git','-C',str(ROOT),*args])


def main():
    p=argparse.ArgumentParser(__doc__);p.add_argument('--sortie',required=True);a=p.parse_args()
    subprocess.run(['git','-C',str(ROOT),'diff','--quiet','HEAD'],check=True)
    commit=git('rev-parse','HEAD').decode().strip()
    folder=Path(a.sortie)/('VerseObs-versets-'+commit[:7]);folder.mkdir(parents=True,exist_ok=False)
    paths=git('diff','--name-only',BASES[0],'HEAD').decode().splitlines()
    paths=[x for x in paths if x!='REPRISE.md']
    entries=[]
    for name in paths:
        data=git('show','HEAD:'+name)
        old=[]
        for base in BASES:
            result=subprocess.run(['git','-C',str(ROOT),'show',base+':'+name],capture_output=True)
            value=hashlib.sha256(result.stdout).hexdigest() if result.returncode==0 else None
            if value not in old:old.append(value)
        dest=folder/'payload'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
        entries.append(dict(path=name,sha256=hashlib.sha256(data).hexdigest(),accepted_before=old))
    (folder/'manifest.json').write_text(json.dumps(dict(commit=commit,bases=BASES,files=entries),indent=2),encoding='utf-8')
    (folder/'installer-versets.py').write_bytes(git('show','HEAD:tools/installer-versets.py'))
    (folder/'INSTALLATION.md').write_bytes(git('show','HEAD:VERSET-ENTENDU.md'))
    archive=folder.with_suffix('.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for f in folder.rglob('*'):
            if f.is_file():z.write(f,Path(folder.name)/f.relative_to(folder))
    checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(checksum+'  '+archive.name+'\n')
    print(json.dumps(dict(commit=commit,files=len(entries),zip=str(archive),sha256=checksum),indent=2))


if __name__=='__main__':main()
