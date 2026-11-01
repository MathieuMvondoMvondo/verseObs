// Real-browser regression for review 4, N3: a paired phone adds a badge to
// the dock header; neither that badge nor Search may push it past 390 px.
import assert from "node:assert/strict";
export async function pairedDock({ browser, createServer, PORT, check }) {
  const port = PORT + 4;
  const lan = createServer(port, { lan: { addresses: ["127.0.0.1"], port: 0 } });
  await new Promise((r) => lan.listen(port, "127.0.0.1", r));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const status = await lan.remote.enable();
    const studio = await ctx.newPage();
    const errors = [];
    studio.on("pageerror", (e) => errors.push(e.message));
    await studio.goto(`http://127.0.0.1:${port}/control_panel.html`);
    await studio.waitForSelector(".chapter-verse");
    const phone = await phoneCtx.newPage();
    phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(status.url);
    await phone.waitForFunction(() => /Connecté/.test(document.querySelector("#link-pill").textContent));
    await studio.waitForFunction(() => !document.querySelector("#remote-header-badge").hidden);
    await studio.evaluate(() => document.fonts.ready);
    await check("Dock at 390 px, phone paired: no horizontal scroll, badge and Search fully inside (all six views, output absent then connected)", async () => {
      for (const connected of [false, true]) {
        if (connected) {
          const output = await ctx.newPage();
          output.on("pageerror", (e) => errors.push(e.message));
          await output.goto(`http://127.0.0.1:${port}/browser_source.html`);
          await studio.waitForFunction(() => document.querySelector("#connection-dot").classList.contains("connected"));
        }
        for (let tab = 0; tab < 6; tab++) {
          await studio.click("#tab-btn-" + tab);
          const g = await studio.evaluate(async () => {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            scrollTo(200, 0);
            const scroll = scrollX;
            scrollTo(0, 0);
            const box = (sel) => {
              const e = document.querySelector(sel), r = e.getBoundingClientRect();
              return { left: r.left, right: r.right, width: r.width, height: r.height, visible: !e.hidden && getComputedStyle(e).visibility === "visible" };
            };
            return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, scroll, badge: box("#remote-header-badge"), search: box("#command-trigger") };
          });
          console.log("    paired dock " + (connected ? "connected" : "no output") + " view " + tab + ": " + JSON.stringify(g));
          assert.ok(g.scrollWidth <= g.width + 1, "scrollWidth " + g.scrollWidth);
          assert.equal(g.scroll, 0, "no horizontal scroll");
          for (const [name, b] of [["badge", g.badge], ["search", g.search]]) {
            assert.ok(b.visible && b.width > 0 && b.height > 0, name + " visible");
            assert.ok(b.left >= 0 && b.right <= g.width + 1, name + " fully inside: " + JSON.stringify(b));
          }
        }
      }
      assert.deepEqual(errors, []);
    });
  } finally {
    await phoneCtx.close();
    await ctx.close();
    await lan.remote.close();
    await new Promise((r) => lan.close(r));
  }
}
