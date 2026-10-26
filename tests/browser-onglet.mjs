// « Onglet » through the real Studio (finalisation, 26/10): every example
// shown to Math must be reachable from the interface, with nothing injected.
// The operator picks the style, types a signature, broadcasts from the
// editor, splits a passage in the conductor, Suivant then Diffuser, then
// Masquer; a song gets its own signature; every position the interface
// offers is checked on the OBS output and on a projector (?projector=1),
// which centres every text on purpose (its own rules in display/app.js).
import assert from "node:assert/strict";

/** What the audience sees of the onglet card, in page px. */
const SEEN = () => {
  const card = document.querySelector(".verse-card:not(.vo-probe)");
  if (!card) return null;
  const box = (el) => {
    if (!el || getComputedStyle(el).display === "none") return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { l: r.left, r: r.right, t: r.top, b: r.bottom } : null;
  };
  const copy = card.querySelector(".vo-copy");
  const range = document.createRange();
  range.selectNodeContents(copy);
  const ink = range.getBoundingClientRect();
  const tab = card.querySelector(".vo-margin");
  const sign = card.querySelector(".vo-sign"),
    plan = card.querySelector(".vo-plan");
  const first = Array.from(card.querySelectorAll(".vo-copy .verse-text sup.verse-num")).find((s) => getComputedStyle(s).display !== "none");
  return {
    cls: document.querySelector("#verse-container").className,
    w: innerWidth,
    h: innerHeight,
    plate: box(card.querySelector(".vo-plate")),
    tab: box(tab),
    tabText: tab && box(tab) ? tab.innerText.replace(/\s+/g, " ").trim() : "",
    tabClipped: tab && box(tab) ? tab.scrollWidth > tab.clientWidth + 1 : false,
    ink: { l: ink.left, r: ink.right, t: ink.top, b: ink.bottom },
    foot: box(card.querySelector(".vo-foot")),
    sign: sign && box(sign) ? sign.textContent : "",
    signBox: box(sign),
    plan: plan && box(plan) ? plan.textContent : "",
    first: first ? first.textContent : "",
    partial: card.dataset.partial || "",
    text: copy.innerText.replace(/\s+/g, " ").trim(),
  };
};
/** Entrance or change finished: nothing leaving, text fully revealed. */
const SETTLED = () => {
  const card = document.querySelector(".verse-card:not(.vo-probe)");
  if (!card || document.querySelector(".vo-probe")) return false;
  const copy = card.querySelector(".vo-copy");
  // …and nothing still moving (the tab follows the card by 60 ms).
  const moving = document.getAnimations().some((a) => a.playState === "running" || a.playState === "pending");
  return !moving && !card.querySelector(".is-leaving") && !!copy && !copy.classList.contains("is-revealing") && getComputedStyle(copy).opacity === "1";
};

/** Whole, inside the frame, the reference in its tab on the card, the foot under the text. */
function whole(g, where, { position = "lower-third", tab = true } = {}) {
  assert.ok(g, where + ": on air");
  assert.match(g.cls, /layout-onglet/, where + ": onglet layout");
  assert.ok(g.cls.split(/\s+/).includes(position), where + ": position " + position + " (" + g.cls + ")");
  assert.equal(g.partial, "", where + ": text whole");
  const e = 0.5,
    scale = g.h / 1080;
  const inFrame = (b) => b.l >= -e && b.t >= -e && b.r <= g.w + e && b.b <= g.h + e;
  assert.ok(g.plate && inFrame(g.plate), where + ": card inside the frame " + JSON.stringify(g.plate));
  assert.ok(inFrame(g.ink), where + ": every line inside the frame " + JSON.stringify(g.ink));
  assert.ok(g.ink.l >= g.plate.l - e && g.ink.r <= g.plate.r + e && g.ink.t >= g.plate.t - e && g.ink.b <= g.plate.b + e, where + ": every line inside the card " + JSON.stringify([g.ink, g.plate]));
  if (tab) {
    assert.ok(g.tab && inFrame(g.tab), where + ": tab inside the frame " + JSON.stringify(g.tab));
    assert.ok(Math.abs(g.tab.b - g.plate.t) <= 1.5 * scale, where + ": the tab stands on the card " + JSON.stringify([g.tab, g.plate]));
    assert.ok(Math.abs(g.tab.r - g.plate.r) <= 1 && g.tab.l >= g.plate.l - e, where + ": the tab at the card's top right");
    assert.equal(g.tabClipped, false, where + ": reference whole in its tab");
  }
  if (g.foot) {
    assert.ok(g.foot.t >= g.ink.b - e && g.foot.b <= g.plate.b + e, where + ": signature and plan under the text " + JSON.stringify([g.ink, g.foot, g.plate]));
    assert.ok(g.signBox === null || g.signBox.l >= (g.plate.l + g.plate.r) / 2, where + ": signature on the right");
  }
}

