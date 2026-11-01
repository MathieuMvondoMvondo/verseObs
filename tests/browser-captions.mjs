// Live English captions in a real browser: Studio card, phone page, OBS gate.
//   CHROMIUM=… PLAYWRIGHT_CORE=… node tests/browser-captions.mjs
// Simulated service by default. With ECOUTE_PYTHON (+ ECOUTE_FICHIER, ECOUTE_DUREE,
// ECOUTE_TRADUCTEUR, ECOUTE_MODELE) the real tools/ecoute service listens to a
// sermon extract at live pace, and arrival times are written for measurements.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createServer } = require(path.join(ROOT, "tools", "server.js"));
const PW = process.env.PLAYWRIGHT_CORE;
const CHROMIUM = process.env.CHROMIUM;
if (!PW || !CHROMIUM) {
  console.error("PLAYWRIGHT_CORE et CHROMIUM sont obligatoires (aucun test sauté en silence).");
  process.exit(2);
}
const { chromium } = await import(PW);
const PORT = Number(process.env.CAPTIONS_PORT || 18640);
const REAL = !!process.env.ECOUTE_PYTHON;
const TAG = REAL ? "reel" : "simule";
const OUT = path.join(ROOT, "artifacts", "captures");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ROOT, "artifacts", "mesures"), { recursive: true });

let passed = 0;
async function check(name, fn) {
  const t = Date.now();
  try {
    await fn();
    passed++;
    console.log("ok   " + name + " (" + (Date.now() - t) + " ms)");
  } catch (err) {
    console.log("FAIL " + name);
    throw err;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(PORT, { captions: { addresses: ["127.0.0.1"], port: 0 } });
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
const errors = [];
let fake = null,
  proc = null;

// ---- the listening service: simulated, or the real one ----
const LINES = [
  "Christ finished the work on the cross, perfectly and completely.",
  "His life comes into us. Amen.",
  "This is what we call the new birth.",
  "You are born again, born of the Spirit: you become a child of God.",
  "Your nature changes, so you can no longer live the way you used to.",
  "The things you were comfortable with will no longer be comfortable.",
];
function startFake() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/verseobs-relay`, {
    headers: { Origin: `http://127.0.0.1:${PORT}` },
  });
  const state = {
    status: "idle",
    devices: [
      { index: 1, name: "Microphone (Realtek(R) Audio)", api: "Windows WASAPI" },
      { index: 2, name: "Entrée ligne (table de mixage USB)", api: "Windows WASAPI" },
    ],
    model: "whisper-small-int8",
    translator: "opus-mt-fr-en",
    latency: {},
    backlog: 0,
    cpu: 31,
    ram: 690,
  };
  let k = 0;
  const commands = [];
  const send = (m) => ws.send(JSON.stringify(Object.assign({ id: "fake-" + ++k, ts: Date.now() }, m)));
  const beat = setInterval(() => ws.readyState === 1 && send({ type: "caption_engine", state }), 500);
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type !== "caption_command") return;
    commands.push(m);
    if (m.action === "start") {
      state.status = "listening";
      state.source = "Entrée ligne (table de mixage USB)";
      state.device = m.device;
    } else state.status = "idle";
    send({ type: "caption_engine", state });
  });
  return {
    ws,
    commands,
    state,
    async say(en, fr, latency) {
      state.latency = { last: latency, avg: 3.4, max: 4.1, count: k };
      send({ type: "caption", caption: { en, fr, end: Date.now() - latency * 1000, latency } });
      await sleep(60);
    },
    stop() {
      clearInterval(beat);
      ws.terminate();
    },
  };
}
function startReal() {
  const args = [
    path.join(ROOT, "tools", "ecoute", "ecoute.py"),
    "--relais", `ws://127.0.0.1:${PORT}/verseobs-relay`,
    "--fichier", process.env.ECOUTE_FICHIER,
    "--duree", process.env.ECOUTE_DUREE || "120",
    "--modele", process.env.ECOUTE_MODELE || "small",
    "--journal", path.join(ROOT, "artifacts", "mesures", "e2e-reel-service.jsonl"),
  ];
  if (process.env.ECOUTE_TRADUCTEUR) args.push("--traducteur", process.env.ECOUTE_TRADUCTEUR);
  if (process.env.ECOUTE_THREADS) args.push("--threads", process.env.ECOUTE_THREADS);
  const p = spawn(process.env.ECOUTE_PYTHON, args, { stdio: ["ignore", "pipe", "pipe"] });
  const log = fs.createWriteStream(path.join(ROOT, "artifacts", "mesures", "e2e-reel-service.log"));
  p.stdout.pipe(log);
  p.stderr.pipe(log);
  return p;
}

