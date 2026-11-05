'use strict';
// Régressions des transitions de version : vrai Studio et vrai relais.
const assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const {WebSocket}=require('ws');
const {createServer}=require('../tools/server');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let i=0;i<180;i++){if(f())return;await wait(25);}throw Error('Délai : '+label);}
(async()=>{
 const port=18766,base='http://127.0.0.1:'+port;
 const server=createServer(port);await new Promise(r=>server.listen(port,'127.0.0.1',r));
 const engine=new WebSocket(`ws://127.0.0.1:${port}/verseobs-relay`,{headers:{Origin:base}});await new Promise(r=>engine.once('open',r));
 const commands=[],errors=[];engine.on('message',r=>commands.push(JSON.parse(r)));
 let n=0,dom,w,d,held,delay;
 const send=m=>engine.send(JSON.stringify({id:'heard-loading-'+ ++n,ts:Date.now(),...m}));
 const state=s=>send({type:'caption_engine',state:{status:s,listenId:'heard-loading',verseReady:true}});
 const say=(version='lsg')=>send({type:'heard_verse',proposal:{listenId:'heard-loading',version,bookId:45,chapter:6,verse:23,verseEnd:23,method:'reference',confidence:1,end:Date.now(),heard:'Romains 6 verset 23'}});
 function changeVersion(id){d.getElementById('version-select').value=id;d.getElementById('version-select').dispatchEvent(new w.Event('change',{bubbles:true}));}
 async function open(delayed=[]){
  if(dom)dom.window.close();held={};delay=new Set(delayed);
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  dom=await JSDOM.fromURL(base+'/control_panel.html',{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(win){
   const failed=new Set(),xhrOpen=win.XMLHttpRequest.prototype.open,xhrSend=win.XMLHttpRequest.prototype.send;
   win.XMLHttpRequest.prototype.open=function(method,url,...args){this._testBible=String(url).match(/bibles\/(\w+)\.json/)?.[1];return xhrOpen.call(this,method,url,...args);};
   win.XMLHttpRequest.prototype.send=function(...args){if(failed.has(this._testBible)){setTimeout(()=>this.onerror&&this.onerror(),0);return;}return xhrSend.apply(this,args);};
   win.fetch=(url,opt)=>{const get=()=>fetch(new URL(url,win.location.href),opt);const id=String(url).match(/bibles\/(\w+)\.json/)?.[1];
    if(delay.has(id))return new Promise((resolve,reject)=>{held[id]={release:()=>resolve(get()),fail:()=>{failed.add(id);reject(Error('Réseau simulé indisponible'));}};});return get();};
   win.matchMedia=()=>({matches:false});win.scrollTo=()=>{};
   Object.defineProperty(win.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;},configurable:true});
   win.URL.createObjectURL=()=> 'blob:test';win.URL.revokeObjectURL=()=>{};
  }});
  w=dom.window;d=w.document;
  await until(()=>d.querySelectorAll('.chapter-verse').length===36,'chapitre initial');
  state('listening');await until(()=>d.getElementById('heard-state').textContent==='À l’écoute','écoute');
 }
 try{
  await open(['nbs']);say();await until(()=>!d.getElementById('heard-proposal').hidden,'proposition LSG');
  changeVersion('nbs');await until(()=>!!held.nbs,'NBS manuelle retardée');
  assert.equal(d.getElementById('version-select').disabled,true);
  d.getElementById('heard-load').click();await until(()=>d.getElementById('preview-ref').textContent==='Romains 6:23','carte prête');
  assert.equal(d.getElementById('version-select').disabled,false);
  assert.equal(d.getElementById('version-loading').hidden,true);
  held.nbs.release();await wait(80);
  assert.equal(d.getElementById('version-select').value,'lsg');assert.equal(d.getElementById('version-select').disabled,false);
  console.log('ok   proposition : reprend et libère le chargement manuel supplanté');

  await open();say();await until(()=>!d.getElementById('heard-proposal').hidden,'proposition avant changement');
  changeVersion('nbs');await until(()=>!d.getElementById('version-select').disabled,'NBS prête');
  assert.match(d.getElementById('heard-explanation').textContent,/LSG remplace votre Nouvelle Bible Segond/);
  d.getElementById('heard-load').click();await until(()=>d.getElementById('heard-state').textContent==='Dans l’aperçu','premier chargement');
  changeVersion('nbs');await until(()=>!d.getElementById('version-select').disabled,'NBS à nouveau prête');
  assert.match(d.getElementById('heard-explanation').textContent,/LSG remplace votre Nouvelle Bible Segond/);
  assert.equal(d.getElementById('heard-load').textContent,'Recharger l’aperçu');
  d.getElementById('heard-load').click();await until(()=>d.getElementById('version-select').value==='lsg','rechargement explicite LSG');
  console.log('ok   avertissement actualisé avant Charger et Recharger');

  await open(['nbs']);say('nbs');await until(()=>!d.getElementById('heard-proposal').hidden,'NBS proposée');
  d.getElementById('heard-load').click();await until(()=>!!held.nbs,'NBS proposée en attente');
  assert.equal(d.getElementById('version-select').disabled,true);
  state('idle');await until(()=>d.getElementById('heard-proposal').hidden,'arrêt');
  assert.equal(d.getElementById('version-select').disabled,false,'arrêt libère la requête annulée immédiatement');
  held.nbs.release();await wait(80);assert.equal(d.getElementById('version-select').value,'lsg');
  console.log('ok   arrêt : chargement annulé et sélecteur libéré sans attendre le réseau');

  await open(['nbs','sem']);say('nbs');await until(()=>!d.getElementById('heard-proposal').hidden,'NBS avant requête plus récente');
  d.getElementById('heard-load').click();await until(()=>!!held.nbs,'requête carte');
  changeVersion('sem');await until(()=>!!held.sem,'requête manuelle plus récente');
  state('idle');await until(()=>d.getElementById('heard-proposal').hidden,'carte retirée');
  assert.equal(d.getElementById('version-select').disabled,true,'le nouveau chargement garde son verrou');
  held.nbs.release();await wait(80);assert.equal(d.getElementById('version-select').disabled,true);
  held.sem.release();await until(()=>!d.getElementById('version-select').disabled,'Semeur prête');
  assert.equal(d.getElementById('version-select').value,'sem');
  console.log('ok   annulation ancienne : ne libère pas une requête plus récente');

  await open(['nbs']);say('nbs');await until(()=>!d.getElementById('heard-proposal').hidden,'NBS erreur');
  d.getElementById('heard-load').click();await until(()=>!!held.nbs,'requête erreur');held.nbs.fail();
  await until(()=>!d.getElementById('heard-load').disabled,'erreur rendue à l’opérateur');
  assert.equal(d.getElementById('version-select').disabled,false);assert.equal(d.getElementById('version-loading').hidden,true);
  assert.equal(d.getElementById('version-select').value,'lsg');
  console.log('ok   erreur : chargement nettoyé, version réellement chargée conservée');
  assert.deepEqual(commands.filter(x=>['show_verse','show_text','hide'].includes(x.type)),[]);assert.deepEqual(errors,[]);
 }finally{if(dom)dom.window.close();engine.terminate();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
