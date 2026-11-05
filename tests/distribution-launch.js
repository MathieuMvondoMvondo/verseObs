// Arrêt réel du gestionnaire et de son enfant, ports libérés, aucun service existant touché.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {start}=require('../tools/distribution/lancer.cjs');
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'verseobs-lanceur-'));
  const file=path.join(root,'ecoute-factice.cjs');
  fs.writeFileSync(file,"process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(s.includes('ARRETER'))process.exit(0)});process.stdin.on('end',()=>process.exit(0));");
  try {
    let url;
    const app=await start({root,port:18788,childCommand:process.execPath,childArgs:[file],openBrowser:u=>{url=u;}});
    assert.equal((await fetch(url)).status,200);
    assert.ok(app.child.pid);assert.ok(fs.existsSync(path.join(root,'.runtime/session.lock')));
    await assert.rejects(start({root,port:18789,childCommand:process.execPath,childArgs:[file],openBrowser:()=>{}}),/déjà ouvert/);
    await app.stop();assert.equal(app.child.exitCode,0);assert.equal(app.server.listening,false);
    assert.equal(fs.existsSync(path.join(root,'.runtime/session.lock')),false);
    await assert.rejects(fetch(url));
    const missing=path.join(root,'inexistant');
    await assert.rejects(start({root,port:18788,childCommand:missing,childArgs:[],openBrowser:()=>{}}));
    assert.equal(fs.existsSync(path.join(root,'.runtime/session.lock')),false);
    console.log('ok   ouverture navigateur, serveur, arrêt enfant par stdin, port libéré, double lancement et enfant absent');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
