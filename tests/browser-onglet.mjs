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
