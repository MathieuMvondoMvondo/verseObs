// Contrôle du Studio dans Chromium réel, moteur audio simulé, aucune API payante.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { createServer } = require('../tools/server');
const { WebSocket } = require('ws');
const { chromium } = await import(process.env.PW_ROOT ? pathToFileURL(path.join(process.env.PW_ROOT, 'index.mjs')).href : 'playwright');
const port = Number(process.env.TEST_PORT || 29385);
const server = createServer(port, { captions: { addresses: ['127.0.0.1'], port: 0 } });
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
const ws = new WebSocket(`ws://127.0.0.1:${port}/verseobs-relay`, { headers: { Origin: `http://127.0.0.1:${port}` } });
const commands = [], errors = [];
const voice = { enabled: false, output: null, outputs: [{ index: 7, name: 'Casques anglophones USB', api: 'WASAPI' }],
  voices: ['marin', 'cedar'], voice: 'marin', volume: .7, provider: 'Piper en_US-ljspeech-medium', delay: .4, latency: .23, paused: false };
let seq = 0;
const send = () => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'caption_engine', id: `voix-${++seq}`, ts: Date.now(), state: {
  status: 'listening', source: 'Table de mixage USB', devices: [], voice, listenId: 'fake-listen-voix' } }));
ws.on('open', send);
ws.on('message', raw => {
  const msg = JSON.parse(raw);
  if (msg.type !== 'caption_command' || msg.action !== 'voice') return;
  commands.push(msg);
  for (const k of ['enabled', 'output', 'voice', 'volume', 'paused']) if (k in msg) voice[k] = msg[k];
  send();
});
const beat = setInterval(send, 250);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/control_panel.html`);
  await page.click('#tab-btn-5');
  await page.waitForSelector('#captions-body', { state: 'visible' });
  assert.equal(await page.isDisabled('#captions-voice-enabled'), true);
  await page.selectOption('#captions-voice-output', '7');
  await page.waitForFunction(() => !document.querySelector('#captions-voice-enabled').disabled);
  await page.check('#captions-voice-enabled');
  await page.selectOption('#captions-voice-name', 'cedar');
  await page.locator('#captions-voice-volume').fill('45');
  await page.locator('#captions-voice-volume').dispatchEvent('change');
  await page.click('#captions-voice-pause');
  await page.waitForFunction(() => document.querySelector('#captions-voice-pause').textContent.includes('Reprendre'));
  await page.click('#captions-voice-pause');
  await page.waitForFunction(() => document.querySelector('#captions-voice-pause').textContent === 'Pause voix');
  assert.equal(voice.enabled, true);
  assert.equal(voice.voice, 'cedar');
  assert.equal(voice.output, 7);
  assert.equal(voice.volume, .45);
  assert.equal(voice.paused, false);
  assert.match(await page.textContent('#captions-voice-state'), /Piper.*0,4 s/);
  assert.match(await page.textContent('.captions-voice'), /Jamais les haut-parleurs/);
  fs.mkdirSync('artifacts/voix', { recursive: true });
  await page.locator('#captions-card').screenshot({ path: 'artifacts/voix/studio-voix.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#captions-card').screenshot({ path: 'artifacts/voix/studio-voix-mobile.png' });
  assert.deepEqual(errors, []);
  fs.writeFileSync('artifacts/voix/browser-resultat.json', JSON.stringify({ commandes: commands.length, erreurs: errors,
    sortie: voice.output, volume: voice.volume, voix: voice.voice, mobile_sans_debordement: true }, null, 2));
  console.log('Chromium : sortie, activation, voix, volume, pause/reprise et affichage étroit vérifiés.');
} finally {
  clearInterval(beat);
  ws.terminate();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