try {
  if (REAL) proc = startReal();
  else fake = startFake();

  const studioCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const studio = await studioCtx.newPage();
  studio.on("pageerror", (e) => errors.push("studio: " + e.message));
  await studio.goto(`http://127.0.0.1:${PORT}/control_panel.html`);
  await studio.click("#tab-btn-5");

  await check("Studio › Connexions : la carte trouve le service d'écoute", async () => {
    await studio.waitForSelector("#captions-body", { state: "visible" });
    await studio.waitForFunction(
      () => /prêt/.test(document.querySelector("#captions-engine").textContent),
      null,
      { timeout: REAL ? 180000 : 5000 },
    );
    const opts = await studio.$$eval("#captions-device option", (o) => o.map((x) => x.textContent));
    if (REAL) assert.deepEqual(opts, ["Fichier de simulation"]);
    else assert.deepEqual(opts, ["Entrée par défaut de l’ordinateur", "Microphone (Realtek(R) Audio)", "Entrée ligne (table de mixage USB)"]);
    assert.equal(await studio.isChecked("#captions-onair"), false);
  });

  await check("Démarrer l'écoute envoie l'entrée choisie ; Arrêter apparaît", async () => {
    if (!REAL) await studio.selectOption("#captions-device", "2");
    await studio.click("#captions-start");
    await studio.waitForSelector("#captions-stop", { state: "visible", timeout: 15000 });
    if (!REAL) {
      assert.equal(fake.commands[0].action, "start");
      assert.equal(fake.commands[0].device, 2);
    }
    assert.match(await studio.textContent("#captions-engine"), /À l’écoute/);
  });

  let url;
  await check("Partager : QR code et adresse en lecture seule", async () => {
    await studio.click("#captions-share");
    await studio.waitForFunction(() => document.querySelector("#captions-url").value.includes("code="));
    url = await studio.inputValue("#captions-url");
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/sous-titres\.html\?code=/);
    assert.equal(await studio.locator("#captions-qr svg").count(), 1);
  });

  const phoneCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneCtx.newPage();
  phone.on("pageerror", (e) => errors.push("phone: " + e.message));
  await phone.goto(url);

  if (!REAL) {
    for (let i = 0; i < LINES.length; i++) await fake.say(LINES[i], "fr " + i, 3 + i / 10);
  }
  const want = REAL ? Number(process.env.ECOUTE_LIGNES || 6) : LINES.length;
  await check(`Téléphone : ${want} lignes anglaises arrivent, la dernière visible`, async () => {
    await phone.waitForFunction(
      (n) => document.querySelectorAll(".st-line").length >= n,
      want,
      { timeout: REAL ? 600000 : 5000 },
    );
    await phone.waitForTimeout(400);
    const g = await phone.evaluate(() => {
      const lines = [...document.querySelectorAll(".st-line")];
      const latest = document.querySelector(".st-line.is-latest");
      const r = latest.getBoundingClientRect();
      const cs = getComputedStyle(latest);
      return {
        count: lines.length,
        latest: latest.textContent,
        bottom: r.bottom,
        feedBottom: document.querySelector("#st-feed").getBoundingClientRect().bottom,
        size: parseFloat(cs.fontSize),
        color: cs.color,
        bg: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth - innerWidth,
        status: document.querySelector("#st-status").textContent,
        lang: document.querySelector("#st-feed").lang,
      };
    });
    if (!REAL) assert.equal(g.latest, LINES[LINES.length - 1]);
    assert.ok(g.bottom <= g.feedBottom + 1, "dernière ligne visible sans défiler");
    assert.ok(g.size >= 24, "texte d'au moins 24 px : " + g.size);
    assert.equal(g.color, "rgb(255, 255, 255)");
    assert.equal(g.bg, "rgb(13, 14, 16)");
    assert.ok(g.overflow <= 0, "pas de défilement horizontal");
    assert.equal(g.status, "Live");
    assert.equal(g.lang, "en");
  });
  await phone.screenshot({ path: path.join(OUT, `telephone-${TAG}.png`) });
  await studio.locator("#captions-card").screenshot({ path: path.join(OUT, `studio-carte-${TAG}.png`) });

  await check("Studio : latence, retard, processeur et dernière ligne affichés", async () => {
    await studio.waitForFunction(() => document.querySelector("#captions-latency").textContent !== "—", null, { timeout: 10000 });
    const t = await studio.evaluate(() => ({
      lat: document.querySelector("#captions-latency").textContent,
      cpu: document.querySelector("#captions-cpu").textContent,
      en: document.querySelector("#captions-last-en").textContent,
      viewers: document.querySelector("#captions-viewers").textContent,
    }));
    assert.match(t.lat, /^\d+,\d s/);
    assert.match(t.cpu, /%/);
    assert.ok(t.en.length > 0);
    assert.equal(t.viewers, "1 téléphone connecté");
  });

  if (!REAL) {
    await check("Studio : ligne API (modèles, secours, plafond annoncé, aucun coût) ou « Tout en local »", async () => {
      await studio.waitForFunction(() => /Tout en local/.test(document.querySelector("#captions-api").textContent));
      fake.state.api = { translation: "Claude Sonnet 5", transcription: "OpenAI gpt-transcribe", capped: false, notice: "", spent: 0.42 };
      await studio.waitForFunction(() => /traduction Claude Sonnet 5, transcription OpenAI gpt-transcribe/.test(document.querySelector("#captions-api").textContent));
      const t1 = await studio.textContent("#captions-card");
      assert.doesNotMatch(t1, /€|\$|0,42|0\.42/, "aucun coût dans le Studio");
      fake.state.api = Object.assign({}, fake.state.api, { capped: true, notice: "Plafond de dépense atteint : traduction et transcription repassées en local jusqu'à la fin de la séance." });
      await studio.waitForFunction(() => document.querySelector("#captions-api").classList.contains("is-capped"));
      await studio.waitForFunction(() => /Plafond de dépense atteint : les sous-titres/.test(document.body.textContent));
      const g = await studio.evaluate(() => {
        const e = document.querySelector("#captions-api"), r = e.getBoundingClientRect(), card = document.querySelector("#captions-card").getBoundingClientRect();
        return { color: getComputedStyle(e).color, inside: r.left >= card.left - 0.5 && r.right <= card.right + 0.5 };
      });
      assert.equal(g.color, "rgb(243, 192, 88)");
      assert.ok(g.inside, "ligne API dans la carte");
      fake.state.api = Object.assign({}, fake.state.api, { capped: false, notice: "" });
      await studio.waitForFunction(() => !document.querySelector("#captions-api").classList.contains("is-capped"));
      await studio.locator("#captions-card").screenshot({ path: path.join(OUT, `studio-carte-api-${TAG}.png`) });
      fake.state.api = { translation: "", transcription: "", capped: false, notice: "" };
    });

    await check("Téléphone : A+ grossit le texte et s'en souvient ; « Back to live » après lecture en arrière", async () => {
      const before = await phone.$eval(".st-line", (e) => parseFloat(getComputedStyle(e).fontSize));
      await phone.click("#st-larger");
      const after = await phone.$eval(".st-line", (e) => parseFloat(getComputedStyle(e).fontSize));
      assert.ok(after > before);
      for (let i = 0; i < 10; i++) await fake.say("Extra line number " + i + " so that the feed scrolls on a phone.", "", 3);
      await phone.waitForFunction(() => document.querySelectorAll(".st-line").length >= 16);
      await phone.evaluate(() => (document.querySelector("#st-feed").scrollTop = 0));
      await phone.waitForSelector("#st-back", { state: "visible" });
      await fake.say("A new line while reading back.", "", 3);
      await phone.waitForTimeout(200);
      assert.equal(await phone.$eval("#st-feed", (f) => f.scrollTop), 0, "pas de saut pendant la relecture");
      await phone.click("#st-back");
      await phone.waitForSelector("#st-back", { state: "hidden" });
      await phone.reload();
      await phone.waitForFunction(() => document.querySelectorAll(".st-line").length >= 17);
      const kept = await phone.$eval(".st-line", (e) => parseFloat(getComputedStyle(e).fontSize));
      assert.equal(kept, after);
    });
  }

  await check("OBS : rien tant que la case n'est pas cochée, deux lignes ensuite", async () => {
    const obsCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const obs = await obsCtx.newPage();
    obs.on("pageerror", (e) => errors.push("obs: " + e.message));
    await obs.goto(`http://127.0.0.1:${PORT}/sous-titres.html?obs=1`);
    await obs.waitForFunction(() => document.body.dataset.onair === "0");
    if (!REAL) await fake.say("Line while OBS is off.", "", 3);
    await obs.waitForTimeout(REAL ? 15000 : 300);
    assert.equal(await obs.$eval("#st-feed", (f) => getComputedStyle(f).visibility), "hidden");
    await studio.check("#captions-onair");
    await obs.waitForFunction(() => document.body.dataset.onair === "1");
    if (!REAL) {
      await fake.say("God is faithful.", "", 3);
      await fake.say("He keeps his promises.", "", 3);
    }
    await obs.waitForFunction(() => document.querySelectorAll(".st-line.is-recent").length === 2, null, { timeout: REAL ? 60000 : 5000 });
    assert.equal(await obs.$eval("#st-feed", (f) => getComputedStyle(f).visibility), "visible");
    assert.equal(
      await obs.$eval("body", (b) => getComputedStyle(b).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
    await obs.screenshot({ path: path.join(OUT, `obs-${TAG}.png`), omitBackground: true });
    await studio.uncheck("#captions-onair");
    await obs.waitForFunction(() => getComputedStyle(document.querySelector("#st-feed")).visibility === "hidden");
    await obsCtx.close();
  });

  if (REAL) {
    // Let the extract finish, then keep the arrival log for the measurements.
    await studio.waitForFunction(
      () => /prêt/.test(document.querySelector("#captions-engine").textContent),
      null,
      { timeout: 900000 },
    );
    await phone.waitForTimeout(1500);
    const arrivals = await phone.evaluate(() => window.VerseObsSubtitles.log);
    const lines = await phone.$$eval(".st-line", (l) => l.map((x) => x.textContent));
    fs.writeFileSync(
      path.join(ROOT, "artifacts", "mesures", "e2e-reel-telephone.json"),
      JSON.stringify({ arrivals, lines }, null, 1),
    );
    await phone.screenshot({ path: path.join(OUT, "telephone-reel-fin.png") });
    console.log("arrivées enregistrées : " + arrivals.length);
  }

  await check("Nouveau lien : le téléphone dit que son lien a expiré", async () => {
    await studio.click("#captions-revoke");
    await phone.waitForFunction(() => /expired/.test(document.querySelector("#st-status").textContent), null, { timeout: 5000 });
  });

  await check("aucune erreur JavaScript", async () => {
    assert.deepEqual(errors, []);
  });
  console.log(`browser-captions (${TAG}) : ${passed} contrôles réussis`);
} finally {
  if (fake) fake.stop();
  if (proc) proc.kill("SIGINT");
  await browser.close();
  await new Promise((r) => server.close(r));
}
process.exit(0);
