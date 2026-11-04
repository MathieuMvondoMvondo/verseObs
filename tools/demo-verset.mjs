// Produit un MP4 avec l'audio d'origine et la vraie carte (ASR enregistrée).
// Dépendances déjà présentes : Playwright, Chromium, Python stdlib, ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {WebSocket} from 'ws';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {createServer}=require('./server');
const sceneNumber=Number(process.env.DEMO_SCENE||0);
const out=path.join(ROOT,'artifacts/verset/demo-'+sceneNumber);fs.mkdirSync(out,{recursive:true});
const data=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/heard-demo.json'))).clips[sceneNumber];
const audioRoot=process.env.DEMO_AUDIO_ROOT;
if (!audioRoot) throw new Error('DEMO_AUDIO_ROOT requis : dossier contenant les WAV originaux du banc');
const audio=path.join(audioRoot,'extrait-'+data.clip+'.wav');assert.ok(fs.existsSync(audio));
const {chromium}=await import(process.env.PLAYWRIGHT_CORE);
const port=18770,base=`http://127.0.0.1:${port}`;
const server=createServer(port);await new Promise(r=>server.listen(port,'127.0.0.1',r));
const ws=new WebSocket(`ws://127.0.0.1:${port}/verseobs-relay`,{headers:{Origin:base}});await new Promise(r=>ws.once('open',r));
let n=0;const send=x=>ws.send(JSON.stringify({id:'demo-'+ ++n,ts:Date.now(),...x}));
const commandLog=[];ws.on('message',raw=>commandLog.push(JSON.parse(raw)));
const python=spawn(process.env.DEMO_PYTHON||'python3',[path.join(ROOT,'tools/ecoute/rejouer_versets.py'),'--scene',String(sceneNumber)],{env:{...process.env,PYTHONPATH:''},stdio:['pipe','pipe','pipe']});
const stderr=[];python.stderr.on('data',x=>stderr.push(x.toString()));
const events=[];let readyResolve,startResolve;
const ready=new Promise(r=>readyResolve=r),started=new Promise(r=>startResolve=r);
createInterface({input:python.stdout}).on('line',line=>{
  const x=JSON.parse(line);events.push(x);
  if(x.type==='ready')readyResolve();
  if(x.type==='started')startResolve(x.wall);
  if(x.type==='heard_verse')send({...x,proposal:{...x.proposal,listenId:'demo-heard'}});
});
python.on('exit',code=>{if(code)console.error('rejeu code',code,stderr.join(''));});
await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('index non prêt')),120000))]);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1280,height:1000}});
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let beat;
try {
  await page.goto(base+'/control_panel.html');await page.waitForSelector('.chapter-verse');
  const state={status:'listening',listenId:'demo-heard',file:true,source:'Démonstration · transcription enregistrée',verses:'Rejeu de transcription enregistrée · 11 versions disponibles (Crampon exclu).'};
  send({type:'caption_engine',state});beat=setInterval(()=>send({type:'caption_engine',state}),1000);
  await page.waitForFunction(()=>document.querySelector('#heard-state').textContent==='À l’écoute');
  await page.evaluate(scene=>{const e=document.createElement('div');e.textContent='DÉMONSTRATION · '+(scene===2?'Citation sans référence':'Référence dite')+' · Audio du 11/10, transcription enregistrée';e.style.cssText='position:fixed;z-index:9999;top:0;left:73px;right:0;background:#e6e2da;color:#17181a;padding:8px 18px;font:12px Inter,sans-serif;text-align:center;';document.body.append(e);},sceneNumber);
  python.stdin.write('start\n');
  const origin=await started,duration=data.end-data.start+2,fps=10;
  const frames=path.join(out,'frames');fs.mkdirSync(frames,{recursive:true});
  let appeared=0,loaded=false,actualRef='',delays=[];
  const total=Math.ceil(duration*fps);
  for(let i=0;i<total;i++){
    const target=origin*1000+i*1000/fps;
    await new Promise(r=>setTimeout(r,Math.max(0,target-Date.now())));
    const visible=await page.locator('#heard-proposal').isVisible();
    if(visible&&!appeared){
      appeared=Date.now();actualRef=await page.locator('#heard-reference').textContent();
      const p=events.filter(x=>x.type==='heard_verse').at(-1).proposal;
      delays.push((appeared-p.end)/1000);
      await page.screenshot({path:path.join(out,'carte.png')});
    }
    if(appeared&&!loaded&&Date.now()-appeared>2200){await page.locator('#heard-load').click();loaded=true;}
    const png=await page.screenshot();fs.writeFileSync(path.join(frames,String(i).padStart(5,'0')+'.png'),png);
  }
  assert.ok(appeared,'une proposition doit réellement apparaître');assert.ok(loaded);
  assert.equal(commandLog.filter(x=>['show_verse','show_text'].includes(x.type)).length,0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'mesures.json'),JSON.stringify({sceneNumber,mode:'audio original + transcription enregistrée ; recherche actuelle, aperçu seul',source:audio,span:[data.start,data.end],reference:actualRef,delays_from_recorded_audio_end:delays,events,errors,commands:commandLog.map(x=>x.type)},null,2));
  const result=spawnSync('ffmpeg',['-v','error','-y','-framerate',String(fps),'-i',path.join(frames,'%05d.png'),'-ss',String(data.start),'-t',String(data.end-data.start),'-i',audio,'-filter_complex','[1:a]apad=pad_dur=2[a]','-map','0:v','-map','[a]','-c:v','libx264','-preset','fast','-threads','2','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-t',String(duration),'-movflags','+faststart',path.join(out,'demo.mp4')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);fs.rmSync(frames,{recursive:true});
  console.log(JSON.stringify({sceneNumber,reference:actualRef,delays,path:path.join(out,'demo.mp4')}));
}finally{clearInterval(beat);python.kill();ws.terminate();await ctx.close();await browser.close();await new Promise(r=>server.close(r));}
process.exit(0);
