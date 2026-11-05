"use strict";
// Voix : liste blanche réelle du relais et commandes du Studio en JSDOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createCaptions, engineState } = require('../tools/captions');
const root = path.join(__dirname, '..');
const sent = [];
const service = { readyState: 1, send: raw => sent.push(JSON.parse(raw)) };
const viewer = { readyState: 1, send: () => {} };
const captions = createCaptions(0, {}, () => [service, viewer], { lanAddresses: () => [] });
captions.fromRelay(service, { type: 'caption_engine', state: { status: 'idle' } });
sent.length = 0;
captions.fromRelay(viewer, { type: 'caption_admin', action: 'voice', enabled: true,
  paused: false, output: 7, outputName: 'Casques', voice: 'cedar', volume: .45, key: 'fixture-secret', url: 'https://evil.invalid' });
assert.equal(sent.length, 1);
assert.deepEqual(Object.keys(sent[0]).sort(), ['action', 'enabled', 'id', 'output', 'outputName', 'paused', 'ts', 'type', 'voice', 'volume']);
assert.equal(sent[0].output, 7);
assert.equal(sent[0].outputName, 'Casques');
assert.equal(sent[0].volume, .45);
captions.fromRelay(viewer, { type: 'caption_admin', action: 'voice', enabled: 'yes',
  paused: 1, output: -1, voice: '<script>', volume: Infinity });
assert.deepEqual(Object.keys(sent[1]).sort(), ['action', 'id', 'ts', 'type']);
const state = engineState({ voice: { enabled: true, output: 7, outputName: 'Casques', volume: .45,
  outputs: [{ index: 7, name: 'Casques', key: 'fixture-secret' }], voices: ['marin', 'cedar'], voice: 'marin',
  provider: 'OpenAI gpt-realtime-2.1-mini', latency: .32, delay: 1, skipped: 2, speed: 1.12,
  key: 'fixture-secret', headers: { Authorization: 'fixture-secret' } } });
assert.ok(!JSON.stringify(state).includes('fixture-secret'));
assert.deepEqual(state.voice.outputs, [{ index: 7, name: 'Casques', api: '' }]);

const dom = new JSDOM(fs.readFileSync(path.join(root, 'control_panel.html'), 'utf8'), {
  url: 'http://127.0.0.1:19385/control_panel.html', runScripts: 'outside-only'
});
const w = dom.window, commands = [];
let message;
w.VerseObs = {};
w.eval(fs.readFileSync(path.join(root, 'assets/js/control/captions-link.js'), 'utf8'));
const link = new w.VerseObs.CaptionsLink({ channel: {
  sendRelay: m => { commands.push(JSON.parse(JSON.stringify(m))); return true; },
  onMessage: fn => { message = fn; }, relayConnected: () => true
}, notify: () => {} });
const el = id => w.document.getElementById(id);
assert.equal(el('captions-voice-enabled').disabled, true);
message({ type: 'caption_status', engine: true, state: { ...state, status: 'idle' }, share: {} });
assert.equal(el('captions-voice-output').value, '7');
assert.equal(el('captions-voice-enabled').checked, true);
assert.match(el('captions-voice-state').textContent, /0,3 s/);
assert.match(el('captions-voice-state').textContent, /segment\(s\) sauté/);
function change(id, value, check = false) {
  el(id)[check ? 'checked' : 'value'] = value;
  el(id).dispatchEvent(new w.Event('change', { bubbles: true }));
}
change('captions-voice-enabled', false, true);
change('captions-voice-name', 'cedar');
change('captions-voice-volume', '45');
el('captions-voice-pause').click();
assert.deepEqual(commands.slice(-4), [
  { type: 'caption_admin', action: 'voice', enabled: false, paused: false },
  { type: 'caption_admin', action: 'voice', voice: 'cedar' },
  { type: 'caption_admin', action: 'voice', volume: .45 },
  { type: 'caption_admin', action: 'voice', paused: true }
]);
change('captions-voice-output', '7');
assert.deepEqual(commands.at(-1), {type:'caption_admin',action:'voice',output:7,outputName:'Casques'});
message({ type:'caption_status',engine:false,state:null,share:{} });
assert.equal(el('captions-voice-alert').hidden,false);
assert.match(el('captions-voice-alert').textContent,/relais|Service/);
state.voice.paused = true;
message({ type: 'caption_status', engine: true, state, share: {} });
assert.equal(el('captions-voice-pause').textContent, 'Reprendre la voix');
assert.ok(!commands.some(m => m.type === 'command' || m.type === 'SHOW'));
link.setRelay(false);
assert.equal(el('captions-body').hidden, true);
assert.equal(el('captions-voice-alert').hidden, false);
assert.match(el('captions-voice-alert').textContent,/10 s/);
dom.window.close();
captions.close().then(() => console.log('Voix : relais filtré, état et commandes Studio vérifiés.'));
