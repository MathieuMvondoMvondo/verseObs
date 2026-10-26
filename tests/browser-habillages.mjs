// « Ruban » and « Facettes » (Math, 26/10, second reference): two broadcast
// graphics with a drawn silhouette, added next to Antenne, Carte and Onglet.
//  - Ruban: a white sculpted band, fine stripes fading into it at its left
//    end (and at the end of its lower return), a concave circular cut on the
//    right around a dark medallion, white returns above and below it, an
//    orange tab on top with the reference and the short version.
//  - Facettes: tense, angular planes; the reference lives in a coloured
//    shoulder that rises above the text plane (asymmetric), the plane's end
//    is cut off in a second facet.
// Motion and composition checks run in tests/browser-motion.mjs, the real
// Studio paths in tests/browser-studio.mjs (section « habillages »).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What the audience sees of a Ruban or Facettes graphic (screen px). */
export const GEOMETRY = () => {
  const card = document.querySelector(".verse-card:not(.vo-probe)");
  if (!card) return null;
  const shown = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0;
  };
  const box = (el) => {
    if (!shown(el)) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height } : null;
  };
  const q = (s) => card.querySelector(s);
  const medal = q(".vo-medal");
  // Every line box of every reading text, as the audience sees it.
  const lines = [];
  card.querySelectorAll(".vo-copy .verse-text, .vo-copy .verse-title, .vo-copy .verse-translation-label").forEach((t) => {
    const range = document.createRange();
    range.selectNodeContents(t);
    Array.from(range.getClientRects()).forEach((r) => {
      if (r.width > 1 && r.height > 1) lines.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
    });
  });
  // Any thin vertical stroke painted in the graphic (an accent bar or rule),
  // pseudo-elements included: Math, 26/10, no coloured band beside a text.
  const bars = [];
  card.querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || Number(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
    if (filled && r.width > 0 && r.width <= 8 && r.height >= 20) bars.push("bar " + el.className);
    for (const side of ["Left", "Right"])
      if (parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none") bars.push("border-" + side.toLowerCase() + " " + el.className);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === "none" || ps.display === "none") continue;
      const w = parseFloat(ps.width), h = parseFloat(ps.height);
      if ((ps.backgroundColor !== "rgba(0, 0, 0, 0)" || ps.backgroundImage !== "none") && w > 0 && w <= 8 && h >= 20) bars.push(pseudo + " " + el.className);
      if (parseFloat(ps.borderLeftWidth) > 0 && ps.borderLeftStyle !== "none") bars.push(pseudo + " border-left " + el.className);
    }
  });
  const mcs = shown(medal) ? getComputedStyle(medal) : null;
  const tab = q(".vo-margin");
  return {
    layout: document.querySelector("#verse-container").className,
    frame: { w: innerWidth, h: innerHeight },
    plate: box(q(".vo-plate")),
    tab: box(tab),
    tabText: shown(tab) ? tab.innerText.replace(/\s+/g, " ").trim() : "",
    tabClipped: shown(tab) ? tab.scrollWidth > tab.clientWidth + 1 : false,
    medal: box(medal),
    medalRound: mcs ? mcs.borderTopLeftRadius === "50%" || parseFloat(mcs.borderTopLeftRadius) >= parseFloat(mcs.width) / 2 - 0.5 : false,
    medalText: shown(medal) ? medal.innerText.replace(/\s+/g, " ").trim() : "",
    stripes: box(q(".vo-stries")),
    retHaut: box(q(".vo-ret-haut")),
    retBas: box(q(".vo-ret-bas")),
    lines,
    copyText: q(".vo-copy") ? q(".vo-copy").innerText.replace(/\s+/g, " ").trim() : "",
    primary: q(".vo-copy > .verse-text") ? q(".vo-copy > .verse-text").textContent.replace(/\s+/g, " ").trim() : "",
    second: box(q(".verse-secondary")),
    primaryBox: box(q(".vo-copy > .verse-text")),
    // The plan's place, where the graphic shows it (Facettes: under the
    // text; Ruban: in its medallion).
    plan: shown(q(".vo-plan")) ? q(".vo-plan").textContent : shown(medal) ? medal.innerText.trim() : "",
    partial: card.dataset.partial || "",
    roll: q(".vo-nums .vo-roll:not(.is-leaving)") ? q(".vo-nums .vo-roll:not(.is-leaving)").textContent : "",
    body: q(".vo-copy .verse-text") ? parseFloat(getComputedStyle(q(".vo-copy .verse-text")).fontSize) : 0,
    nLines: Array.from(card.querySelectorAll(".vo-copy .verse-text")).map((t) => Math.round(t.offsetHeight / parseFloat(getComputedStyle(t).lineHeight))),
    bars,
    clip: q(".vo-plate") ? getComputedStyle(q(".vo-plate")).clipPath : "",
    // Ruban's declared cut radius (frame px): the slot's arcs.
    cutR: parseFloat(getComputedStyle(document.querySelector("#verse-container")).getPropertyValue("--rb-cut")) || 0,
  };
};

