// Vrais processus CLI : stdin reste ouvert lors d’une panne de l’enfant.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'verseobs-cli-'));
 try {
  for(const mode of ['panne','eof','arret']) {
   const fixture=path.join(root,mode+'.cjs');
   fs.writeFileSync(fixture,mode==='panne' ? 'setTimeout(()=>process.exit(7),150);' : "process.stdin.on('data',()=>process.exit(0));process.stdin.on('end',()=>process.exit(0));");
   const opts={root,port:18870,childCommand:process.execPath,childArgs:[fixture]};
   const source=`require(${JSON.stringify(path.resolve('tools/distribution/lancer.cjs'))}).runCLI({...${JSON.stringify(opts)},openBrowser:()=>{}},['--stdin']);`;
   const parent=spawn(process.execPath,['-e',source],{stdio:['pipe','pipe','pipe']});
   let output='',error='',ready=false;
   parent.stdout.on('data',b=>{
    output+=b;
    if(!ready && output.includes('VerseObs est ouvert.')) {
     ready=true;
     if(mode==='eof')parent.stdin.end();
     else if(mode==='arret')parent.stdin.end('ARRETER\n');
    }
   });parent.stderr.on('data',b=>error+=b);
   const code=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{parent.kill('SIGKILL');reject(Error('CLI toujours vivant : '+mode+' '+output+' '+error));},4000);
    parent.once('exit',c=>{clearTimeout(timer);resolve(c);});parent.once('error',reject);
   });
   assert.equal(code,mode==='panne'?1:0,mode+' '+error);
   assert.equal(fs.existsSync(path.join(root,'.runtime/session.lock')),false);
   assert.ok(output.includes('VerseObs et l’écoute sont arrêtés.'));
   console.log('ok   CLI '+mode+' : sortie '+code+', serveur/enfant arrêtés, stdin '+(mode==='panne'?'laissé ouvert':'fermé'));
  }
 } finally {fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
