# Vérifier chaque zip extrait, avec ses propres dépendances npm de production.
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT=Path.cwd()
records=json.loads((ROOT/'artifacts/livraison-2.93/verification.json').read_text())
results=[]
probe=r'''const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.argv[1],port=Number(process.argv[2]);
assert.ok(require.resolve('ws',{paths:[root]}).startsWith(path.join(root,'node_modules')),'dépendance ws propre au zip');
const {start}=require(path.join(root,'tools/distribution/lancer.cjs'));
const fixture=path.join(root,'enfant-factice.cjs');
fs.writeFileSync(fixture,"process.stdin.on('data',()=>process.exit(0));process.stdin.on('end',()=>process.exit(0));");
(async()=>{let app;try {
 app=await start({root,port,childCommand:process.execPath,childArgs:[fixture],openBrowser:()=>{}});
 for(const page of ['control_panel.html','remote.html','browser_source.html','sous-titres.html']) {
  const url=new URL('/'+page,app.url),response=await fetch(url);
  // remote.html n’est servi que par le listener LAN appairé, pas le port régie.
  assert.equal(response.status,page==='remote.html'?404:200,page);
  const html=page==='remote.html'?fs.readFileSync(path.join(root,page),'utf8'):await response.text();
  for(const match of html.matchAll(/(?:src|href)="((?:assets|data)\/[^"#]+)"/g)) {
   assert.equal((await fetch(new URL('/'+match[1],app.url))).status,200,match[1]);
  }
 }
 await app.stop();assert.equal(app.child.exitCode,0);assert.equal(app.server.listening,false);
 await assert.rejects(fetch(app.url));
 console.log('ZIP_OK');
} finally {if(app)await app.stop();}})().catch(e=>{console.error(e);process.exitCode=1});'''
for index,item in enumerate(records):
    archive=Path(item['path'])
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==item['sha256']
    with tempfile.TemporaryDirectory(prefix='verseobs-zip-',dir=os.environ.get('TMPDIR')) as folder:
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            for name in z.namelist():assert (Path(folder)/name).resolve().is_relative_to(Path(folder).resolve())
            z.extractall(folder)
        app=Path(folder)/'VerseObs/Application'
        manifest=json.loads((app/'manifest-livraison.json').read_text(encoding='utf-8'))
        assert manifest['commit']==item['commit'] and manifest['build']=='2.93'
        for name,sha in manifest['files'].items():
            assert hashlib.sha256((app/name).read_bytes()).hexdigest()==sha,name
        for name in ['tools/heard.js','tools/ecoute/voix.py','tools/ecoute/sortie_voix.py','tools/ecoute/relais_sortant.py','tools/ecoute/requirements-voix.txt','tools/distribution/voix.tsv']:
            assert name in manifest['files'],name
        subprocess.run(['python3','-m','compileall','-q',str(app/'tools/ecoute'),str(app/'tools/distribution')],check=True)
        installed=subprocess.run(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=app,capture_output=True,text=True,timeout=120)
        if installed.returncode:
            results.append({'system':item['system'],'code':installed.returncode,'phase':'npm','output':installed.stdout+installed.stderr});continue
        tested=subprocess.run(['node','-e',probe,str(app),str(18860+index)],capture_output=True,text=True,timeout=30)
        results.append({'system':item['system'],'sha256':item['sha256'],'code':tested.returncode,'phase':'lancement','output':tested.stdout+tested.stderr})
assert len(results)==2
out=ROOT/'artifacts/v293/zips-executes.json';out.write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r['code']==0 for r in results) else 1)