const overlap = (a, b, e = 0.5) => !!a && !!b && a.l < b.r - e && a.r > b.l + e && a.t < b.b - e && a.b > b.t + e;

/**
 * A Ruban or Facettes graphic on air: the whole text, inside the frame, no
 * decoration over a letter, the medallion a true circle, no accent bar.
 */
export function habillageOk(g, where, { style, tab = true, part = false, position = "lower-third" } = {}) {
  assert.ok(g, where + ": nothing on air");
  assert.match(g.layout, new RegExp("layout-" + style), where + ": " + style + " layout");
  assert.ok(g.layout.split(/\s+/).includes(position), where + ": position " + position + " (" + g.layout + ")");
  if (part) assert.ok(g.partial && g.tabText.includes(g.roll), where + ": whole verses, named on the graphic (" + g.tabText + ")");
  else assert.equal(g.partial, "", where + ": text whole");
  const safeX = g.frame.w * 0.05 - 1,
    safeY = g.frame.h * 0.05 - 1,
    scale = g.frame.h / 1080;
  for (const [name, b] of [["band", g.plate], ["tab", g.tab], ["medallion", g.medal], ["upper return", g.retHaut], ["lower return", g.retBas]]) {
    if (!b) continue;
    assert.ok(b.l >= safeX && b.r <= g.frame.w - safeX, where + ": " + name + " inside the safe area horizontally " + JSON.stringify(b));
    assert.ok(b.t >= safeY && b.b <= g.frame.h - safeY, where + ": " + name + " inside the safe area vertically " + JSON.stringify(b));
  }
  assert.ok(g.plate, where + ": band painted");
  assert.ok(g.lines.length > 0, where + ": text lines measured");
  for (const line of g.lines) {
    assert.ok(line.t >= g.plate.t - 0.5 && line.b <= g.plate.b + 0.5 && line.l >= g.plate.l - 0.5, where + ": every line inside the band " + JSON.stringify([line, g.plate]));
    for (const [name, b] of [["stripes", g.stripes], ["medallion", g.medal], ["upper return", g.retHaut], ["lower return", g.retBas], ["tab", g.tab]])
      assert.ok(!overlap(line, b), where + ": no " + name + " over a letter " + JSON.stringify([line, b]));
  }
  assert.deepEqual(g.bars, [], where + ": no accent bar, rule or side stroke");
  assert.ok(g.body >= 31.5, where + ": body " + g.body + " px");
  assert.ok(Math.max(0, ...g.nLines) <= 4 || position === "center" || position === "fullscreen", where + ": at most 4 lines per block " + JSON.stringify(g.nLines));
  if (style === "ruban") {
    assert.ok(g.medal && g.medalRound, where + ": a medallion");
    assert.ok(Math.abs(g.medal.w - g.medal.h) <= 0.5, where + ": the medallion is a circle, never an ellipse " + JSON.stringify(g.medal));
    assert.ok(g.stripes && g.retHaut && g.retBas, where + ": stripes and both returns");
    // The concave cut: between the two returns, its arcs centred on the
    // medallion's vertical (a circle for two lines, a slot when taller),
    // never reaching a letter.
    const cut = { cx: (g.medal.l + g.medal.r) / 2, cy: (g.retHaut.b + g.retBas.t) / 2, r: g.cutR * scale, slot: g.retBas.t - g.retHaut.b };
    assert.ok(cut.r > 0 && cut.slot >= 2 * cut.r - 1, where + ": the slot holds the whole cut " + JSON.stringify(cut));
    assert.ok(Math.abs(cut.cy - (g.medal.t + g.medal.b) / 2) <= 1, where + ": the medallion centred in its cut");
    assert.ok(cut.r > g.medal.w / 2 + 2 * scale, where + ": a gap between the cut and the medallion");
    for (const line of g.lines) assert.ok(line.r <= cut.cx - cut.r + 0.5, where + ": no letter inside the cut " + JSON.stringify([line, cut]));
    assert.ok(g.retHaut.r > g.retBas.r, where + ": the upper return reaches further than the lower one");
    if (tab) {
      assert.ok(g.tab, where + ": tab painted");
      assert.ok(Math.abs(g.tab.b - g.plate.t) <= 1.5 * scale, where + ": the tab stands on the band " + JSON.stringify([g.tab, g.plate]));
      assert.equal(g.tabClipped, false, where + ": reference whole in its tab");
    } else assert.equal(g.tab, null, where + ": no tab");
  } else {
    assert.equal(g.medal, null, where + ": no medallion in Facettes");
    if (tab) {
      assert.ok(g.tab, where + ": shoulder painted");
      assert.equal(g.tabClipped, false, where + ": reference whole in its shoulder");
      assert.ok(g.tab.r <= g.lines.reduce((m, x) => Math.min(m, x.l), Infinity) + 0.5, where + ": the shoulder beside the text, never over it");
    } else assert.equal(g.tab, null, where + ": no shoulder without a reference or a title");
  }
}

