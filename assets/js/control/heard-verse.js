/* Une proposition opérateur, jamais une commande d'antenne. */
(function () {
  'use strict';
  var V = window.VerseObs = window.VerseObs || {};
  V.HeardVerse = function (options) {
    var el = function (id) { return document.getElementById(id); };
    var card = el('heard-card'), current = null, relay = false, live = false, session = '', busy = false;
    var timer = null, generation = 0, pending = null, prepared = false, announcedVersion = null;
    function clear(message) {
      if (busy && options.cancelLoad) options.cancelLoad();
      generation++;
      current = null; busy = false; prepared = false;
      pending = null;
      el('heard-next').hidden = true;
      clearTimeout(timer);
      el('heard-proposal').hidden = true;
      el('heard-idle').hidden = false;
      el('heard-idle').textContent = message || (live ? 'À l’écoute · les passages reconnus apparaîtront ici.' : 'Recherche de versets en attente.');
      el('heard-state').textContent = live ? 'À l’écoute' : 'En attente';
    }
    function refreshExplanation() {
      if (!current) return false;
      var working = options.workingVersion ? options.workingVersion() : null;
      var id = working && working.id || null, changed = announcedVersion !== id;
      announcedVersion = id;
      var change = id && id !== current.version;
      el('heard-explanation').textContent = (!current.verse ? 'Chapitre seul · verset 1 préparé' : 'Aperçu uniquement') +
        (change ? ' · ' + current.version.toUpperCase() + ' remplace votre ' + working.name + ' (sans conversion).' : ' · diffusion manuelle.');
      return changed;
    }
    function show(p, force) {
      if (!p || !live || !relay || !Number.isFinite(p.confidence) || p.confidence < .9 || p.confidence > 1 ||
          !Number.isFinite(p.ready) || Date.now() - p.ready > 60000 || p.ready > Date.now() + 1000) return;
      // Ne pas remplacer la cible d'un clic ou d'une action clavier en cours.
      if (current && !force && (busy || card.contains(document.activeElement))) {
        pending = p;
        el('heard-next').hidden = false;
        el('heard-next').textContent = 'Autre passage';
        el('heard-next').title = p.reference;
        return;
      }
      pending = null;
      el('heard-next').hidden = true;
      generation++;
      current = p; prepared = false;
      el('heard-idle').hidden = true;
      el('heard-proposal').hidden = false;
      el('heard-state').textContent = 'À vérifier';
      el('heard-reference').textContent = p.reference;
      el('heard-text').textContent = p.text;
      el('heard-text').title = p.text;
      el('heard-full').textContent = p.text;
      el('heard-spoken').textContent = '« ' + p.heard + ' »';
      el('heard-details').open = false;
      var method = p.method === 'reference' ? 'Référence dite' : p.method === 'model' ? 'Citation départagée' : 'Citation rapprochée';
      el('heard-meta').textContent = p.version.toUpperCase();
      el('heard-method').textContent = method + ' · ' + p.version.toUpperCase();
      el('heard-confidence').textContent = 'Indice de correspondance : ' + Math.round(p.confidence * 100) + '/100. Ce n’est pas une probabilité de justesse.';
      refreshExplanation();
      el('heard-load').disabled = false;
      el('heard-load').textContent = !p.verse ? 'Ouvrir le chapitre' : 'Charger l’aperçu';
      clearTimeout(timer);
      timer = setTimeout(function () { clear('Proposition expirée · en attente du prochain passage.'); }, Math.max(0, 60000 - (Date.now() - p.ready)));
    }
    options.channel.onMessage(function (msg) {
      if (msg.type === 'caption_status') {
        var wasLive = live;
        live = !!(relay && msg.engine && msg.state && msg.state.status === 'listening' && msg.state.verseReady !== false);
        card.hidden = !msg.engine;
        card.dataset.live = String(live);
        var notice = msg.state && msg.state.verses || '';
        el('captions-verses').textContent = notice;
        el('heard-source').textContent = /indisponible|abandonn|sautée|impossible/.test(notice) ? notice : '';
        if (wasLive !== live) clear();
        if (msg.engine && msg.state && msg.state.verseReady === false) {
          el('heard-idle').textContent = notice;
          el('heard-state').textContent = 'En préparation';
        }
      } else if (msg.type === 'heard_clear') {
        session = msg.session || session;
        clear();
      } else if (msg.type === 'heard_verse') {
        if (session && msg.session !== session) clear();
        session = msg.session || '';
        show(msg.proposal);
      }
    });
    el('heard-load').addEventListener('click', function () {
      if (!current || busy) return;
      if (refreshExplanation()) {
        el('heard-state').textContent = 'Version à vérifier';
        return; // le premier clic actualise l'annonce périmée, le suivant confirme
      }
      var selected = current, run = generation;
      busy = true;
      el('heard-state').textContent = 'Chargement…';
      el('heard-load').disabled = true;
      Promise.resolve(options.load(selected, function () { return run === generation && relay && live; })).then(function (ok) {
        if (run !== generation) return;
        busy = false;
        prepared = !!ok;
        el('heard-state').textContent = ok ? 'Dans l’aperçu' + (!selected.verse ? ' · v.1' : '') : 'Chargement annulé ou impossible';
        el('heard-load').textContent = ok ? 'Aperçu chargé' : 'Réessayer';
        el('heard-load').disabled = !!ok;
      }).catch(function () {
        if (run !== generation) return;
        busy = false;
        el('heard-state').textContent = 'Chargement impossible';
        el('heard-load').disabled = false;
      });
    });
    el('heard-dismiss').addEventListener('click', function () { clear('Proposition écartée · l’écoute continue.'); });
    el('heard-next').addEventListener('click', function () { if (pending && !busy) show(pending, true); });
    card.addEventListener('focusout', function () {
      setTimeout(function () { if (pending && !busy && !card.contains(document.activeElement)) show(pending); }, 0);
    });
    this.workingVersionChanged = refreshExplanation;
    this.selectionChanged = function (reference, version) {
      refreshExplanation();
      if (prepared && current && (version !== current.version || reference !== (current.verse ? current.reference : current.reference + ':1'))) {
        prepared = false;
        el('heard-state').textContent = 'À vérifier';
        el('heard-load').disabled = false;
        el('heard-load').textContent = 'Recharger l’aperçu';
      }
    };
    el('heard-connect').addEventListener('click', options.openConnections);
    this.setRelay = function (connected) { relay = connected; if (!relay) { live = false; card.hidden = true; clear('Service local déconnecté · aucune proposition active.'); } };
    card.hidden = true;
    clear();
  };
})();
