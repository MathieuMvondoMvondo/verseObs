"use strict";
// Vraie régie JSDOM, données locales et relais : aucun texte fourni par le téléphone.
const assert = require("node:assert/strict");
const {JSDOM, VirtualConsole} = require("jsdom");
const {WebSocket} = require("ws");
const {createServer} = require("../tools/server");
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(f, label) {
  for (let i=0;i<200;i++) { if (f()) return; await wait(25); }
  throw Error("Délai : " + label);
}
(async () => {
  const port=18783, base=`http://127.0.0.1:${port}`;
  const server=createServer(port,{lan:{addresses:["127.0.0.2"],port:0}});
  await new Promise(r=>server.listen(port,"127.0.0.1",r));
  const sockets=[], errors=[], program=[]; let dom;
  async function socket(url, origin) {
    const ws=new WebSocket(url,{headers:{Origin:origin}}); sockets.push(ws);
    const messages=[]; ws.on("message",raw=>messages.push(JSON.parse(raw)));
    await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});
    return {ws,messages};
  }
  try {
    const vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(e.message));
    dom=await JSDOM.fromURL(base+"/control_panel.html",{resources:"usable",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
      w.fetch=(url,opt)=>fetch(new URL(url,w.location.href),opt);
      w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};
      Object.defineProperty(w.HTMLElement.prototype,"innerText",{get(){return this.textContent;},set(v){this.textContent=v;}});
    }});
    const d=dom.window.document;
    await until(()=>d.querySelectorAll(".chapter-verse").length===36,"Bible prête");
    const monitor=await socket(`ws://127.0.0.1:${port}/verseobs-relay`,base);
    monitor.ws.on("message",raw=>{const m=JSON.parse(raw);if(["show_verse","show_text","hide"].includes(m.type))program.push(m);});
    d.getElementById("remote-enable").click();
    await until(()=>d.getElementById("remote-url").value,"appairage");
    const url=new URL(d.getElementById("remote-url").value), lan=url.origin;
    for (const code of ["", "faux"]) {
      const refused=new WebSocket(lan.replace("http","ws")+"/verseobs-remote?code="+code,{headers:{Origin:lan}});
      refused.on("error",()=>{});
      const status=await new Promise(r=>refused.once("unexpected-response",(_,res)=>{res.resume();refused.terminate();r(res.statusCode);}));
      assert.equal(status,401);
    }
    assert.equal((await fetch(lan+"/data/bibles/lsg.json")).status,404);
    assert.equal((await fetch(lan+"/api/remote/bible")).status,404);
    console.log("ok   Bible inaccessible sans appairage, aucun endpoint HTTP Bible");
    const phone=await socket(lan.replace("http","ws")+"/verseobs-remote"+url.search,lan);
    const other=await socket(lan.replace("http","ws")+"/verseobs-remote"+url.search,lan);
    await until(()=>phone.messages.some(m=>m.type==="state" && m.studio && m.bible),"catalogue de la régie");
    let seq=0;
    async function command(command, selection, extra={}) {
      const ref="b"+ ++seq;
      phone.ws.send(JSON.stringify({type:"command",command,selection,ref,...extra}));
      await until(()=>phone.messages.some(m=>m.ref===ref),"réponse "+command);
      return phone.messages.find(m=>m.ref===ref);
    }
    const selection={version:"lsg",bookId:43,chapter:3,verseStart:16,verseEnd:18};
    const preview=await command("bible_preview",selection,{text:"PIRATE"});
    assert.equal(preview.type,"bible_result", JSON.stringify(preview));
    assert.equal(preview.passage.reference,"Jean 3:16-18");
    assert.match(preview.passage.text,/déjà jugé/);
    assert.ok(!preview.passage.text.includes("PIRATE"));
    assert.equal(other.messages.filter(m=>m.type==="bible_result").length,0);
    assert.equal(d.getElementById("preview-ref").textContent,"Jean 3:16");
    assert.equal(program.length,0);
    const prepared=await command("bible_prepare",selection);
    assert.equal(prepared.type,"bible_result");assert.equal(prepared.prepared,true);
    assert.equal(d.getElementById("preview-ref").textContent,"Jean 3:16-18");
    assert.match(d.getElementById("preview-text").textContent,/déjà jugé/);
    assert.equal(program.length,0);
    console.log("ok   plage exacte, réponse privée, préparation régie sans SHOW");
    for (const bad of [null, {...selection,bookId:"__proto__"},{...selection,chapter:0},{...selection,verseEnd:15},{...selection,verseEnd:177},{...selection,chapter:300},{...selection,version:"../../secret"}]) {
      assert.equal((await command("bible_prepare",bad)).type,"error");
    }
    assert.equal((await command("bible_prepare",{...selection,verseStart:35,verseEnd:40})).reason,"invalid_selection");
    assert.equal((await command("show_verse",selection)).reason,"forbidden");
    const version=d.getElementById("version-select");version.value="nbs";
    version.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
    await until(()=>!version.disabled,"NBS chargée");
    const before=d.getElementById("preview-ref").textContent;
    assert.equal((await command("bible_prepare",selection)).reason,"version_changed");
    assert.equal(version.value,"nbs");assert.equal(d.getElementById("preview-ref").textContent,before);
    const nbs=await command("bible_preview",{...selection,version:"nbs"});
    assert.equal(nbs.passage.version,"nbs");assert.notEqual(nbs.passage.text,preview.passage.text);
    assert.equal(program.length,0);
    console.log("ok   sélection malformée, plage incomplète et version périmée refusées");
    d.getElementById("remote-revoke").click();
    await until(()=>phone.ws.readyState===WebSocket.CLOSED,"révocation");
    assert.deepEqual(errors,[]);
  } finally {
    if(dom)dom.window.close();sockets.forEach(s=>s.terminate());await new Promise(r=>server.close(r));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
