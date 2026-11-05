"use strict";
// Contrat du parseur partagé avec le formulaire téléphone.
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const ctx={window:{}};vm.createContext(ctx);
for(const f of ["shared/books.js","shared/remote-bible.js","remote/bible-picker.js"]) vm.runInContext(fs.readFileSync("assets/js/"+f,"utf8"),ctx);
const V=ctx.window.VerseObs, parse=V.parseRemoteReference;
for(const [input,id,c,start,end] of [["Jn 3:16-18",43,3,16,18],[" 1  Co. 13:4 – 7 ",46,13,4,7],["ÉSAÏE 53:5",23,53,5,5],["Jean 3:16",43,3,16,16]]) {
  assert.deepEqual(JSON.parse(JSON.stringify(parse(input))),{bookId:id,chapter:c,verseStart:start,verseEnd:end});
}
for(const input of ["Jean 3:18-16","Jean 0:16","Jean 3:0","Jean 3:16 texte","Jean 3:16-999","Inconnu 3:16"])assert.equal(parse(input),null,input);
console.log("ok   références complètes, accents, abréviations FR, espaces, bornes et plages inversées");
