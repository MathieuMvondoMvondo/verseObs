// Vraie carte + audio original. Les PTS sont ceux des captures, jamais leur rang.
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
const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'});assert.equal(revision.status,0);const commit=revision.stdout.trim();
const out=path.join(ROOT,'artifacts/verset/demo-'+sceneNumber);fs.mkdirSync(out,{recursive:true});
const data=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/heard-demo.json'))).clips[sceneNumber];
const audioRoot=process.env.DEMO_AUDIO_ROOT;
if(!audioRoot)throw new Error('DEMO_AUDIO_ROOT requis : WAV originaux du banc');
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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let beat;
try{
 await page.goto(base+'/control_panel.html');await page.waitForSelector('.chapter-verse');
 const state={status:'listening',listenId:'demo-heard',file:true,source:'Démonstration · transcription enregistrée',verses:'Rejeu de transcription enregistrée · 11 versions disponibles (Crampon exclu).'};
 send({type:'caption_engine',state});beat=setInterval(()=>send({type:'caption_engine',state}),1000);
 await page.waitForFunction(()=>document.querySelector('#heard-state').textContent==='À l’écoute');
 await sleep(3300); // laisser disparaître le toast de démarrage existant
 await page.evaluate(scene=>{
  const e=document.createElement('div');e.textContent='Démonstration — '+(scene===2?'citation sans référence':'référence dite')+' — Audio du 11/10, transcription enregistrée';
  e.style.cssText='position:fixed;z-index:9999;top:0;left:73px;right:0;background:#e6e2da;color:#17181a;padding:8px 18px;font:14px Inter,sans-serif;text-align:center;';document.body.append(e);
 },sceneNumber);
 const frames=path.join(out,'frames');fs.rmSync(frames,{recursive:true,force:true});fs.mkdirSync(frames,{recursive:true});
 for(const name of ['demo.mp4','mesures.json'])fs.rmSync(path.join(out,name),{force:true});
 fs.writeFileSync(path.join(frames,'00000.png'),await page.screenshot());
 const timeline=[{at:0,file:'00000.png',proposal:false}];
 python.stdin.write('start\n');const origin=await started,duration=data.end-data.start+2;
 let appeared=0,loaded=false,actualRef='',firstFrame=null;const delays=[];
 while(Date.now()<origin*1000+duration*1000){
  const visible=await page.locator('#heard-proposal').isVisible();
  if(visible&&!appeared){
   appeared=Date.now();actualRef=await page.locator('#heard-reference').textContent();
   const p=events.filter(x=>x.type==='heard_verse').at(-1).proposal;delays.push((appeared-p.end)/1000);
  }
  if(appeared&&!loaded&&Date.now()-appeared>2200){await page.locator('#heard-load').click();loaded=true;}
  const at=(Date.now()-origin*1000)/1000;if(at>=duration)break;
  const png=await page.screenshot(),file=String(timeline.length).padStart(5,'0')+'.png';
  fs.writeFileSync(path.join(frames,file),png);timeline.push({at,file,proposal:visible});
  if(visible&&firstFrame===null){firstFrame=at;fs.writeFileSync(path.join(out,'carte.png'),png);}
  await sleep(100);
 }
 assert.ok(appeared,'une proposition doit réellement apparaître');assert.ok(loaded);assert.ok(firstFrame!==null);
 assert.equal(commandLog.filter(x=>['show_verse','show_text'].includes(x.type)).length,0);assert.deepEqual(errors,[]);
 const concat=['ffconcat version 1.0'];
 for(let i=0;i<timeline.length;i++){
  const dt=(timeline[i+1]?.at??duration)-timeline[i].at;assert.ok(dt>0,'horodatages strictement croissants');
  concat.push("file 'frames/"+timeline[i].file+"'",'duration '+dt.toFixed(6));
 }
 concat.push("file 'frames/"+timeline.at(-1).file+"'");
 const manifest=path.join(out,'frames.ffconcat');fs.writeFileSync(manifest,concat.join('\n')+'\n');
 const video=path.join(out,'demo.mp4');
 const result=spawnSync('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',manifest,'-ss',String(data.start),'-t',String(data.end-data.start),'-i',audio,'-filter_complex','[1:a]apad=pad_dur=2[a]','-map','0:v','-map','[a]','-vf','fps=10','-c:v','libx264','-preset','fast','-threads','2','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-t',String(duration),'-movflags','+faststart',video],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const proofTimes={before:Math.max(0,firstFrame-1),after:Math.min(duration-.1,firstFrame+1)};
 for(const [name,t] of Object.entries(proofTimes)){
  const extract=spawnSync('ffmpeg',['-v','error','-y','-ss',String(t),'-i',video,'-frames:v','1',path.join(out,'mp4-'+name+'.png')],{encoding:'utf8'});
  assert.equal(extract.status,0,extract.stderr);
 }
 fs.writeFileSync(path.join(out,'mesures.json'),JSON.stringify({commit,sceneNumber,mode:'audio original + ASR enregistrée ; recherche actuelle, aperçu seul ; captures horodatées',source:audio,span:[data.start,data.end],reference:actualRef,delays_from_recorded_audio_end:delays,video_first_proposal_s:firstFrame,proof_times_seconds:proofTimes,timeline,events,errors,commands:commandLog.map(x=>x.type)},null,2));
 fs.rmSync(frames,{recursive:true});
 console.log(JSON.stringify({sceneNumber,reference:actualRef,delays,firstFrame,proofTimes,path:video}));
}finally{clearInterval(beat);python.kill();ws.terminate();await ctx.close();await browser.close();await new Promise(r=>server.close(r));}
process.exit(0);
