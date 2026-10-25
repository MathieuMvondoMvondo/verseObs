/* Paste a plan: every Bible reference of a message, in order, for the conductor. */
(function () {
  "use strict";
  var V = window.VerseObs;
  var MAX_EXCERPT = 160;

  function plural(count, one, many) {
    return count + " " + (count > 1 ? many : one);
  }
  function bookLabel(loader, versionId, bookId) {
    var info = loader.getBookInfo(versionId, bookId);
    return info
      ? info.name
      : V.getBookName(Number(bookId), "fr") || "Livre " + bookId;
  }
  function referenceLabel(name, ref) {
    var out = name + " " + ref.chapter;
    if (ref.verseStart != null) {
      out += ":" + ref.verseStart;
      if (ref.verseEnd != null && ref.verseEnd !== ref.verseStart)
        out += "-" + ref.verseEnd;
    }
    return out;
  }
  function excerpt(text) {
    var clean = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    return clean.length > MAX_EXCERPT
      ? clean
          .slice(0, MAX_EXCERPT)
          .replace(/\s+\S*$/, "")
          .replace(/[\s,;:.!?]+$/, "") + "…"
      : clean;
  }

  /**
   * Check one parsed reference against the loaded translations and build its
   * conductor item exactly like a manual addition.
   * context: { loader, versionId, versionName, secondary(bookId, chapter,
   *            start, end) -> object|null, secondaryName }
   * Returns { ok, label, reason?, item?, excerpt?, verses? }.
   */
  function resolve(ref, context) {
    var loader = context.loader,
      id = context.versionId,
      info = loader.getBookInfo(id, ref.bookId),
      name = bookLabel(loader, id, ref.bookId),
      label = referenceLabel(name, ref);
    function fail(reason) {
      return { ok: false, label: label, reason: reason };
    }
    if (!info) return fail("Livre absent de cette version.");
    if (ref.chapter > info.chapters || !loader.getChapter(id, ref.bookId, ref.chapter))
      return fail(
        info.chapters > 1
          ? name + " ne compte que " + info.chapters + " chapitres."
          : name + " ne compte qu’un chapitre.",
      );
    var verses = loader.getChapter(id, ref.bookId, ref.chapter),
      last = verses[verses.length - 1].verse,
      start = ref.verseStart,
      end = ref.verseEnd == null ? ref.verseStart : ref.verseEnd,
      passage;
    if (start != null && end < start)
      return fail("Plage inversée : " + start + "-" + end + ".");
    if (
      start != null &&
      (!loader.getVerse(id, ref.bookId, ref.chapter, start) ||
        !loader.getVerse(id, ref.bookId, ref.chapter, end))
    )
      return fail(
        name + " " + ref.chapter + " ne compte que " + last + " versets.",
      );
    if (start == null) {
      passage = loader.getRange(id, ref.bookId, ref.chapter, verses[0].verse, last);
      passage.reference = name + " " + ref.chapter;
    } else if (end > start) {
      passage = loader.getRange(id, ref.bookId, ref.chapter, start, end);
    } else {
      passage = loader.getVerse(id, ref.bookId, ref.chapter, start);
      passage.html = "";
    }
    var item = {
      type: "verse",
      text: passage.text,
      html: passage.html || "",
      reference: passage.reference,
      version: context.versionName,
    };
    if (context.secondary) {
      var second = context.secondary(ref.bookId, ref.chapter, start, end);
      if (!second)
        return fail(
          "Absent de " +
            (context.secondaryName || "la deuxième version") +
            " : ce passage ne peut pas être ajouté en deux versions.",
        );
      item.secondary = second;
    }
    return {
      ok: true,
      label: passage.reference,
      item: item,
      excerpt: excerpt(passage.text),
      verses: start == null ? verses.length : end - start + 1,
    };
  }

  /** Analyse a pasted text: parser results plus translation limits. */
  function analyse(search, text, context) {
    var found = search.findReferences(text),
      seen = {},
      passages = [],
      issues = [];
    found.references.forEach(function (ref) {
      var result = resolve(ref, context);
      // "2 Jean 3:16" in a numbered list: 2 Jean has one chapter, Jean 3:16 exists.
      if (!result.ok && ref.alt) {
        var other = resolve(Object.assign({}, ref, { bookId: ref.alt }), context);
        if (other.ok) {
          result = other;
          ref = Object.assign({}, ref, { bookId: ref.alt });
        }
      }
      var key =
        ref.bookId +
        ":" +
        ref.chapter +
        ":" +
        ref.verseStart +
        "-" +
        ref.verseEnd;
      seen[key] = (seen[key] || 0) + 1;
      var entry = {
        key: key + "#" + seen[key],
        line: ref.line,
        lineText: ref.lineText,
        column: ref.column,
        fragment: ref.fragment,
        wholeChapter: ref.wholeChapter,
      };
      if (result.ok) passages.push(Object.assign(entry, result));
      else
        issues.push(
          Object.assign(entry, {
            start: ref.start,
            label: result.label,
            reason: result.reason,
          }),
        );
    });
    found.issues.forEach(function (issue) {
      issues.push({
        start: issue.start,
        line: issue.line,
        lineText: issue.lineText,
        column: issue.column,
        fragment: issue.fragment,
        label: issue.fragment,
        reason: issue.reason,
      });
    });
    issues.sort(function (a, b) {
      return a.start - b.start;
    });
    return {
      passages: passages,
      issues: issues,
      truncated: found.truncated,
      clipped: found.clipped,
    };
  }

  V.Plan = { resolve: resolve, analyse: analyse, excerpt: excerpt };

  /**
   * The "Coller un plan" dialog.
   * options: { search, loader, queue, bilingual, notify, version() }
   */
  V.PlanImport = function (options) {
    var self = this,
      el = function (id) {
        return document.getElementById(id);
      },
      overlay = el("plan-overlay"),
      textarea = el("plan-text"),
      list = el("plan-list"),
      issuesBox = el("plan-issues"),
      issueList = el("plan-issue-list"),
      empty = el("plan-empty"),
      summary = el("plan-summary"),
      submit = el("plan-submit"),
      toggleAll = el("plan-toggle-all"),
      jump = el("plan-jump-issues"),
      versionBadge = el("plan-version"),
      notice = el("plan-notice"),
      unchecked = {},
      result = { passages: [], issues: [] },
      opener = null,
      frame = 0;

    function context() {
      var version = options.version(),
        mode = options.bilingual.planMode(version.id);
      return {
        mode: mode,
        version: version,
        resolve: {
          loader: options.loader,
          versionId: version.id,
          versionName: version.name,
          secondaryName: mode.name,
          secondary: mode.enabled
            ? function (bookId, chapter, start, end) {
                return options.bilingual.secondaryFor(
                  bookId,
                  chapter,
                  start,
                  end,
                );
              }
            : null,
        },
      };
    }
    function selected() {
      return result.passages.filter(function (p) {
        return !unchecked[p.key];
      });
    }
    /** "Ligne 7 · Jean 3:16 ; 5:24" with the recognised words highlighted. */
    function lineNote(entry) {
      var note = document.createElement("span"),
        line = entry.lineText,
        from = Math.max(0, Math.min(line.length, Number(entry.column) || 0)),
        to = Math.min(line.length, from + entry.fragment.length),
        lead = /^[\s\-\u2013\u2014\u2022*\u00b7>]*(?:\d{1,2}[.)]\s+)?/.exec(line)[0].length,
        start = Math.min(lead, from),
        before = line.slice(start, from),
        after = line.slice(to).replace(/\s+$/, ""),
        mark = document.createElement("mark");
      note.className = "plan-line";
      if (before.length > 48) before = "…" + before.slice(-47).replace(/^\S*\s+/, "");
      if (after.length > 60) after = after.slice(0, 59) + "…";
      mark.textContent = line.slice(from, to);
      note.append("Ligne " + entry.line + " · " + before, mark, after);
      return note;
    }
    function renderPassage(p, index) {
      var li = document.createElement("li"),
        label = document.createElement("label"),
        box = document.createElement("input"),
        number = document.createElement("span"),
        body = document.createElement("span"),
        head = document.createElement("span"),
        ref = document.createElement("strong"),
        text = document.createElement("span");
      li.className = "plan-item";
      li.classList.toggle("is-off", !!unchecked[p.key]);
      box.type = "checkbox";
      box.checked = !unchecked[p.key];
      box.dataset.key = p.key;
      box.setAttribute("aria-label", "Ajouter " + p.label);
      number.className = "plan-index";
      number.textContent = String(index + 1).padStart(2, "0");
      body.className = "plan-item-body";
      head.className = "plan-item-head";
      ref.textContent = p.label;
      head.appendChild(ref);
      if (p.wholeChapter) {
        var tag = document.createElement("span");
        tag.className = "plan-tag";
        tag.textContent = "Chapitre entier · " + plural(p.verses, "verset", "versets");
        head.appendChild(tag);
      }
      if (p.item.secondary) {
        var second = document.createElement("span");
        second.className = "plan-tag";
        second.textContent = "+ " + p.item.secondary.reference;
        head.appendChild(second);
      }
      text.className = "plan-item-text";
      text.textContent = p.excerpt;
      body.append(head, text, lineNote(p));
      label.append(box, number, body);
      li.appendChild(label);
      return li;
    }
    function renderIssue(issue) {
      var li = document.createElement("li"),
        head = document.createElement("span"),
        ref = document.createElement("strong"),
        reason = document.createElement("span");
      li.className = "plan-issue";
      head.className = "plan-item-head";
      ref.textContent = issue.label;
      reason.className = "plan-issue-reason";
      reason.textContent = issue.reason;
      head.appendChild(ref);
      li.append(head, reason, lineNote(issue));
      return li;
    }
    function render() {
      frame = 0;
      var ctx = context(),
        waiting = !ctx.version.id
          ? "Chargement de la version…"
          : ctx.mode.message;
      result = ctx.version.id
        ? analyse(options.search, textarea.value, ctx.resolve)
        : { passages: [], issues: [] };
      var keys = {};
      result.passages.forEach(function (p) {
        keys[p.key] = true;
      });
      Object.keys(unchecked).forEach(function (key) {
        if (!keys[key]) delete unchecked[key];
      });
      versionBadge.textContent = ctx.version.abbr
        ? ctx.version.abbr + (ctx.mode.enabled ? " + " + ctx.mode.abbr : "")
        : "";
      versionBadge.title = ctx.version.name
        ? ctx.version.name + (ctx.mode.enabled ? " et " + ctx.mode.name : "")
        : "";
      list.replaceChildren.apply(list, result.passages.map(renderPassage));
      issueList.replaceChildren.apply(issueList, result.issues.map(renderIssue));
      issuesBox.hidden = !result.issues.length;
      el("plan-issues-count").textContent = result.issues.length;
      jump.hidden = !result.issues.length || !result.passages.length;
      jump.textContent = plural(result.issues.length, "ligne à vérifier", "lignes à vérifier");
      empty.hidden = !!(result.passages.length || result.issues.length);
      empty.textContent = textarea.value.trim()
        ? "Aucune référence reconnue pour l’instant."
        : "Les passages apparaîtront ici pendant que vous tapez.";
      var messages = [];
      if (waiting) messages.push(waiting);
      if (result.truncated)
        messages.push(
          "Limite atteinte : seuls les " +
            V.Search.PLAN_MAX_REFERENCES +
            " premiers passages sont proposés.",
        );
      if (result.clipped)
        messages.push(
          "Seuls les " +
            V.Search.PLAN_MAX_LENGTH.toLocaleString("fr-FR") +
            " premiers caractères sont analysés.",
        );
      var room = 500 - options.queue.getState().total,
        count = selected().length;
      if (count > room)
        messages.push(
          "Le conducteur est limité à 500 éléments : il reste " +
            plural(Math.max(0, room), "place", "places") +
            ".",
        );
      notice.textContent = messages.join(" ");
      notice.hidden = !messages.length;
      var found = result.passages.length;
      summary.textContent = found
        ? plural(found, "passage trouvé", "passages trouvés") +
          (result.issues.length
            ? " · " + plural(result.issues.length, "ligne à vérifier", "lignes à vérifier")
            : "")
        : result.issues.length
          ? plural(result.issues.length, "ligne à vérifier", "lignes à vérifier")
          : "Aucun passage";
      submit.textContent = count
        ? "Ajouter " +
          plural(count, "passage", "passages") +
          " au conducteur"
        : "Ajouter au conducteur";
      submit.disabled = !count || !!waiting || count > room;
      toggleAll.hidden = found < 2;
      toggleAll.textContent = count === found ? "Tout décocher" : "Tout cocher";
    }
    function schedule() {
      if (frame) return;
      frame = (window.requestAnimationFrame || setTimeout)(render);
    }
    function add() {
      render();
      if (submit.disabled) return;
      var items = selected().map(function (p) {
        return p.item;
      });
      try {
        var added = options.queue.addMany(items);
        options.notify(
          plural(added, "passage ajouté", "passages ajoutés") +
            " au conducteur",
          "success",
        );
        textarea.value = "";
        unchecked = {};
        self.close();
      } catch (e) {
        options.notify(e.message || "Ajout impossible", "error");
      }
    }

    self.open = function () {
      opener = document.activeElement;
      overlay.hidden = false;
      render();
      textarea.focus();
    };
    self.close = function () {
      overlay.hidden = true;
      if (opener && opener.getClientRects && opener.getClientRects().length)
        opener.focus();
    };
    self.isOpen = function () {
      return !overlay.hidden;
    };
    self.refresh = function () {
      if (self.isOpen()) schedule();
    };
    self.add = add;

    textarea.addEventListener("input", function () {
      render();
    });
    list.addEventListener("change", function (e) {
      var key = e.target && e.target.dataset ? e.target.dataset.key : "";
      if (!key) return;
      if (e.target.checked) delete unchecked[key];
      else unchecked[key] = true;
      render();
    });
    toggleAll.addEventListener("click", function () {
      var all = selected().length === result.passages.length;
      unchecked = {};
      if (all)
        result.passages.forEach(function (p) {
          unchecked[p.key] = true;
        });
      render();
    });
    submit.addEventListener("click", add);
    jump.addEventListener("click", function () {
      issuesBox.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    el("plan-cancel").addEventListener("click", self.close);
    el("plan-close").addEventListener("click", self.close);
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) self.close();
    });
    overlay.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        self.close();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        add();
      }
    });
    document.querySelectorAll("[data-open-plan]").forEach(function (button) {
      button.addEventListener("click", self.open);
    });
  };
})();