const LSG = require(path.join(ROOT, "data/bibles/lsg.json")).books;
/** The exact text of a verse in the bundled LSG. */
export function lsgText(name, chapter, number) {
  return Object.values(LSG).find((b) => b.name === name).chapters.find((c) => c.chapter === chapter).verses.find((v) => v.verse === number).text;
}
const squash = (s) => String(s).replace(/\s+/g, " ").trim();

/** Motion and composition checks (tests/browser-motion.mjs). */
export async function habillagesMotion(t) {
  const { check, open, verse, ROM, SONG, FREE, sendStyled, frames, send, settle, openRecorded, anims } = t;
  const EPH = verse("Éphésiens", 6, 15);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    const o = await open("no-preference", viewport);
    const label = viewport.width + "×" + viewport.height;
    await check("Ruban and Facettes " + label + ": every case whole, inside the frame, no decoration over a letter, a round medallion", async () => {
      const shown = async (msg, preset, extra) => {
        await sendStyled(o.page, msg, preset, { animation: "none", ...extra });
        await o.page.waitForTimeout(250);
        return o.page.evaluate(GEOMETRY);
      };
      const medals = [];
      for (const style of ["ruban", "facettes"]) {
        let g = await shown(EPH, style);
        habillageOk(g, style + " Éphésiens 6:15", { style });
        assert.equal(squash(g.primary), squash("15 " + lsgText("Éphésiens", 6, 15)).replace(/^15 /, "15"), "the exact LSG text");
        assert.match(g.tabText, /^(ÉPHÉSIENS|Éphésiens) 6:15 LSG$/, style + ": reference, then the short version");
        if (style === "ruban") medals.push(g.medal.w);
        g = await shown(verse("Jean", 3, 16), style);
        habillageOk(g, style + " Jean 3:16", { style });
        g = await shown(verse("Cantique des Cantiques", 2, 10, 13), style);
        habillageOk(g, style + " Cantique 2:10-13", { style, part: !!g.partial });
        g = await shown({ ...verse("Psaumes", 119, 5, 8), part: 2, parts: 6 }, style);
        habillageOk(g, style + " Psaumes 119:5-8 (plan 2/6)", { style });
        assert.equal(g.plan, "2/6", style + ": the plan's place");
        if (style === "ruban") assert.equal(g.medalText, "2/6", "Ruban: the plan's place in the medallion");
        // A long passage, at the most lines a band takes: same medallion.
        g = await shown(verse("Psaumes", 119, 1, 24), style);
        habillageOk(g, style + " Psaumes 119:1-24 (too long)", { style, part: true });
        assert.ok(Math.max(...g.nLines) >= 3, style + ": a long passage uses 3 to 4 lines " + JSON.stringify(g.nLines));
        if (style === "ruban") medals.push(g.medal.w);
        g = await shown(ROM, style);
        habillageOk(g, style + " Romains 8:28 LSG/KJV", { style });
        assert.ok(g.second && g.second.l >= g.primaryBox.r, style + ": the two translations side by side");
        assert.match(g.copyText, /LSG.*KJV/, style + ": each column named by its version");
        g = await shown(SONG, style);
        habillageOk(g, style + " chant", { style });
        assert.match(g.tabText, /^(Chant d'entrée|CHANT D'ENTRÉE)$/, style + ": the song's title on the graphic");
        assert.ok(!/Chant d'entrée/i.test(g.copyText), style + ": lyrics only in the band");
        g = await shown(FREE, style);
        habillageOk(g, style + " texte libre", { style, tab: false });
        for (const position of ["upper-third", "center", "fullscreen"]) {
          g = await shown(EPH, style, { position });
          habillageOk(g, style + " Éphésiens 6:15 " + position, { style, position });
        }
      }
      // 2 lines or 4: the same circle, never stretched.
      assert.ok(Math.abs(medals[0] - medals[1]) <= 0.5, "the medallion keeps its size from 2 to 4 lines " + JSON.stringify(medals));
    });
    assert.deepEqual(o.errors, []);
    await o.ctx.close();
  }

  const end = (list) => Math.max(0, ...list.map((x) => x.delay + x.duration));
  const uniform = (s) => !/scale[XY]\(|matrix|skew/.test(s) && [...s.matchAll(/scale\(([^)]*)\)/g)].every((m) => m[1].split(",").length === 1);
  const P1 = { ...verse("Psaumes", 119, 1, 2), part: 1, parts: 3 },
    P2 = { ...verse("Psaumes", 119, 3, 4), part: 2, parts: 3 };
  const rec = await openRecorded("no-preference");
  await check("Ruban and Facettes motion: the shape enters, then the text; a plan change keeps the shape; Masquer is quicker; an interruption ends on air", async () => {
    const p = rec.page;
    for (const style of ["ruban", "facettes"]) {
      await anims(p);
      await frames(p);
      await sendStyled(p, EPH, style);
      await settle(p, 1400);
      let list = await anims(p);
      const shape = list.filter((x) => /vo-plate|vo-medal|vo-margin/.test(x.cls)),
        text = list.filter((x) => /vo-copy/.test(x.cls));
      assert.ok(shape.length >= 2 && text.length === 1, style + ": the shape and the text move: " + JSON.stringify(list.map((x) => x.cls)));
      const shapeStart = Math.min(...shape.map((x) => x.delay));
      assert.ok(text[0].delay >= shapeStart + 120, style + ": the text waits for the shape (" + text[0].delay + " ms after " + shapeStart + ")");
      assert.match(text[0].from, /"opacity":"0"/, style + ": the text fades in");
      assert.ok(list.every((x) => uniform(x.from + x.to)), style + ": no stretched shape: " + JSON.stringify(list.filter((x) => !uniform(x.from + x.to)).slice(0, 2)));
      assert.ok(list.every((x) => !/--vo-reveal/.test(x.from + x.to)), style + ": no reading mask");
      const enter = end(list);
      assert.ok(enter <= 900, style + ": a short entrance (" + enter + " ms)");
      let g = await p.evaluate(GEOMETRY);
      habillageOk(g, style + " after the entrance", { style });
      assert.match(g.clip, /^(none|inset\(0px\))$/, style + ": nothing left clipped (" + g.clip + ")");
      // A plan change: the shape stays on air, only the text changes.
      await sendStyled(p, P1, style);
      await settle(p, 1400);
      await frames(p);
      await anims(p);
      await sendStyled(p, P2, style);
      await settle(p, 1400);
      const f = await frames(p);
      list = await anims(p);
      assert.ok(f.every((x) => x.card) && Math.min(...f.map((x) => x.plate)) > 0.999, style + ": the shape never fades between two plans");
      // (the plan's number in the medallion, .vo-medal-plan, cross-fades)
      const shapePart = /(^|\s)(vo-plate|vo-medal|vo-margin|verse-body)(\s|$)/;
      assert.ok(!list.some((x) => shapePart.test(x.cls) && /"opacity":"0"|clipPath/.test(x.from + x.to)), style + ": the shape never leaves: " + JSON.stringify(list.map((x) => x.cls + " " + x.from).slice(0, 4)));
      assert.ok(list.some((x) => /vo-copy/.test(x.cls)), style + ": the text changes");
      g = await p.evaluate(GEOMETRY);
      habillageOk(g, style + " plan 2", { style });
      assert.equal(g.plan, "2/3");
      // Masquer: quicker than the entrance.
      await send(p, { type: "hide" });
      await settle(p, 900);
      list = await anims(p);
      assert.equal((await frames(p)).pop().card, false, style + ": output empty");
      assert.ok(list.length > 0 && end(list) < enter, style + ": Masquer (" + end(list) + " ms) quicker than the entrance (" + enter + " ms)");
      // Interrupted: Masquer during the entrance, then Diffuser again.
      await sendStyled(p, EPH, style);
      await p.waitForTimeout(140);
      await send(p, { type: "hide" });
      await p.waitForTimeout(90);
      await sendStyled(p, EPH, style);
      await settle(p, 1600);
      g = await p.evaluate(GEOMETRY);
      habillageOk(g, style + " after an interruption", { style });
      assert.match(g.clip, /^(none|inset\(0px\))$/, style + ": nothing left clipped after an interruption (" + g.clip + ")");
      const last = (await frames(p)).pop();
      assert.ok(last.card && last.copy === 1 && last.leaving === 0 && last.plate > 0.999, style + ": fully on air after an interruption " + JSON.stringify(last));
      await send(p, { type: "hide" });
      await settle(p, 800);
    }
  });
  assert.deepEqual(rec.errors, []);
  await rec.ctx.close();

  const recReduced = await openRecorded("reduce");
  await check("Ruban and Facettes with reduced motion: a fade, nothing moves", async () => {
    const p = recReduced.page;
    for (const style of ["ruban", "facettes"]) {
      await frames(p);
      await anims(p);
      await sendStyled(p, P1, style);
      await settle(p, 900);
      await sendStyled(p, P2, style);
      await settle(p, 900);
      await send(p, { type: "hide" });
      await settle(p, 700);
      const f = await frames(p),
        list = await anims(p);
      assert.ok(list.length > 0, style + ": still a fade");
      assert.ok(list.every((x) => !/translate|scale|clipPath/.test(x.from + x.to) || /translateY\(0px\)|none/.test(x.from)), style + ": opacity only: " + JSON.stringify(list.filter((x) => /translate|scale|clipPath/.test(x.from + x.to)).slice(0, 2)));
      assert.ok(f.every((x) => !x.moved), style + ": nothing moves on screen");
      assert.equal(f[f.length - 1].card, false);
    }
  });
  assert.deepEqual(recReduced.errors, []);
  await recReduced.ctx.close();
}

