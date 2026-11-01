"use strict";
/* Live English captions: relay, read-only phone page, Studio admin, OBS gate. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { WebSocket } = require("ws");
const { createServer } = require(path.join(__dirname, "..", "tools", "server.js"));
const { engineState, captionLine } = require(
  path.join(__dirname, "..", "tools", "captions.js"),
);

let passed = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    results.push("ok   " + name);
  } catch (err) {
    results.push("FAIL " + name);
    console.log(results.join("\n"));
    console.error(err);
    process.exit(1);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
}
/** Loopback relay client with a message log and a waiter. */
function relayClient(port, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:" + port + "/verseobs-relay", {
      headers: { Origin: origin || "http://127.0.0.1:" + port },
    });
    ws.log = [];
    ws.on("message", (raw) => ws.log.push(JSON.parse(raw.toString())));
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}
let n = 0;
function send(ws, msg) {
  ws.send(JSON.stringify(Object.assign({ id: "t-" + ++n, ts: Date.now() }, msg)));
}
async function until(fn, ms = 3000, what = "condition") {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout: " + what);
    await sleep(20);
  }
}
function last(ws, type) {
  for (let i = ws.log.length - 1; i >= 0; i--)
    if (ws.log[i].type === type) return ws.log[i];
  return null;
}
function get(port, pathname, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: pathname, headers: { Host: host || "127.0.0.1:" + port } },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
function viewer(url, origin) {
  const u = new URL(url);
  return new Promise((resolve) => {
    const ws = new WebSocket(
      "ws://" + u.host + "/verseobs-sous-titres" + u.search,
      { headers: { Origin: origin || "http://" + u.host } },
    );
    ws.log = [];
    ws.on("message", (raw) => ws.log.push(JSON.parse(raw.toString())));
    ws.on("open", () => resolve({ ws, ok: true }));
    ws.on("unexpected-response", (req, res) => resolve({ ws, ok: false, status: res.statusCode }));
    ws.on("error", () => resolve({ ws, ok: false }));
  });
}

