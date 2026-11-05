"""Installation partagée, exécutée uniquement par le Python autonome vérifié."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import sys
import tarfile
import urllib.request
import zipfile


def read_manifest(path):
    with open(path,encoding='utf-8') as f:return list(csv.DictReader(f,delimiter='|'))


def verify(path,expected):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    if h.hexdigest()!=expected:raise ValueError('L’empreinte du téléchargement est incorrecte. Aucun programme téléchargé n’a été lancé.')


def extract(archive,dest):
    dest.mkdir(parents=True,exist_ok=True)
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as z:
            for item in z.infolist():
                if not (dest/item.filename).resolve().is_relative_to(dest.resolve()):raise ValueError('Chemin extérieur dans une archive')
            z.extractall(dest)
    else:
        with tarfile.open(archive,'r:gz') as t:t.extractall(dest,filter='data')


def download(url,path):
    if not url.startswith(('https://nodejs.org/dist/','https://github.com/astral-sh/python-build-standalone/releases/download/',
                           'https://files.pythonhosted.org/packages/','https://huggingface.co/rhasspy/piper-voices/resolve/')):
        raise ValueError('Source de téléchargement non autorisée')
    # Le Python autonome dispose de pip et de son magasin de certificats, sans Xcode.
    from pip._vendor import certifi
    context=ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(url,context=context,timeout=90) as response,open(path,'wb') as out:
        shutil.copyfileobj(response,out,1024*1024)


def install_voice(root,target,python,run):
    """Vérifier roue Piper, ONNX, JSON et licence avant toute installation."""
    runtime=root/'.runtime';runtime.mkdir(parents=True,exist_ok=True)
    receipt=runtime/'voix-verifiee.json';receipt.unlink(missing_ok=True)
    rows=read_manifest(root/'tools/distribution/voix.tsv')
    wheel=next(r for r in rows if r['kind']=='piper' and r['target']==target)
    selected=[wheel]+[r for r in rows if r['kind']=='model' and r['target']=='all']
    staging=runtime/'voix-telechargee';staging.mkdir(exist_ok=True)
    models=root/'tools/ecoute/modeles'
    if models.is_symlink() or staging.is_symlink():raise ValueError('Le dossier des voix ne doit pas être un lien.')
    try:
        for row in selected:
            if Path(row['filename']).name!=row['filename']:raise ValueError('Nom de fichier voix incorrect')
            path=staging/row['filename']
            if path.is_symlink():raise ValueError('Le fichier voix ne doit pas être un lien.')
            download(row['url'],path);verify(path,row['sha256'])
        models.mkdir(parents=True,exist_ok=True)
        for row in selected[1:]:os.replace(staging/row['filename'],models/row['filename'])
        run([python,'-m','pip','install','--only-binary=:all:',staging/wheel['filename']])
        receipt.write_text(json.dumps({'target':target,'piper':'1.4.2','files':{r['filename']:r['sha256'] for r in selected}}),encoding='utf-8')
    finally:
        shutil.rmtree(staging)


def install(root,target):
    root=root.resolve();runtime=root/'.runtime';runtime.mkdir(exist_ok=True)
    if (root/'node_modules').is_symlink():raise ValueError('Utilisez le dossier extrait du zip, pas une copie de développement.')
    if (runtime/'session.lock').exists():raise ValueError('Fermez VerseObs avant de réinstaller.')
    ready=runtime/'pret.json';ready.unlink(missing_ok=True)
    env={**os.environ,'HF_HOME':str(runtime/'modeles'),'PYTHONUTF8':'1','PIP_DISABLE_PIP_VERSION_CHECK':'1'}
    progress=runtime/'progression.json'
    def report(step,text):
        info={'step':step,'total':6,'text':text};tmp=progress.with_suffix('.part');tmp.write_text(json.dumps(info,ensure_ascii=False),encoding='utf-8');os.replace(tmp,progress)
        print('['+'#'*step+'-'*(6-step)+'] '+text,flush=True)
    with (runtime/'installation.log').open('a',encoding='utf-8') as log:
        def run(args,cwd=root):subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
        report(2,'Téléchargement du moteur de VerseObs…')
        rows=read_manifest(root/'tools/distribution/runtimes.tsv')
        row=next(r for r in rows if r['kind']=='node' and r['target']==target)
        archive=runtime/'node.archive';staging=runtime/'node-nouveau'
        download(row['url'],archive);verify(archive,row['sha256'])
        if staging.exists():shutil.rmtree(staging)
        extract(archive,staging)
        node_home=runtime/'node'
        if node_home.exists():shutil.rmtree(node_home)
        (staging/row['folder']).rename(node_home);shutil.rmtree(staging);archive.unlink()
        windows=target=='win32-x64'
        node=node_home/('node.exe' if windows else 'bin/node')
        npm=node_home/('node_modules/npm/bin/npm-cli.js' if windows else 'lib/node_modules/npm/bin/npm-cli.js')
        env['PATH']=str(node.parent)+os.pathsep+env.get('PATH','')
        report(3,'Préparation du Studio…')
        run([node,npm,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'])
        report(4,'Préparation de l’écoute…')
        ecoute=root/'tools/ecoute';venv=ecoute/'.venv'
        if venv.is_symlink():raise ValueError('Le dossier de l’écoute ne doit pas être un lien.')
        run([sys.executable,'-m','venv','--clear',venv])
        python=venv/('Scripts/python.exe' if windows else 'bin/python')
        run([python,'-m','pip','install','--only-binary=:all:','-r','requirements.txt'],cwd=ecoute)
        report(5,'Téléchargement de Piper et des modèles — patienter, environ 720 Mo…')
        install_voice(root,target,python,run)
        run([python,'ecoute.py','--preparer','--tout-local'],cwd=ecoute)
        run([python,'-c','from voix import LocalTTS; v=LocalTTS(); assert v.path.is_file(); v.prepare(); print("Voix Piper prête, sans lecture sonore.")'],cwd=ecoute)
        ready.write_text(json.dumps({'target':target,'node_sha256':row['sha256'],'python':sys.version.split()[0]}),encoding='utf-8')
        report(6,'VerseObs est prêt. Fermez cette fenêtre, puis ouvrez « Lancer VerseObs ».')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--target',required=True,choices=['darwin-arm64','darwin-x64','win32-x64']);a=p.parse_args()
    try:install(Path(a.root),a.target)
    except Exception as error:
        print('Installation interrompue. Vérifiez Internet et l’espace libre, puis relancez Installer VerseObs. Détails : Application/.runtime/installation.log',file=sys.stderr)
        print(type(error).__name__+': '+str(error),file=sys.stderr)
        sys.exit(1)