/**
 * Antenne, Carte, Onglet clair and Onglet sombre: exactly the composition
 * measured on 2060f1e before Ruban and Facettes (tests/fixtures/styles-2060f1e.json,
 * styles-graphiques/outils/styles-px.mjs).
 */
export async function existingUnchanged({ check, open, verse, ROM, SONG }) {
  const FIXTURE = require(path.join(ROOT, "tests/fixtures/styles-2060f1e.json")).shots;
  await check("Antenne, Carte, Onglet clair and Onglet sombre keep the composition of 2060f1e (5 cases, 1080p and 720p)", async () => {
    const cases = {
      "jean-3-16": verse("Jean", 3, 16),
      "psaume-119-plan-2": { ...verse("Psaumes", 119, 5, 8), part: 2, parts: 6 },
      "romains-8-28-lsg-kjv": ROM,
      chant: SONG,
      "ephesiens-6-15": verse("Éphésiens", 6, 15),
    };
    let compared = 0;
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      const o = await open("no-preference", viewport);
      for (const style of ["antenne", "carte", "onglet-clair", "onglet-sombre"])
        for (const [name, msg] of Object.entries(cases)) {
          const got = await o.page.evaluate(
            async ({ msg, style }) => {
              const V = window.VerseObs,
                song = msg.type === "show_text",
                key = { antenne: "antenne", carte: song ? "chant" : "studio", "onglet-clair": "onglet", "onglet-sombre": "onglet-sombre" }[style],
                presets = song ? V.FREETEXT_STYLES : V.TEMPLATES;
              const settings = Object.assign({}, song ? V.FREETEXT_DEFAULTS : V.DEFAULTS, presets[key].settings, { animation: "none", animationDuration: 0, bgImage: "" });
              V.DisplayApp.handleMessage({ type: "hide" });
              await new Promise((r) => setTimeout(r, 60));
              V.DisplayApp.handleMessage(Object.assign({}, msg, { settings }));
              await new Promise((r) => setTimeout(r, 450));
              await document.fonts.ready;
              const card = document.querySelector(".verse-card:not(.vo-probe)");
              const box = (el) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
              };
              return {
                layout: document.querySelector("#verse-container").className,
                partial: card.dataset.partial || "",
                fit: card.dataset.fit,
                card: box(card),
                copy: box(card.querySelector(".vo-copy")),
                margin: box(card.querySelector(".vo-margin")),
                plate: box(card.querySelector(".vo-plate")),
                text: card.innerText.replace(/\s+/g, " ").trim().slice(0, 220),
              };
            },
            { msg, style },
          );
          const want = FIXTURE[`${style}-${name}-${viewport.width}x${viewport.height}`];
          assert.ok(want, "fixture for " + style + " " + name);
          for (const key of ["layout", "partial", "fit", "text"]) assert.equal(got[key], want[key], `${style} ${name} ${viewport.width}: ${key}`);
          for (const key of ["card", "copy", "margin", "plate"])
            for (const k of ["x", "y", "w", "h"])
              assert.ok(Math.abs(got[key][k] - want[key][k]) <= 0.5, `${style} ${name} ${viewport.width}: ${key}.${k} ${got[key][k]} ≠ ${want[key][k]}`);
          compared++;
        }
      assert.deepEqual(o.errors, []);
      await o.ctx.close();
    }
    assert.equal(compared, 40);
  });
}