(async () => {
  await check("engineState keeps only short display data", () => {
    const s = engineState({
      status: "listening",
      error: "x".repeat(500),
      devices: [{ index: 3, name: "Micro\u0000 USB", api: "WASAPI" }, { index: -1 }, "bad"],
      latency: { last: 3.456, avg: Infinity, max: -1, count: 4 },
      cpu: 140,
      secret: "never",
    });
    assert.equal(s.status, "listening");
    assert.equal(s.error.length, 200);
    assert.deepEqual(s.devices, [{ index: 3, name: "Micro USB", api: "WASAPI" }]);
    assert.deepEqual(s.latency, { last: 3.46, avg: null, max: null, count: 4, skipped: 0 });
    assert.equal(s.cpu, null);
    assert.equal("secret" in s, false);
    assert.equal(engineState({ status: "<script>" }).status, "idle");
  });
  await check("engineState: the paid-API line passes, nothing else (never a key, never a cost)", () => {
    const fake = "sk-ant-FAUSSE-CLE-DE-TEST-pas-une-vraie-0000";
    const s = engineState({
      status: "listening",
      api: {
        translation: "Claude Sonnet 5",
        transcription: "",
        capped: "yes",
        notice: "y".repeat(400),
        spent: 0.42,
        limit: 2,
        key: fake,
        headers: { "x-api-key": fake },
      },
    });
    assert.deepEqual(Object.keys(s.api).sort(), ["capped", "notice", "transcription", "translation"]);
    assert.equal(s.api.translation, "Claude Sonnet 5");
    assert.equal(s.api.capped, false);
    assert.equal(s.api.notice.length, 200);
    assert.equal(JSON.stringify(s).includes(fake), false);
    assert.deepEqual(engineState({}).api, { translation: "", transcription: "", capped: false, notice: "" });
  });
  await check("captionLine refuses empty text and trims long lines", () => {
    assert.equal(captionLine({ en: "   " }), null);
    assert.equal(captionLine(null), null);
    const c = captionLine({ en: "a".repeat(900), fr: 5, end: 1e20, latency: 2.5 });
    assert.deepEqual(c.en.map((x) => x.length), [600, 300]);
    const words = Array.from({ length: 260 }, (_, i) => "word" + i).join(" ");
    const lines = captionLine({ en: words }).en;
    assert.ok(lines.length > 1 && lines.every((x) => x.length <= 600));
    assert.equal(lines.join(" "), words, "a long translation loses no word");
    assert.deepEqual(captionLine({ gap: 12.34 }), { gap: 12.34 });
    assert.equal(c.fr, "");
    assert.equal(c.end, 0);
    assert.equal(c.latency, 2.5);
  });

  const server = createServer(0, { captions: { addresses: ["127.0.0.1"], port: 0 } });
  const port = await listen(server);
  // createServer(0) builds its loopback host list from port 0: rebuild on the real port.
  server.close();
  const real = createServer(port, { captions: { addresses: ["127.0.0.1"], port: 0 } });
  await new Promise((r) => real.listen(port, "127.0.0.1", r));
  const studio = await relayClient(port);
  const engine = await relayClient(port);
  const output = await relayClient(port);
  const opened = [studio, engine, output];
  try {
    await check("the loopback server serves the OBS caption page", async () => {
      const r = await get(port, "/sous-titres.html?obs=1");
      assert.equal(r.status, 200);
      assert.match(r.body, /Live English subtitles/);
    });

    await check("Studio sees the listening service and its state", async () => {
      send(studio, { type: "caption_admin", action: "status" });
      const first = await until(() => last(studio, "caption_status"));
      assert.equal(first.engine, false);
      assert.equal(first.onAir, false, "OBS captions are off at start");
      send(engine, {
        type: "caption_engine",
        state: { status: "idle", devices: [{ index: 2, name: "Table de mixage" }], model: "whisper-small-int8" },
      });
      const st = await until(() => {
        const m = last(studio, "caption_status");
        return m && m.engine ? m : null;
      });
      assert.equal(st.state.devices[0].name, "Table de mixage");
      assert.equal(st.share.active, false);
    });

    await check("Démarrer/Arrêter reach the service with the chosen input", async () => {
      send(studio, { type: "caption_admin", action: "start", device: 2 });
      const cmd = await until(() => last(engine, "caption_command"));
      assert.equal(cmd.action, "start");
      assert.equal(cmd.device, 2);
      send(studio, { type: "caption_admin", action: "stop", device: "x" });
      await until(() => engine.log.filter((m) => m.type === "caption_command").length === 2);
      const stop = last(engine, "caption_command");
      assert.equal(stop.action, "stop");
      assert.equal(stop.device, null);
      assert.equal(output.log.some((m) => m.type === "caption_command"), false);
    });

    await check("only the service may publish captions; a second service is ignored", async () => {
      send(output, { type: "caption_engine", state: { status: "listening" } });
      await sleep(100);
      send(output, { type: "caption", caption: { en: "Fake line" } });
      send(studio, { type: "caption_command", action: "start" });
      await sleep(150);
      assert.equal(studio.log.some((m) => m.type === "caption" && m.en === "Fake line"), false);
      assert.equal(engine.log.filter((m) => m.type === "caption_command").length, 2);
    });

    await check("captions reach the Studio, never on air by default", async () => {
      send(engine, { type: "caption_engine", state: { status: "listening" } });
      send(engine, {
        type: "caption",
        caption: { en: "God is faithful.", fr: "Dieu est fidèle.", end: Date.now() - 3000, latency: 3 },
      });
      const c = await until(() => last(studio, "caption"));
      assert.equal(c.en, "God is faithful.");
      assert.equal(c.fr, "Dieu est fidèle.");
      assert.equal(c.onAir, false);
      assert.equal(engine.log.some((m) => m.type === "caption"), false, "not echoed to the service");
    });

    let share;
    await check("sharing opens a read-only page with its own code", async () => {
      send(studio, { type: "caption_admin", action: "share" });
      const st = await until(() => {
        const m = last(studio, "caption_status");
        return m && m.share.active ? m : null;
      });
      share = st.share;
      assert.match(share.url, /^http:\/\/127\.0\.0\.1:\d+\/sous-titres\.html\?code=[A-Za-z0-9_-]{16}$/);
      assert.notEqual(new URL(share.url).port, String(port));
      assert.equal(real.remote.code(), null, "the remote-control code is not created");
      const u = new URL(share.url);
      const page = await get(u.port, u.pathname + u.search, u.host);
      assert.equal(page.status, 200);
      assert.match(page.headers["content-security-policy"], /connect-src 'self' ws:\/\/127\.0\.0\.1:\d+/);
      assert.equal(page.headers["x-frame-options"], "DENY");
      assert.equal((await get(u.port, "/control_panel.html", u.host)).status, 404);
      assert.equal((await get(u.port, "/remote.html", u.host)).status, 404);
      assert.equal((await get(u.port, "/sous-titres.html", "evil.example:" + u.port)).status, 403);
      assert.equal((await get(u.port, "/api/sous-titres/check?code=nope", u.host)).status, 401);
      assert.equal(
        (await get(u.port, "/api/sous-titres/check?code=" + u.searchParams.get("code"), u.host)).status,
        204,
      );
    });

    await check("a phone needs the code and the right origin", async () => {
      const u = new URL(share.url);
      const bad = await viewer("http://" + u.host + "/?code=wrong");
      assert.equal(bad.ok, false);
      assert.equal(bad.status, 401);
      const foreign = await viewer(share.url, "http://evil.example");
      assert.equal(foreign.ok, false);
      assert.equal(foreign.status, 403);
    });

    let phone;
    await check("a phone gets recent lines, then live lines, English only", async () => {
      const v = await viewer(share.url);
      assert.equal(v.ok, true);
      phone = v.ws;
      const hello = await until(() => phone.log.find((m) => m.type === "captions_hello"));
      assert.equal(hello.live, true);
      assert.deepEqual(hello.lines.map((l) => l.en), ["God is faithful."]);
      assert.equal("fr" in hello.lines[0], false);
      send(engine, { type: "caption", caption: { en: "Amen.", fr: "Amen.", end: Date.now() } });
      const line = await until(() => phone.log.find((m) => m.type === "caption"));
      assert.equal(line.en, "Amen.");
      assert.equal(line.n, hello.lines[0].n + 1);
      assert.deepEqual(Object.keys(line).sort(), ["en", "end", "n", "session", "type"]);
      assert.equal(line.session, hello.session);
      await until(() => {
        const m = last(studio, "caption_status");
        return m && m.share.viewers === 1 ? m : null;
      }, 3000, "Studio counts one phone");
      await until(() => {
        const m = last(studio, "caption");
        return m && m.en === "Amen." ? m : null;
      }, 3000, "Studio gets the same line");
    });

    await check("whatever a phone sends is dropped, a flood closes it", async () => {
      phone.send(JSON.stringify({ type: "command", command: "show" }));
      phone.send(JSON.stringify({ type: "caption_admin", action: "onair" }));
      await sleep(150);
      const st = last(studio, "caption_status");
      assert.equal(st.onAir, false);
      const closed = new Promise((r) => phone.once("close", (code) => r(code)));
      for (let i = 0; i < 25; i++) phone.send("{}");
      assert.equal(await closed, 4429);
    });

    await check("a stopped service withdraws OBS; the operator must tick again", async () => {
      send(studio, { type: "caption_admin", action: "onair" });
      await until(() => {
        const m = last(output, "caption_status");
        return m && m.onAir;
      });
      send(engine, { type: "caption_engine", state: { status: "idle" } });
      await until(() => {
        const m = last(output, "caption_status");
        return m && m.onAir === false;
      });
      send(engine, { type: "caption_engine", state: { status: "listening" } });
      await sleep(100);
      assert.equal(last(output, "caption_status").onAir, false);
    });

    await check("OBS shows captions only after the operator's action", async () => {
      send(studio, { type: "caption_admin", action: "onair" });
      await until(() => {
        const m = last(output, "caption_status");
        return m && m.onAir;
      });
      send(engine, { type: "caption", caption: { en: "On air now." } });
      const c = await until(() => {
        const m = last(output, "caption");
        return m && m.en === "On air now." ? m : null;
      });
      assert.equal(c.onAir, true);
      send(studio, { type: "caption_admin", action: "offair" });
      await until(() => {
        const m = last(output, "caption_status");
        return m && m.onAir === false;
      });
    });

    await check("a new link disconnects phones and refuses the old code", async () => {
      const v = await viewer(share.url);
      assert.equal(v.ok, true);
      const closed = new Promise((r) => v.ws.once("close", (code) => r(code)));
      send(studio, { type: "caption_admin", action: "revoke" });
      assert.equal(await closed, 4401);
      const old = await viewer(share.url);
      assert.equal(old.ok, false);
      const st = await until(() => {
        const m = last(studio, "caption_status");
        return m && m.share.url !== share.url ? m : null;
      });
      const again = await viewer(st.share.url);
      assert.equal(again.ok, true);
      again.ws.terminate();
      share = st.share;
    });

    await check("the service going away is reported to Studio and phones, OBS withdrawn", async () => {
      const v = await viewer(share.url);
      await until(() => v.ws.log.find((m) => m.type === "captions_hello"));
      send(studio, { type: "caption_admin", action: "onair" });
      await until(() => {
        const m = last(studio, "caption_status");
        return m && m.onAir;
      });
      engine.close();
      const st = await until(() => {
        const m = last(studio, "caption_status");
        return m && m.engine === false ? m : null;
      });
      assert.equal(st.state, null);
      assert.equal(st.onAir, false, "a lost service takes the subtitles off air");
      const state = await until(() => v.ws.log.find((m) => m.type === "caption_state" && m.live === false));
      assert.equal(state.service, false);
      v.ws.terminate();
    });

    await check("Arrêter le partage closes the page", async () => {
      const u = new URL(share.url);
      send(studio, { type: "caption_admin", action: "unshare" });
      await until(() => {
        const m = last(studio, "caption_status");
        return m && m.share.active === false;
      });
      await assert.rejects(get(u.port, "/sous-titres.html", u.host));
    });
  } finally {
    for (const ws of opened) ws.terminate();
    await new Promise((r) => real.close(r));
  }
  console.log(results.join("\n"));
  console.log("captions: " + passed + " checks passed");
  process.exit(0);
})();
