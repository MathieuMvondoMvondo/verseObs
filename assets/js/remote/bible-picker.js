/* Choix Bible au pouce : données et texte de la seule régie appairée. */
(function () {
  "use strict";
  var V=window.VerseObs;
  V.parseRemoteReference=function (input) {
    var m=/^(.+?)\s+(\d{1,3})\s*[:v]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/i.exec(String(input || "").trim());
    if (!m) return null;
    var book=V.findBook(m[1]);
    if (!book) return null;
    var s=V.RemoteBible.selection({version:"local",bookId:book.id,chapter:Number(m[2]),verseStart:Number(m[3]),verseEnd:Number(m[4] || m[3])});
    if (!s) return null;
    delete s.version; return s;
  };
  V.RemoteBiblePicker=function (request) {
    var $=function (id) {return document.getElementById(id);};
    var catalog=null, preview=null, revision=0, busy=false;
    var dialog=$("bible-dialog"), query=$("bible-query"), book=$("bible-book"), chapter=$("bible-chapter"), verses=$("bible-verses");
    function status(text) { $("bible-status").textContent=text; }
    function controls() {
      $("btn-bible").disabled=!catalog;
      $("bible-fields").disabled=!catalog;
      $("bible-read").disabled=!catalog || busy;
      $("bible-send").disabled=!catalog || busy || !preview;
    }
    function invalidate() {
      revision++; preview=null;
      $("bible-preview").hidden=true;
      $("bible-text").textContent="";
      status(""); controls();
    }
    function option(select,value,label) {
      var o=document.createElement("option");o.value=value;o.textContent=label;select.appendChild(o);
    }
    function selectedBook() {
      return catalog && catalog.books.find(function (b) {return b.id===Number(book.value);});
    }
    function chapters(value) {
      chapter.replaceChildren();
      var b=selectedBook();
      if (b) b.chapters.forEach(function (n,i) {if(n) option(chapter,i+1,String(i+1));});
      if (value) chapter.value=String(value);
    }
    function filter() {
      invalidate();
      var parsed=V.parseRemoteReference(query.value), q=V.foldBookName(query.value);
      var known=parsed ? {id:parsed.bookId} : V.findBook(query.value);
      var old=book.value;
      book.replaceChildren();
      if (!catalog) return;
      var matches=catalog.books.filter(function (b) {
        var french=V.getBookName(b.id) || b.name;
        return !q || (known && b.id===known.id) || V.foldBookName(french).includes(q) || V.foldBookName(b.name).includes(q);
      });
      matches.forEach(function (b) {option(book,b.id,V.getBookName(b.id) || b.name);});
      if (!matches.length) option(book,"","Aucun livre — vérifier la saisie");
      else if (known && matches.some(function(b){return b.id===known.id;})) book.value=String(known.id);
      else if(matches.some(function(b){return String(b.id)===old;})) book.value=old;
      chapters(parsed && parsed.chapter);
      verses.value=parsed ? parsed.verseStart+(parsed.verseEnd!==parsed.verseStart ? "-"+parsed.verseEnd : "") : "1";
    }
    function selection() {
      var m=/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/.exec(verses.value.trim());
      if (!catalog || !m) return null;
      var s=V.RemoteBible.selection({version:catalog.version,bookId:Number(book.value),chapter:Number(chapter.value),verseStart:Number(m[1]),verseEnd:Number(m[2] || m[1])});
      var b=selectedBook();
      return s && b && s.verseEnd<=b.chapters[s.chapter-1] ? s : null;
    }
    function run(prepare) {
      if (busy || !catalog || (prepare && !preview)) return;
      var s=prepare ? V.RemoteBible.selection(preview) : selection();
      if (!s) {invalidate();status("Référence invalide. Choisissez un livre, un chapitre et un verset ou une plage (16-18).");return;}
      var rev=revision;
      busy=true; controls();status(prepare ? "Envoi à la régie…" : "Lecture dans la version de la régie…");
      request(prepare ? "bible_prepare" : "bible_preview",s,function (msg) {
        busy=false; controls();
        if (rev!==revision) return;
        if (msg.type!=="bible_result") {
          invalidate();
          status({version_changed:"La version a changé dans la régie. Relisez le passage avant de l’envoyer.",
            invalid_selection:"Ce passage n’existe pas intégralement dans cette version.",
            bible_unavailable:"La Bible est en cours de chargement dans la régie.",
            rate_limited:"Trop de demandes. Patientez quelques secondes.",
            busy:"Une lecture est déjà en cours. Réessayez.",
            closed:"Connexion perdue. Vérifiez la régie avant de réessayer.",
            timeout:"Pas de confirmation : vérifiez l’aperçu dans la régie avant de réessayer."}[msg.reason] || "Demande refusée : vérifiez la connexion à la régie.");
          return;
        }
        preview=msg.passage;
        $("bible-ref").textContent=preview.reference;
        $("bible-text").textContent=preview.text;
        $("bible-preview").hidden=false;
        status(prepare ? "Préparé dans l’aperçu de la régie. Aucune diffusion." : "Vérifiez le texte, puis envoyez-le dans l’aperçu de la régie.");
        controls();
      });
    }
    this.state=function (next) {
      var changed=(!catalog !== !next) || (next && catalog && next.version!==catalog.version);
      catalog=next;
      if (changed) {
        invalidate();filter();
        status(next ? "Version de la régie actualisée. Lisez le passage avant de l’envoyer." : "Connexion ou Bible indisponible.");
      }
      $("bible-version").textContent=next ? next.name : "Bible indisponible";
      controls();
    };
    $("btn-bible").addEventListener("click",function () {dialog.showModal();$("bible-close").focus();});
    $("bible-close").addEventListener("click",function () {dialog.close();});
    query.addEventListener("input",filter);
    book.addEventListener("change",function () {invalidate();chapters();verses.value="1";});
    chapter.addEventListener("change",function () {invalidate();verses.value="1";});
    verses.addEventListener("input",invalidate);
    $("bible-form").addEventListener("submit",function(e){e.preventDefault();run(false);});
    $("bible-send").addEventListener("click",function(){run(true);});
    controls();
  };
})();