/** The real Studio: menus, editor, conductor, songs, projector, monitors. */
export async function habillagesStudio({ check, open, prepare, BASE }) {
  const { ctx, studio, output, errors } = await open(1920, 1080);
  const projector = await ctx.newPage();
  projector.on("pageerror", (e) => errors.push("projector: " + e.message));
  await projector.setViewportSize({ width: 1280, height: 720 });
  await projector.goto(`${BASE}/browser_source.html?projector=1`);
  // Every card that appears on the OBS output, with its layout at that moment
  // (a style repaired afterwards would show a first card in another layout).
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
  const SETTLED = () => {
    const card = document.querySelector(".verse-card:not(.vo-probe)");
    if (!card || document.querySelector(".vo-probe")) return false;
    const copy = card.querySelector(".vo-copy");
    const moving = document.getAnimations().some((a) => a.playState === "running" || a.playState === "pending");
    return !moving && !card.querySelector(".is-leaving") && !!copy && getComputedStyle(copy).opacity === "1";
  };
  const settle = async (page, test) => {
    await page.waitForFunction(SETTLED, null, { timeout: 15000 });
    if (test) await page.waitForFunction(test, null, { timeout: 15000 });
    await page.waitForTimeout(150);
    return page.evaluate(GEOMETRY);
  };
  const visible = (selectors) =>
    studio.evaluate((list) => list.find((s) => { const el = document.querySelector(s); return el && el.getClientRects().length && !el.disabled; }) || "", selectors);
  const take = async () => studio.click(await visible(["#btn-show", "#btn-queue-show"]));
  const hide = async () => studio.click(await visible(["#btn-hide", "#btn-queue-hide"]));
  const gone = async () => {
    await output.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    await projector.waitForFunction(() => !document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
  };
  const monitorSeen = async (id) => {
    const frame = await (await studio.$(id)).contentFrame();
    await frame.waitForFunction(SETTLED, null, { timeout: 15000 });
    return frame.evaluate(GEOMETRY);
  };

  await check("Ruban from the real Studio: chosen in the Style menu, Éphésiens 6:15 broadcast from the editor — the exact LSG text, tab and medallion on OBS, projector and both monitors", async () => {
    await studio.selectOption("#style-select", "ruban");
    await prepare(studio, "Éphésiens 6:15");
    await take();
    const g = await settle(output, () => document.querySelector("#verse-container.layout-ruban"));
    const p = await settle(projector, () => document.querySelector("#verse-container.layout-ruban"));
    console.log("    Éphésiens 6:15: " + JSON.stringify({ tab: g.tabText, medal: g.medal && [Math.round(g.medal.w), Math.round(g.medal.h)], lines: g.nLines, cards: await output.evaluate(() => window.__cards) }));
    habillageOk(g, "OBS, Éphésiens 6:15", { style: "ruban" });
    habillageOk(p, "projector, Éphésiens 6:15", { style: "ruban", position: "center" });
    assert.equal(g.tabText, "Éphésiens 6:15 LSG");
    assert.equal(squash(g.primary), squash("15" + lsgText("Éphésiens", 6, 15)), "the exact LSG text, opened by its number");
    assert.deepEqual(await output.evaluate(() => window.__cards.filter((c) => !/layout-ruban/.test(c))), [], "the first card is already Ruban: the style came with Diffuser");
    const preview = await monitorSeen("#preview-frame"),
      program = await monitorSeen("#program-frame");
    for (const [name, m] of [["preview monitor", preview], ["program monitor", program]]) {
      habillageOk(m, name, { style: "ruban" });
      assert.equal(m.tabText, g.tabText, name + ": same tab");
      assert.equal(m.primary, g.primary, name + ": same text");
      assert.deepEqual(m.nLines, g.nLines, name + ": same lines");
    }
    await studio.waitForFunction(() => document.querySelector("#onair-bar").dataset.state === "live", null, { timeout: 10000 });
    assert.match(await studio.textContent("#onair-bar"), /Sortie confirmée/);
    await hide();
    await gone();
  });

  await check("Ruban from the conductor, Facettes for a song: a passage split in plans, Suivant then Diffuser shows plan 2/N whole; the song's title in the Facettes shoulder", async () => {
    await prepare(studio, "Psaumes 119:1-24");
    await studio.waitForFunction(() => { const b = document.querySelector("#btn-split"); return b && !b.hidden && !b.disabled && /Découper en \d+ plans/.test(b.textContent); }, null, { timeout: 20000 });
    const n = Number(/(\d+) plans/.exec(await studio.textContent("#btn-split"))[1]);
    await studio.click("#btn-split");
    await studio.waitForFunction((n) => document.querySelectorAll("#queue-container .cp-queue-item").length >= n, n);
    const rows = await studio.evaluate(() => Array.from(document.querySelectorAll("#queue-container .cp-queue-item")).map((r) => r.dataset.label));
    await studio.evaluate(() => document.querySelector("#tab-btn-2").click());
    await studio.evaluate(() => document.querySelector("#queue-container .cp-queue-item").click());
    await take();
    let g = await settle(output, () => (document.querySelector(".vo-plan")?.textContent || "").startsWith("1/"));
    habillageOk(g, "OBS, plan 1", { style: "ruban" });
    await studio.click("#btn-queue-next");
    await take();
    g = await settle(output, () => (document.querySelector(".vo-plan")?.textContent || "").startsWith("2/"));
    console.log("    Ruban plan 2: " + JSON.stringify({ n, tab: g.tabText, medal: g.medalText, lines: g.nLines }));
    habillageOk(g, "OBS, plan 2", { style: "ruban" });
    assert.equal(g.medalText, "2/" + n, "the plan's place in the medallion");
    assert.equal(g.tabText, rows[1] + " LSG", "the tab names the plan's verses");
    await hide();
    await gone();
    await studio.evaluate(() => document.querySelector("#tab-btn-1").click());
    // (the song styles' row, clicked like the Onglet section does)
    await studio.evaluate(() => document.querySelector('#freetext-presets [data-ft-preset="facettes"]').click());
    assert.equal(await studio.getAttribute('#freetext-presets [data-ft-preset="facettes"]', "aria-pressed"), "true", "« Facettes » chosen for the songs");
    await studio.fill("#freetext-title", "Chant d’entrée");
    await studio.evaluate(() => {
      const e = document.querySelector("#freetext-editable");
      e.innerText = "À toi la gloire, ô Ressuscité !\nÀ toi la victoire pour l’éternité !";
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await studio.click("#btn-free-show");
    g = await settle(output, () => document.querySelector("#verse-container.layout-facettes") && (document.querySelector(".vo-margin")?.textContent || "").includes("Chant"));
    console.log("    Facettes song: " + JSON.stringify({ tab: g.tabText, text: g.copyText.slice(0, 40) }));
    habillageOk(g, "OBS, song", { style: "facettes" });
    assert.match(g.tabText, /^(Chant d’entrée|CHANT D’ENTRÉE)$/);
    assert.match(g.copyText, /Ressuscité.*éternité/);
    await hide();
    await gone();
    await studio.evaluate(() => document.querySelector("#tab-btn-0").click());
  });
  assert.deepEqual(errors, []);
  await ctx.close();
}

/**
 * An OBS source left on 2060f1e: it reports caps ["style-patch", "onglet"]
 * and draws another look for a layout it does not know. Like any output
 * older than the Studio (N7), it is never « Sortie confirmée » and the régie
 * asks to refresh it — for Ruban and Facettes above all, for Onglet too
 * (the minimal rule: every capability of this Studio must be announced).
 */
export async function olderOutputHabillage({ check, open, prepare }) {
  const { ctx, studio, output, errors } = await open(1920, 1080);
  const older = async (route) => {
    const r = await route.fetch();
    const body = (await r.text()).replace(/caps: \[[^\]]*\],/, 'caps: ["style-patch", "onglet"],');
    await route.fulfill({ response: r, body });
  };
  await output.route("**/assets/js/display/app.js*", older);
  await output.reload();
  assert.equal(await output.evaluate(() => fetch("assets/js/display/app.js").then((r) => r.text()).then((t) => /caps: \["style-patch", "onglet"\],/.test(t))), true);
  const head = () =>
    studio.evaluate(() => ({
      state: document.querySelector("#onair-bar").dataset.state,
      label: document.querySelector("#onair-bar .cp-onair-label").textContent,
      note: document.querySelector("#program-note").hidden ? "" : document.querySelector("#program-note").textContent,
    }));
  await check("An OBS source left on 2060f1e (no Ruban, no Facettes): never « Sortie confirmée », the régie asks to refresh it, Onglet included", async () => {
    const seen = {};
    for (const style of ["ruban", "facettes", "onglet"]) {
      await studio.selectOption("#style-select", style);
      await prepare(studio, style === "onglet" ? "Jean 3:16" : "Éphésiens 6:15");
      await studio.click("#btn-show");
      await output.waitForFunction(() => document.querySelector(".verse-card:not(.vo-probe)"), null, { timeout: 10000 });
      await studio.waitForFunction(() => document.querySelector("#onair-bar").dataset.state === "live", null, { timeout: 10000 });
      // Two pings of the older output (3 s each) after the take.
      await studio.waitForTimeout(3500);
      seen[style] = await head();
    }
    console.log("    older output: " + JSON.stringify(seen));
    for (const style of ["ruban", "facettes"]) {
      assert.notEqual(seen[style].label, "Sortie confirmée", style + ": no confirmation of a look the output cannot draw");
      assert.equal(seen[style].label, "Sortie à actualiser", style);
      assert.match(seen[style].note, /actualisez/i, style + ": the régie asks to refresh the source");
      assert.match(seen[style].note, style === "ruban" ? /Ruban/ : /Facettes/, style + ": the note names the style");
    }
    assert.equal(seen.onglet.label, "Sortie à actualiser", "Onglet: an older output all the same");
    assert.match(seen.onglet.note, /actualisez/i);
    await studio.click("#btn-hide");
  });
  // Integration (26/10) with review 8 (B3): an output that takes live changes
  // (style_patch) but draws neither Ruban nor Facettes (26798b6) is older too;
  // refreshed to this version (all four caps), it replaces it: confirmed.
  await check("An output with style_patch but without Ruban and Facettes is « à actualiser »; refreshed with the four caps it is « Sortie confirmée »", async () => {
    await output.unroute("**/assets/js/display/app.js*");
    await output.route("**/assets/js/display/app.js*", async (route) => {
      const r = await route.fetch();
      const body = (await r.text()).replace(/caps: \[[^\]]*\],/, 'caps: [MSG.STYLE_PATCH, "onglet"],');
      await route.fulfill({ response: r, body });
    });
    await output.reload();
    assert.equal(await output.evaluate(() => fetch("assets/js/display/app.js").then((r) => r.text()).then((t) => /caps: \[MSG\.STYLE_PATCH, "onglet"\],/.test(t))), true);
    await studio.selectOption("#style-select", "ruban");
    await prepare(studio, "Éphésiens 6:15");
    await studio.click("#btn-show");
    await output.waitForFunction(() => document.querySelector("#verse-container.layout-ruban .verse-card:not(.vo-probe)"), null, { timeout: 10000 });
    // Past LEGACY_QUIET (7 s) since the 2060f1e page above last answered:
    // only this page's own caps can keep the warning now (a Studio that took
    // style_patch + onglet for « à jour » would confirm it here).
    await studio.waitForTimeout(10500);
    const partial = await head();
    await output.unroute("**/assets/js/display/app.js*");
    await output.reload();
    assert.equal(await output.evaluate(() => fetch("assets/js/display/app.js").then((r) => r.text()).then((t) => /caps: \[MSG\.STYLE_PATCH, "onglet", "ruban", "facettes"\],/.test(t))), true);
    await studio.click("#btn-show");
    // The older page is replaced once it has been quiet for 7 s.
    await studio.waitForFunction(() => document.querySelector("#onair-bar .cp-onair-label").textContent === "Sortie confirmée", null, { timeout: 20000 });
    const whole = await head();
    console.log("    style_patch without Ruban/Facettes: " + JSON.stringify(partial) + ", refreshed: " + JSON.stringify(whole));
    assert.equal(partial.label, "Sortie à actualiser");
    assert.match(partial.note, /actualisez/i);
    assert.equal(whole.label, "Sortie confirmée");
    assert.equal(whole.note, "");
    await studio.click("#btn-hide");
  });
  assert.deepEqual(errors, []);
  await ctx.close();
}
