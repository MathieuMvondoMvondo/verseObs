'use strict';
// Régressions Astra : vrai Studio JSDOM, relais et données locales.
const assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const {WebSocket}=require('ws');
const {createServer}=require('../tools/server');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let i=0;i<160;i++){if(f())return;await wait(25);}throw Error('Délai : '+label);}
(async()=>{
 const server=createServer(18765);await new Promise(r=>server.listen(18765,'127.0.0.1',r));
 const base='http://127.0.0.1:18765';let dom,engine,admin,releaseFetch;const errors=[],commands=[];
 try{
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  dom=await JSDOM.fromURL(base+'/control_panel.html',{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
   w.fetch=(url,opt)=>{const fetcher=()=>fetch(new URL(url,w.location.href),opt);if(String(url).includes('nbs.json'))return new Promise(r=>{releaseFetch=()=>r(fetcher());});return fetcher();};
   w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};
   Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;},configurable:true});
   w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  }});
  const w=dom.window,d=w.document;
  await until(()=>d.querySelectorAll('.chapter-verse').length===36,'chapitre initial');
  engine=new WebSocket('ws://127.0.0.1:18765/verseobs-relay',{headers:{Origin:base}});await new Promise(r=>engine.once('open',r));
  engine.on('message',raw=>commands.push(JSON.parse(raw)));
  let n=0;const send=m=>engine.send(JSON.stringify({id:'heard-regression-'+(++n),ts:Date.now(),...m}));
  const say=(extra={})=>send({type:'heard_verse',proposal:{listenId:'initial-test',version:'lsg',bookId:43,chapter:3,verse:16,verseEnd:18,method:'reference',confidence:1,end:Date.now(),heard:'Jean 3 versets 16 à 18',...extra}});
  send({type:'caption_engine',state:{status:'listening',listenId:'initial-test'}});
  await until(()=>d.getElementById('heard-state').textContent==='À l’écoute','écoute');
  say();await until(()=>d.getElementById('heard-reference').textContent==='Jean 3:16-18','plage proposée');
  d.getElementById('heard-load').click();await wait(80);
  assert.equal(d.getElementById('preview-ref').textContent,'Jean 3:16-18');
  assert.match(d.getElementById('preview-text').textContent,/déjà jugé/);
  console.log('ok   plage entièrement préparée, texte du dernier verset présent');
  say({version:'nbs',bookId:45,chapter:6,verse:23,verseEnd:23});
  await until(()=>d.getElementById('heard-reference').textContent==='Romains 6:23','NBS proposée');
  d.getElementById('heard-load').click();await until(()=>!!releaseFetch,'NBS en attente');
  const search=d.getElementById('search-input');search.value='Jean 1:1';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  await until(()=>d.getElementById('preview-ref').textContent==='Jean 1:1','sélection manuelle plus récente');
  releaseFetch();await wait(120);
  assert.equal(d.getElementById('preview-ref').textContent,'Jean 1:1');
  assert.notEqual(d.getElementById('heard-state').textContent,'Dans l’aperçu');
  console.log('ok   chargement retardé annulé par une sélection manuelle plus récente');
  admin=new WebSocket('ws://127.0.0.1:18765/verseobs-relay',{headers:{Origin:base}});await new Promise(r=>admin.once('open',r));
  admin.send(JSON.stringify({type:'caption_admin',action:'stop',id:'heard-stop'}));await until(()=>d.getElementById('heard-proposal').hidden,'arrêt');
  admin.send(JSON.stringify({type:'caption_admin',action:'start',id:'heard-start'}));
  await until(()=>commands.some(x=>x.type==='caption_command'&&x.action==='start'),'commande de redémarrage');
  say();await wait(80);assert.equal(d.getElementById('heard-proposal').hidden,true);
  const start=commands.filter(x=>x.type==='caption_command'&&x.action==='start').pop();
  assert.ok(start.listenId,'génération explicite sur le fil');
  send({type:'caption_engine',state:{status:'listening',listenId:start.listenId}});await wait(30);
  say();await wait(80);assert.equal(d.getElementById('heard-proposal').hidden,true,'ancienne écoute toujours refusée après acquittement');
  say({listenId:start.listenId});await until(()=>!d.getElementById('heard-proposal').hidden,'nouvelle écoute acceptée');
  console.log('ok   stop/start : acquittement obligatoire, ancienne génération rejetée');
  assert.deepEqual(commands.filter(x=>['show_verse','show_text','hide'].includes(x.type)),[]);
  assert.deepEqual(errors,[]);
 }finally{if(dom)dom.window.close();if(engine)engine.terminate();if(admin)admin.terminate();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
