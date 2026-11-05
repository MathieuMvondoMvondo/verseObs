// Gestionnaire commun : un serveur local + une Écoute, arrêt à la fermeture.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {createServer}=require('../server');
async function start(options={}) {
  const root=options.root || path.resolve(__dirname,'../..'),runtime=path.join(root,'.runtime');
  fs.mkdirSync(runtime,{recursive:true});
  const lock=path.join(runtime,'session.lock');
  if(fs.existsSync(lock)) {
    const pid=Number(fs.readFileSync(lock,'utf8'));
    if(!Number.isInteger(pid)||pid<1)throw Error('Une session précédente est incomplète. Réinstallez dans un nouveau dossier.');
    try { process.kill(pid,0);throw Error('VerseObs est déjà ouvert. Fermez sa première fenêtre.'); }
    catch(e){if(e.code!=='ESRCH')throw e;fs.unlinkSync(lock);}
  }
  fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
  let server,child,stopping=null;
  const sockets=new Set();
  const stop=()=> {
    if(stopping)return stopping;
    stopping=(async()=>{
      if(server){for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));}
      if(child && child.pid && child.exitCode===null && child.signalCode===null) {
        await new Promise(resolve=>{
          const timer=setTimeout(()=>child.kill('SIGKILL'),8000);
          child.once('exit',()=>{clearTimeout(timer);resolve();});
          child.stdin.on('error',()=>{});child.stdin.end('ARRETER\n');
        });
      }
      fs.rmSync(lock,{force:true});
      console.log('VerseObs et l’écoute sont arrêtés.');
    })();
    return stopping;
  };
  try {
    if(['installation.lock','installation.windows.lock'].some(name=>fs.existsSync(path.join(runtime,name))))
      throw Error('Une installation est en cours. Attendez sa fin avant de lancer VerseObs.');
    let port=options.port || 8080;
    for(let attempt=0;attempt<20;attempt++,port++) {
      server=createServer(port);
      server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
      const error=await new Promise(resolve=>{
        server.once('error',resolve);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',resolve);resolve(null);});
      });
      if(!error)break;
      server.close();server=null;
      if(error.code!=='EADDRINUSE'||attempt===19)throw error;
    }
    const url=`http://127.0.0.1:${port}/control_panel.html`,windows=process.platform==='win32';
    const ecoute=path.join(root,'tools/ecoute');
    const command=options.childCommand || (windows ? path.join(ecoute,'.venv/Scripts/python.exe') : '/bin/bash');
    const args=options.childArgs || (windows ? [path.join(ecoute,'ecoute.py'),'--priorite-basse'] : [path.join(ecoute,'lancer-ecoute-mac.command')]);
    child=spawn(command,[...args,'--arret-stdin','--relais',`ws://127.0.0.1:${port}/verseobs-relay`],{
      cwd:options.childCommand ? root : ecoute,
      env:{...process.env,HF_HOME:path.join(runtime,'modeles'),PYTHONUTF8:'1'},stdio:['pipe','inherit','inherit'],windowsHide:true,
    });
    child.stdin.on('error',()=>{});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.on('exit',()=>{if(!stopping){process.exitCode=1;stop().then(()=>{if(options.onUnexpectedExit)options.onUnexpectedExit();}).catch(e=>{console.error(e.message);if(options.onUnexpectedExit)options.onUnexpectedExit();});}});
    console.log('VerseObs est ouvert. Fermez cette fenêtre pour tout arrêter.');
    if(options.openBrowser)await options.openBrowser(url);
    else {
      // Aucune interpolation dans une commande shell, même si le dossier comporte des espaces.
      const opener=windows ? spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'}) : spawn('/usr/bin/open',[url],{stdio:'ignore'});
      opener.on('error',()=>console.log('Ouvrez cette adresse dans votre navigateur : '+url));
    }
    return {url,stop,child,server};
  } catch(e) {await stop();throw e;}
}
function runCLI(options={},args=process.argv.slice(2)) {
  start({...options,onUnexpectedExit:()=>process.exit(1)}).then(app=>{
    const finish=()=>app.stop().then(()=>process.exit(Number(process.exitCode)||0)).catch(()=>process.exit(1));
    ['SIGHUP','SIGINT','SIGTERM'].forEach(signal=>process.on(signal,finish));
    if(args.includes('--stdin')) {
      process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(s.includes('ARRETER'))finish();});process.stdin.on('end',finish);process.stdin.resume();
    }
  }).catch(error=>{console.error('VerseObs ne peut pas démarrer : '+error.message);process.exitCode=1;});
}
module.exports={start,runCLI};
if(require.main===module)runCLI();