export async function ongletStudio({ check, open, prepare, BASE }) {
  const { ctx, studio, output, errors } = await open(1920, 1080);
  const projector = await ctx.newPage();
  projector.on("pageerror", (e) => errors.push("projector: " + e.message));
  await projector.setViewportSize({ width: 1280, height: 720 });
  await projector.goto(`${BASE}/browser_source.html?projector=1`);
  // Every card that appears on the OBS output: its layout at that moment.
  // A style repaired afterwards (update_style) would show a first card in
  // another layout.
  await output.evaluate(() => {
    window.__cards = [];
    new MutationObserver(() => {
      const card = document.querySelector(".verse-card:not(.vo-probe)");
      if (card && !card.__seen) {
        card.__seen = true;
        window.__cards.push(document.querySelector("#verse-container").className);
      }
    }).observe(document.querySelector("#verse-container"), { childList: true, subtree: true });
  });
  const visible = (selectors) =>
    studio.evaluate((list) => list.find((s) => { const el = document.querySelector(s); return el && el.getClientRects().length && !el.disabled; }) || "", selectors);
  const take = async () => studio.click(await visible(["#btn-show", "#btn-queue-show"]));
  const hide = async () => studio.click(await visible(["#btn-hide", "#btn-queue-hide"]));
  const head = () => studio.evaluate(() => ({ state: document.querySelector("#onair-bar").dataset.state, text: document.querySelector("#onair-bar").textContent.replace(/\s+/g, " ").trim() }));
  const settle = async (page, test) => {
    await page.waitForFunction(SETTLED, null, { timeout: 15000 });
    if (test) await page.waitForFunction(test, null, { timeout: 15000 });
    await page.waitForTimeout(150);
    return page.evaluate(SEEN);
  };
  const setField = (selector, value) =>
    studio.evaluate(
      ([selector, value]) => {
        const el = document.querySelector(selector);
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      [selector, value],
    );

  await check("Onglet from the real Studio: style chosen, signature typed, a verse broadcast from the editor — number, tab and signature on air, no repair", async () => {
    await studio.evaluate(() => document.querySelector('.quick-styles [data-preset="onglet"]').click());
    await setField('#settings-container [data-setting="signature"]', "Culte du dimanche");
    await prepare(studio, "Jean 3:16");
    await take();
    const g = await settle(output);
    const p = await settle(projector);
    console.log("    Jean 3:16: " + JSON.stringify({ tab: g.tabText, first: g.first, sign: g.sign, plan: g.plan, cards: await output.evaluate(() => window.__cards) }));
    whole(g, "OBS, Jean 3:16");
    // The projector centres every text on purpose (display/app.js,
    // projector rules: centre, body ≥ 42 px, 85 % wide), whatever the style.
    whole(p, "projector, Jean 3:16", { position: "center" });
    assert.equal(g.tabText, "Jean 3:16 (LSG)");
    assert.equal(g.first, "16", "the verse number from the régie");
    assert.equal(g.sign, "Culte du dimanche");
    assert.equal(g.plan, "", "no plan count for a single text");
    assert.deepEqual(await output.evaluate(() => window.__cards.filter((c) => !/layout-onglet/.test(c))), [], "the first card is already Onglet: the style came with Diffuser");
    await studio.waitForFunction(() => document.querySelector("#onair-bar").dataset.state === "live", null, { timeout: 10000 });
    assert.match((await head()).text, /Jean 3:16/);
  });

  await check("Onglet from the conductor: a passage split in plans, Suivant then Diffuser shows « 2/N » and the plan's first number, Masquer clears both", async () => {
    await prepare(studio, "Psaumes 119:1-24");
    await studio.waitForFunction(() => { const b = document.querySelector("#btn-split"); return b && !b.hidden && !b.disabled && /Découper en \d+ plans/.test(b.textContent); }, null, { timeout: 20000 });
    const n = Number(/(\d+) plans/.exec(await studio.textContent("#btn-split"))[1]);
    await studio.click("#btn-split");
    await studio.waitForFunction((n) => document.querySelectorAll("#queue-container .cp-queue-item").length === n, n);
    const rows = await studio.evaluate(() => Array.from(document.querySelectorAll("#queue-container .cp-queue-item")).map((r) => r.dataset.label));
    await studio.evaluate(() => document.querySelector("#tab-btn-2").click());
    await studio.evaluate(() => document.querySelector("#queue-container .cp-queue-item").click());
    await take();
    let g = await settle(output, () => (document.querySelector(".vo-plan")?.textContent || "").startsWith("1/"));
    whole(g, "OBS, plan 1");
    assert.equal(g.plan, "1/" + n);
    await studio.click("#btn-queue-next");
    await take();
    const second = /119:(\d+)/.exec(rows[1])[1];
    g = await settle(output, () => (document.querySelector(".vo-plan")?.textContent || "").startsWith("2/"));
    const p = await settle(projector, () => (document.querySelector(".vo-plan")?.textContent || "").startsWith("2/"));
    console.log("    plan 2: " + JSON.stringify({ n, rows: rows.slice(0, 3), tab: g.tabText, first: g.first, plan: g.plan, sign: g.sign }));
    whole(g, "OBS, plan 2");
    whole(p, "projector, plan 2", { position: "center" });
    assert.equal(g.plan, "2/" + n, "the plan's place in its passage");
    assert.equal(g.first, second, "the plan starts with its own first verse number");
    assert.equal(g.tabText, rows[1] + " (LSG)", "the tab names the plan's verses");
    assert.equal(g.sign, "Culte du dimanche", "the signature stays after a plan change");
    await hide();
    await output.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    await projector.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    await studio.waitForFunction(() => document.querySelector("#onair-bar").dataset.state === "off", null, { timeout: 10000 });
  });

  await check("Onglet song: its own signature field in « Habillage des textes et chants », on air under the lyrics", async () => {
    await studio.evaluate(() => document.querySelector("#tab-btn-1").click());
    await studio.evaluate(() => document.querySelector('#freetext-presets [data-ft-preset="onglet"]').click());
    assert.ok(await studio.$('#freetext-style-container [data-setting="signature"]'), "a signature field for songs");
    await setField('#freetext-style-container [data-setting="signature"]', "Louange");
    await studio.fill("#freetext-title", "Chant d’entrée");
    await studio.evaluate(() => {
      const e = document.querySelector("#freetext-editable");
      e.innerText = "À toi la gloire, ô Ressuscité !\nÀ toi la victoire pour l’éternité !";
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await studio.click("#btn-free-show");
    const g = await settle(output, () => (document.querySelector(".vo-margin")?.textContent || "").includes("Chant"));
    console.log("    song: " + JSON.stringify({ tab: g.tabText, sign: g.sign, text: g.text.slice(0, 40) }));
    whole(g, "OBS, song");
    assert.equal(g.tabText, "Chant d’entrée");
    assert.equal(g.sign, "Louange", "the song's own signature");
    await hide();
    await output.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
  });

  await check("Onglet in every position the interface offers (bas, haut, centre, plein écran), on OBS and on a projector: nothing clipped, the tab on its card", async () => {
    await studio.evaluate(() => document.querySelector("#tab-btn-0").click());
    const options = await studio.evaluate(() => Array.from(document.querySelectorAll('#settings-container [data-setting="position"] option')).map((o) => o.value));
    assert.deepEqual(options.slice().sort(), ["center", "fullscreen", "lower-third", "upper-third"]);
    const plates = {};
    for (const position of options) {
      await setField('#settings-container [data-setting="position"]', position);
      for (const ref of ["Jean 3:16", "Romains 8:28-29"]) {
        await prepare(studio, ref);
        await take();
        const g = await settle(output, () => document.querySelector(".verse-card:not(.vo-probe) .vo-margin"));
        const p = await settle(projector);
        console.log("    " + position + ", " + ref + ": OBS " + JSON.stringify({ plate: g.plate, tab: g.tab && [Math.round(g.tab.l), Math.round(g.tab.b)] }) + " · projector " + JSON.stringify(p.plate));
        whole(g, "OBS, " + position + ", " + ref, { position });
        whole(p, "projector, " + position + ", " + ref, { position: "center" });
        assert.equal(g.tabText, ref + " (LSG)");
        plates[position + " " + ref] = g.plate;
        await studio.waitForFunction(() => document.querySelector("#onair-bar").dataset.state === "live", null, { timeout: 10000 });
        assert.match((await head()).text, new RegExp(ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the régie names what is on air");
      }
      await hide();
      await output.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    }
    // « Plein écran » in Onglet keeps the card, never a full-frame wall: it
    // is centred as « Centre »; only a long text may grow to 84 % of the
    // frame instead of 72 % before it is reduced (renderer.js LIMITS).
    for (const ref of ["Jean 3:16", "Romains 8:28-29"])
      assert.deepEqual(plates["fullscreen " + ref], plates["center " + ref], "Plein écran = Centre for a short text: " + ref);
    await setField('#settings-container [data-setting="position"]', "lower-third");
  });
  assert.deepEqual(errors, []);
  await ctx.close();
}

/**
 * N7 (review 7): an OBS source still running an older VerseObs (page not
 * refreshed after the update) reports without « caps ». It would take a
 * style patch for an older Studio's whole style (Antenne → Carte at the
 * first size change) and cannot draw « Onglet ». The Studio sends it no
 * patch, never says « Sortie confirmée » for it and asks to refresh the
 * source; once refreshed, patches and the confirmation come back.
 * The older output is emulated by the real output page served without its
 * « caps » (the field 8834e21 and earlier never sent); the mixed run with
 * the real 8834e21 code is a separate probe (onglet-finalisation/n7).
 */
export async function legacyOutput({ check, open, prepare, BASE }) {
  const { ctx, studio, output, errors } = await open(1920, 1080);
  // As 8834e21 and earlier: no « caps », a style patch taken for an older
  // Studio's whole style (no `patch` flag: Antenne → Carte), and no
  // « style_patch » (an unknown type is ignored). Review 8 (B3).
  const strip = async (route) => {
    const r = await route.fetch();
    const body = (await r.text())
      .replace(/\n\s*caps: \[[^\]]*\],/, "")
      .replace(/msg\.type === MSG\.STYLE_PATCH \|\| msg\.patch === true/, "false")
      .replace(/msg\.patch === true/, "false")
      .replace(/msg\.type === MSG\.UPDATE_STYLE \|\| msg\.type === MSG\.STYLE_PATCH/, "msg.type === MSG.UPDATE_STYLE");
    await route.fulfill({ response: r, body });
  };
  await output.route("**/assets/js/display/app.js*", strip);
  await output.reload();
  const spy = async () =>
    output.evaluate((name) => {
      window.__styles = [];
      new BroadcastChannel(name).onmessage = (e) => {
        const t = e.data && e.data.type;
        if (t === "style_patch") window.__styles.push(t);
        else if (t === "update_style") window.__styles.push(e.data.patch ? "patch" : "whole");
      };
    }, await output.evaluate(() => window.VerseObs.CHANNEL_NAME || "verseobs"));
  await spy();
  // The emulated older output really runs without « caps ».
  assert.equal(await output.evaluate(() => fetch("assets/js/display/app.js").then((r) => r.text()).then((t) => /caps:|MSG\.STYLE_PATCH|patch === true/.test(t))), false);
  const head = () =>
    studio.evaluate(() => ({
      state: document.querySelector("#onair-bar").dataset.state,
      label: document.querySelector("#onair-bar .cp-onair-label").textContent,
      note: document.querySelector("#program-note").hidden ? "" : document.querySelector("#program-note").textContent,
    }));
  const fontSize = (v) =>
    studio.evaluate((v) => {
      const el = document.querySelector('#settings-container [data-setting="fontSize"]');
      el.value = String(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
  const outOf = (p) =>
    p.evaluate(() => ({
      cls: document.querySelector("#verse-container").className,
      font: getComputedStyle(document.documentElement).getPropertyValue("--font-size").trim(),
    }));
  // Nothing an older output would misread: « style_patch » is ignored there.
  const misread = (sent) => sent.filter((s) => s !== "style_patch");
  await check("An OBS source left on an older version: the régie asks to refresh it, sends it nothing it would misread and never confirms its look", async () => {
    await prepare(studio, "Jean 3:16");
    await studio.click("#btn-show");
    await output.waitForFunction(() => document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    await studio.waitForFunction(() => !document.querySelector("#program-note").hidden && /actualise/i.test(document.querySelector("#program-note").textContent), null, { timeout: 10000 });
    await studio.waitForFunction(() => document.querySelector("#onair-bar").dataset.state === "live", null, { timeout: 10000 });
    const h = await head();
    // Longer than the Studio's memory of an older report (7 s): the older
    // output answers every PING (3 s), so it is still known as older.
    await studio.waitForTimeout(8000);
    await fontSize(50);
    await studio.waitForTimeout(800);
    const sent = await output.evaluate(() => window.__styles.slice());
    console.log("    older output: " + JSON.stringify({ head: h, styles: sent }));
    assert.match(h.note, /actualisez/i, "the régie asks to refresh the source");
    assert.notEqual(h.label, "Sortie confirmée", "no confirmation of a look the older output cannot draw");
    assert.deepEqual(misread(sent), [], "no update_style for an output that would take a patch for an older Studio's whole style");
    assert.match((await outOf(output)).cls, /layout-antenne/);
  });
  // Review 8 (B3): silence proves nothing. A second, up-to-date output answers
  // while the older one is frozen (main thread busy), as in the review.
  const fresh = await ctx.newPage();
  fresh.on("pageerror", (e) => errors.push("fresh: " + e.message));
  await fresh.goto(`${BASE}/browser_source.html`);
  const freeze = (ms) => output.evaluate((ms) => { const end = performance.now() + ms; while (performance.now() < end); }, ms).catch(() => {});
  const freshAt = (px) => fresh.waitForFunction((px) => getComputedStyle(document.documentElement).getPropertyValue("--font-size").trim() === px, px, { timeout: 5000 });
  await check("The older output frozen 10 s, a size change at 8 s: never « Sortie confirmée », nothing it would misread, the up-to-date output takes it live", async () => {
    await studio.click("#btn-show");
    await fresh.waitForFunction(() => document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    await studio.waitForTimeout(3500);
    const before = await outOf(output);
    const frozen = freeze(10000);
    await studio.waitForTimeout(8000);
    const at8 = await head();
    await fontSize(52);
    await freshAt("52px");
    await frozen;
    await output.waitForTimeout(2000);
    const after = await outOf(output),
      sent = await output.evaluate(() => window.__styles.slice());
    console.log("    frozen 10 s: " + JSON.stringify({ at8, before, after, sent, end: await head() }));
    assert.notEqual(at8.label, "Sortie confirmée", "silence is no proof the older output was refreshed");
    assert.match(at8.note, /actualisez/i);
    assert.match(after.cls, /layout-antenne/, "the older output keeps its look");
    assert.equal(after.font, before.font, "it takes the size at the next Diffuser");
    assert.deepEqual(misread(sent), [], "nothing it would misread");
  });
  await check("A Studio reloaded while the older output is frozen: its first patch, before that output answers, is nothing it would misread; the warning comes back when it answers", async () => {
    const frozen = freeze(10000);
    await studio.waitForTimeout(300);
    await studio.reload();
    await studio.waitForSelector(".chapter-verse");
    await prepare(studio, "Jean 3:16");
    await studio.click("#btn-show");
    await fontSize(48);
    const early = await head();
    await freshAt("48px");
    await frozen;
    await studio.waitForFunction(() => !document.querySelector("#program-note").hidden && /actualise/i.test(document.querySelector("#program-note").textContent), null, { timeout: 8000 });
    await output.waitForTimeout(1500);
    const after = await outOf(output),
      late = await head(),
      sent = await output.evaluate(() => window.__styles.slice());
    console.log("    reloaded Studio: " + JSON.stringify({ early, after, late, sent }));
    assert.match(after.cls, /layout-antenne/, "the older output keeps its look");
    assert.equal(after.font, "52px", "the Diffuser's whole style, not the patch");
    assert.deepEqual(misread(sent), [], "nothing it would misread");
    assert.notEqual(late.label, "Sortie confirmée");
  });
  await check("Once the source is refreshed: the note goes, « Sortie confirmée » and live style patches come back", async () => {
    await output.unroute("**/assets/js/display/app.js*", strip);
    await output.reload();
    await spy();
    await studio.click("#btn-show");
    await output.waitForFunction(() => document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    await studio.waitForFunction(() => document.querySelector("#program-note").hidden && document.querySelector("#onair-bar .cp-onair-label").textContent === "Sortie confirmée", null, { timeout: 15000 });
    await fontSize(46);
    await output.waitForFunction(() => window.__styles.length > 0, null, { timeout: 5000 });
    const sent = await output.evaluate(() => window.__styles.slice());
    console.log("    refreshed output: " + JSON.stringify({ head: await head(), styles: sent }));
    assert.deepEqual([...new Set(sent)], ["style_patch"], "the size change goes as a patch");
  });
  assert.deepEqual(errors, []);
  await ctx.close();
}

/**
 * Review 8 (B2): two translations shown in part. The column labels name the
 * versions; only a label that also names the passage (Antenne, Carte:
 * « King James Version · Romans 8:28-29 ») narrows to the verses shown. In
 * « Onglet » the label is the version alone and the tab names the passage:
 * it never becomes « KJV:28 ».
 */
export async function bilingualPartial({ check, open, prepare, BASE }) {
  const { readFileSync } = await import("node:fs");
  const bible = (file) => JSON.parse(readFileSync(new URL("../data/bibles/" + file, import.meta.url), "utf8")).books;
  const LSG = bible("lsg.json"),
    KJV = bible("kjv.json");
  const verses = (books, name, ch, a, b) =>
    Object.values(books).find((x) => x.name === name).chapters.find((c) => c.chapter === ch).verses.filter((v) => v.verse >= a && v.verse <= b);
  const marked = (list) => list.map((v) => `<sup class="verse-num">${v.verse}</sup> ${v.text}`).join(" ");
  const { ctx, studio, output, errors } = await open(1920, 1080);
  /** Labels, verses really shown (primary and second column), the reference on air. */
  const LABELS = () => {
    const card = document.querySelector(".verse-card:not(.vo-probe)");
    if (!card || !card.querySelector(".verse-secondary")) return null;
    const nums = (sel) => Array.from(card.querySelectorAll(sel)).map((s) => Number(s.textContent));
    const roll = card.querySelector(".vo-nums .vo-roll:not(.is-leaving)");
    const second = card.querySelector(".verse-secondary .verse-translation-label").getBoundingClientRect(),
      plate = card.getBoundingClientRect();
    return {
      layout: (document.querySelector("#verse-container").className.match(/layout-(\w+)/) || [])[1],
      labels: Array.from(card.querySelectorAll(".verse-translation-label")).map((l) => l.textContent),
      shown: nums(".vo-copy .verse-text:not(.verse-secondary-text) sup.verse-num"),
      theirs: nums(".verse-secondary-text sup.verse-num"),
      roll: roll ? roll.textContent : "",
      partial: card.dataset.partial || "",
      inside: second.left >= plate.left - 0.5 && second.right <= plate.right + 0.5,
    };
  };
  const judge = (g, where, version, reference) => {
    assert.ok(g, where + ": two translations on air");
    const first = Math.min(...g.shown),
      last = Math.max(...g.shown),
      range = first === last ? String(first) : first + "-" + last,
      tab = g.layout === "onglet",
      abbr = { "Louis Segond 1910": "LSG", "King James Version": "KJV" };
    assert.equal(g.labels[0], tab ? "LSG" : "Louis Segond 1910", where + ": first column names its version");
    const narrowed = g.partial ? reference.replace(/:\d+(-\d+)?$/, ":" + range) : reference;
    assert.equal(g.labels[1], tab ? abbr[version] || version : version + " · " + narrowed, where + ": second column " + JSON.stringify(g));
    assert.ok(g.roll.endsWith(":" + range), where + ": the reference on air names the verses shown " + JSON.stringify(g));
    assert.ok(g.theirs.every((n) => n >= first && n <= last), where + ": second column within the verses shown");
    assert.ok(g.inside, where + ": the label inside the card");
  };
  await check("Two translations in part through the Studio (Onglet sombre, Romains 8:28-30 + KJV, 720p): the labels name the versions", async () => {
    await output.setViewportSize({ width: 1280, height: 720 });
    await studio.evaluate(() => document.querySelector('.quick-styles [data-preset="onglet-sombre"]').click());
    await prepare(studio, "Romains 8:28-30");
    await studio.check("#bilingual-toggle");
    await studio.selectOption("#secondary-version", "kjv");
    await studio.waitForTimeout(700);
    await studio.click("#btn-show");
    await output.waitForFunction(LABELS, null, { timeout: 15000 });
    await output.waitForFunction(SETTLED, null, { timeout: 15000 });
    const g = await output.evaluate(LABELS);
    console.log("    studio 720p: " + JSON.stringify(g));
    assert.equal(g.layout, "onglet");
    assert.ok(g.partial, "this case is shown in part at 720p (review 8)");
    judge(g, "studio 720p", "King James Version", "Romans 8:28-30");
    await studio.click("#btn-hide");
    await output.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    await studio.uncheck("#bilingual-toggle");
  });
  await check("Two translations, whole or in part, 1080p and 720p, long version name: labels are versions, the range is the verses shown; Antenne and Carte unchanged", async () => {
    const seen = [];
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      await output.setViewportSize(viewport);
      for (const preset of ["onglet-sombre", "onglet", "antenne", "studio"])
        for (const [fr, en, ch, a, b, version] of [
          ["Jean", "John", 11, 35, 36, "King James Version"],
          ["Jean", "John", 11, 35, 36, "New Revised Standard Version Updated Edition"],
          ["Romains", "Romans", 8, 28, 30, "King James Version"],
          ["Romains", "Romans", 8, 28, 39, "New Revised Standard Version Updated Edition"],
        ]) {
          const reference = en + " " + ch + ":" + a + "-" + b;
          const msg = {
            type: "show_verse",
            text: verses(LSG, fr, ch, a, b).map((v) => v.text).join(" "),
            html: marked(verses(LSG, fr, ch, a, b)),
            reference: fr + " " + ch + ":" + a + "-" + b,
            version: "Louis Segond 1910",
            secondary: { text: verses(KJV, en, ch, a, b).map((v) => v.text).join(" "), html: marked(verses(KJV, en, ch, a, b)), reference, version, lang: "en" },
          };
          await output.evaluate(() => window.VerseObs.DisplayApp.handleMessage({ type: "hide" }));
          await output.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
          await output.evaluate(
            ({ msg, preset }) => {
              const V = window.VerseObs;
              const settings = Object.assign({}, V.DEFAULTS, V.TEMPLATES[preset].settings, { animation: "none", animationDuration: 0, bgImage: "" });
              V.DisplayApp.handleMessage(Object.assign({}, msg, { settings }));
            },
            { msg, preset },
          );
          await output.waitForFunction(LABELS, null, { timeout: 15000 });
          await output.waitForFunction(SETTLED, null, { timeout: 15000 });
          const g = await output.evaluate(LABELS);
          const where = viewport.height + "p " + preset + " " + reference + " " + version;
          seen.push(where + " " + (g.partial ? "partial" : "whole") + " " + JSON.stringify(g.labels) + " " + g.roll);
          judge(g, where, version, reference);
        }
    }
    console.log("    " + seen.join("\n    "));
    assert.ok(seen.some((s) => / onglet.* partial /.test(s)) && seen.some((s) => / antenne .* partial /.test(s)) && seen.some((s) => / studio .* partial /.test(s)), "partial cases reached in every layout");
    assert.ok(seen.some((s) => / whole /.test(s)), "a whole case too");
  });
  assert.deepEqual(errors, []);
  await ctx.close();
}
