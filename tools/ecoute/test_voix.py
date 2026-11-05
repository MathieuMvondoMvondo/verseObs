"""Voix : aucun appel payant, sorties sonores factices."""
import sys
import time
import threading
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))


def attendre(predicate, timeout=3):
    end = time.monotonic() + timeout
    while not predicate() and time.monotonic() < end:
        time.sleep(.01)
    assert predicate(), 'condition non atteinte'


class LocalFaux:
    name = 'local-factice'

    def __init__(self):
        self.texts = []
        self.speeds = []

    def stream(self, text, voice, speed, cancel):
        self.texts.append(text)
        self.speeds.append(speed)
        yield np.ones(240, np.float32) * .1, 24000


class SortiesFausses:
    def __init__(self):
        self.blocks = []
        self.active = 0
        self.maximum = 0
        self.exits = []

    def __call__(self, rate, device):
        owner = self
        class Sink:
            latency = 0
            def __enter__(self):
                owner.active += 1
                owner.maximum = max(owner.maximum, owner.active)
                return self
            def write(self, data, volume):
                owner.blocks.append((device, data * volume))
                time.sleep(.01)
            def __exit__(self, *args):
                owner.exits.append(args[0])
                owner.active -= 1
        return Sink()


def test_seuls_finals_anglais_serie_sortie_et_volume():
    import importlib.util
    assert importlib.util.find_spec('voix'), 'module voix absent'
    import voix
    local, sinks = LocalFaux(), SortiesFausses()
    engine = voix.VoiceEngine(local, outputs=[{'index': 7, 'name': 'Casques', 'api': 'test'}], sink_factory=sinks)
    try:
        engine.configure(enabled=True, output=7, volume=.4)
        assert not engine.submit({'en': 'Partial', 'final': False})
        assert not engine.submit({'en': 'Non final explicite'})
        assert not engine.submit({'gap': 4, 'final': True})
        assert engine.submit({'en': 'One.', 'final': True})
        assert engine.submit({'en': 'Two.', 'final': True})
        attendre(lambda: len(sinks.blocks) == 2 and engine.idle())
        assert local.texts == ['One.', 'Two.']
        assert sinks.maximum == 1
        assert [d for d, _ in sinks.blocks] == [7, 7]
        assert np.allclose(sinks.blocks[0][1], .04)
    finally:
        engine.close()


def test_sortie_obligatoire_pause_reprise_et_invalidation():
    import voix
    gate = threading.Event()
    class Lent(LocalFaux):
        def stream(self, text, voice, speed, cancel):
            self.texts.append(text)
            gate.wait(2)
            yield np.ones(240, np.float32), 24000
    local, sinks = Lent(), SortiesFausses()
    engine = voix.VoiceEngine(local, outputs=[{'index': 7}], sink_factory=sinks)
    try:
        engine.configure(enabled=True)
        assert not engine.state()['enabled']
        assert 'sortie' in engine.state()['notice']
        engine.configure(output=7, enabled=True)
        engine.submit({'en': 'Old.', 'final': True})
        attendre(lambda: local.texts == ['Old.'])
        engine.configure(paused=True)
        gate.set()
        attendre(engine.idle)
        assert sinks.blocks == []
        assert not engine.submit({'en': 'During pause.', 'final': True})
        engine.configure(paused=False)
        engine.submit({'en': 'New.', 'final': True})
        attendre(lambda: len(sinks.blocks) == 1)
        assert local.texts == ['Old.', 'New.']
        engine.configure(enabled=False)
        assert not engine.submit({'en': 'Off.', 'final': True})
    finally:
        gate.set()
        engine.close()


def test_file_bornee_accelere_puis_saute_et_signale():
    import voix
    local, sinks = LocalFaux(), SortiesFausses()
    engine = voix.VoiceEngine(local, outputs=[{'index': 7}], sink_factory=sinks,
                              max_delay=2, soft_delay=.1)
    try:
        engine.configure(output=7, enabled=True)
        with engine._cv:  # arrivées simultanées avant prise par le travailleur
            for i in range(20):
                engine.submit({'en': f'Number {i}.', 'final': True})
            assert len(engine._queue) <= 2
            assert engine.state()['skipped'] > 0
        attendre(engine.idle)
        assert local.texts[-1] == 'Number 19.'
        assert 1.12 in local.speeds
        assert 'sauté' in engine.state()['notice']
        with engine._cv:
            engine._queue.append((time.monotonic() - 5, 'Expired.', engine._generation))
            engine._cv.notify_all()
        attendre(engine.idle)
        assert 'Expired.' not in local.texts
    finally:
        engine.close()


class FakeSpeechHTTP:
    """Une vraie API HTTP loopback, PCM transmis avant la fin de réponse."""
    def __init__(self, delay=.08, status=200, stall=False):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        import json
        self.requests = []
        self.delay, self.status, self.stall = delay, status, stall
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                owner.requests.append((self.path, dict(self.headers), body))
                if self.path.endswith('transcriptions'):
                    data, ct = b'{"text":"Dieu est fidele."}', 'application/json'
                elif self.path.endswith('completions'):
                    data = b'{"choices":[{"message":{"content":"God is faithful."}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}'
                    ct = 'application/json'
                else:
                    data = np.ones(4800, dtype='<i2').tobytes()
                    ct = 'audio/pcm'
                    if owner.status != 200:
                        data = json.dumps({'error': {'message': self.headers.get('Authorization')}}).encode()
                        ct = 'application/json'
                time.sleep(owner.delay)
                try:
                    self.send_response(owner.status)
                    self.send_header('Content-Type', ct)
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    self.wfile.write(data[:4800])
                    self.wfile.flush()
                    if owner.stall:
                        time.sleep(float(owner.stall))
                    self.wfile.write(data[4800:])
                except (BrokenPipeError, ConnectionResetError):
                    pass
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}/v1/audio/speech'

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


def test_http_pcm_modele_voix_ton_et_latence():
    import json
    import voix
    sink, rows = SortiesFausses(), []
    with FakeSpeechHTTP() as api:
        engine = voix.VoiceEngine(LocalFaux(), voix.OpenAITTS('cle-factice-tts', url=api.url),
            outputs=[{'index': 7}], sink_factory=sink, journal=rows.append)
        try:
            engine.configure(output=7, enabled=True, voice='cedar')
            engine.submit({'en': 'God is faithful.', 'final': True})
            attendre(lambda: engine.idle() and bool(rows))
            request = api.requests[0]
            assert request[0] == '/v1/audio/speech'
            assert request[1]['Authorization'] == 'Bearer cle-factice-tts'
            body = json.loads(request[2])
            assert body['model'] == 'gpt-4o-mini-tts'
            assert body['voice'] == 'cedar'
            assert body['response_format'] == 'pcm'
            assert 'calm' in body['instructions'] and 'preaching' in body['instructions']
            assert .07 < rows[0]['latence_s'] <= 1.5
            assert rows[0]['fournisseur'].startswith('OpenAI')
        finally:
            engine.close()


def test_http_erreur_ou_lenteur_repli_et_hysteresis():
    import voix
    for delay, status in ((.01, 401), (.4, 200), (.01, 500)):
        local, sinks = LocalFaux(), SortiesFausses()
        with FakeSpeechHTTP(delay=delay, status=status) as api:
            engine = voix.VoiceEngine(local, voix.OpenAITTS('cle-factice-tts', url=api.url, timeout=.15),
                outputs=[{'index': 7}], sink_factory=sinks, secrets=['cle-factice-tts'])
            try:
                engine.configure(output=7, enabled=True)
                engine.submit({'en': 'One.', 'final': True})
                attendre(lambda: len(sinks.blocks) == 1 and engine.idle())
                engine.submit({'en': 'Two.', 'final': True})
                attendre(lambda: len(sinks.blocks) == 2 and engine.idle())
                assert local.texts == ['One.', 'Two.']
                assert len(api.requests) == 2
                assert 'Repli' in engine.state()['notice']
                assert engine.state()['provider'] == 'local-factice'
                assert 'cle-factice-tts' not in str(engine.state())
            finally:
                engine.close()


def test_http_interruption_apres_debut_pas_de_phrase_double():
    import voix
    local, sink = LocalFaux(), SortiesFausses()
    # Marge de démarrage CPU : on éprouve l'interruption après PCM,
    # pas une course d'ordonnancement du faux serveur avant son premier octet.
    with FakeSpeechHTTP(delay=0, stall=3) as api:
        engine = voix.VoiceEngine(local, voix.OpenAITTS('fixture', url=api.url, timeout=2),
                                 outputs=[{'index': 7}], sink_factory=sink)
        try:
            engine.configure(output=7, enabled=True)
            engine.submit({'en': 'One.', 'final': True})
            attendre(lambda: len(sink.blocks) and engine.idle(), timeout=6)
            assert len(sink.blocks) == 1
            assert local.texts == []
            assert engine.state()['skipped'] == 1
        finally:
            engine.close()


def test_api_refuse_exfiltration_et_plafond_force_local():
    import pytest
    import moteur
    import voix
    for url in ('https://example.com/tts', 'http://api.openai.com/v1/audio/speech',
                'http://127.0.0.1.evil.invalid/tts'):
        with pytest.raises(ValueError):
            voix.OpenAITTS('fixture', url=url)
    with FakeSpeechHTTP() as api:
        local, sink = LocalFaux(), SortiesFausses()
        engine = voix.VoiceEngine(local, voix.OpenAITTS('fixture', url=api.url, budget=moteur.Depense(.01)),
                                 outputs=[{'index': 7}], sink_factory=sink)
        try:
            engine.configure(output=7, enabled=True)
            engine.submit({'en': 'One.', 'final': True})
            attendre(lambda: engine.idle() and len(sink.blocks))
            assert local.texts == ['One.']
            assert api.requests == []
            assert 'Plafond' in engine.state()['notice']
        finally:
            engine.close()


def test_secret_absent_stdout_journal_et_etat_mutation(monkeypatch, tmp_path, capsys):
    import json
    import os
    import ecoute
    import moteur
    import voix
    secret = 'fixture-voix-secret-non-utilisable'
    if os.environ.get('VOIX_MUTANT_UNMASK') == '1':
        monkeypatch.setattr(moteur, 'mask_secrets', lambda text, *keys: str(text))
    class Panne(LocalFaux):
        def stream(self, *args):
            raise RuntimeError('erreur interne ' + secret)
            yield
    service = ecoute.Service(ecoute.parse(['--sans-versets', '--sans-relais', '--journal', str(tmp_path / 'journal')]))
    service._secrets = [secret]
    service.voice_engine = voix.VoiceEngine(Panne(), outputs=[{'index': 7}], secrets=[secret],
        sink_factory=SortiesFausses(), on_change=service.changed, journal=service.write_cost)
    try:
        service.voice_engine.configure(output=7, enabled=True)
        service.voice_engine.submit({'en': 'Hello.', 'final': True})
        attendre(lambda: service.voice_engine.idle() and service.voice_engine.state()['skipped'])
        service.log('Une erreur : ' + secret)
        service.write({'secret-injecte': secret})
        state = json.dumps(service.state())
        service.journal.flush()
        journal = (tmp_path / 'journal').read_text()
        output = capsys.readouterr()
        for content in (state, journal, output.out, output.err,
                        json.dumps(service.clean_message({'state': {'notice': secret}}))):
            assert secret not in content
    finally:
        service.voice_engine.close()
        service.journal.close()


def test_main_fin_auto_avec_voix_api_et_tout_local(monkeypatch, tmp_path):
    import json
    import wave
    import ecoute
    import moteur
    import voix
    from test_api import FakeLocalAsr, FakeLocalMt
    # Le fichier source, le découpage, Engine, Service et main sont réels.
    # ASR/MT, détection VAD (sinusoïde connue) et DAC sont des doublures.
    audio = (.1 * np.sin(np.arange(16000 * 2) * 2 * np.pi * 220 / 16000) * 32767).astype('<i2')
    path = tmp_path / 'entree.wav'
    with wave.open(str(path), 'wb') as wav:
        wav.setparams((1, 2, 16000, 0, 'NONE', ''))
        wav.writeframes(audio.tobytes())
    monkeypatch.setattr(moteur, 'Transcriber', FakeLocalAsr)
    monkeypatch.setattr(moteur, 'Translator', FakeLocalMt)
    monkeypatch.setattr(moteur, 'silero_vad', lambda: lambda a: [(0, len(a))] if len(a) else [])
    monkeypatch.setattr(ecoute, 'translator_dir', lambda arg: str(tmp_path))
    monkeypatch.setattr(voix, 'list_outputs', lambda: [{'index': 7, 'name': 'Casques'}])
    monkeypatch.setattr(voix, 'LocalTTS', lambda *args: LocalFaux())
    monkeypatch.setenv('VERSEOBS_ECOUTE_OPENAI_CLE', 'fixture-secret-tts')
    monkeypatch.delenv('VERSEOBS_ECOUTE_ANTHROPIC_CLE', raising=False)
    original = voix.VoiceEngine
    for local in (False, True):
        sinks = SortiesFausses()
        engines = []
        def create(*args, **kwargs):
            obj = original(*args, sink_factory=sinks, **kwargs)
            engines.append(obj)
            return obj
        monkeypatch.setattr(voix, 'VoiceEngine', create)
        with FakeSpeechHTTP(delay=.01) as api:
            base = api.url.removesuffix('/audio/speech')
            journal = tmp_path / f'cycle-{local}.jsonl'
            ecoute.main(['--sans-versets', '--sans-relais', '--demarrer', '--fin-auto',
                         '--fichier', str(path), '--voix', '--voix-api', 'speech', '--sortie', '7', '--sortie-nom', 'Casques', '--journal', str(journal),
                         '--url-openai-voix', api.url, '--url-openai', base + '/audio/transcriptions',
                         '--url-openai-traduction', base + '/chat/completions'] + (['--tout-local'] if local else []))
            assert sinks.blocks
            assert all(not e._thread.is_alive() for e in engines)
            rows = [json.loads(line) for line in journal.read_text().splitlines()]
            captions = [r for r in rows if r['type'] == 'caption']
            spoken = [r for r in rows if r['type'] == 'voix_debut']
            assert captions and all(r['caption']['final'] is True for r in captions)
            assert spoken
            assert 'fixture-secret-tts' not in journal.read_text()
            if local:
                assert api.requests == []
                assert spoken[0]['fournisseur'] == 'local-factice'
            else:
                assert any(p == '/v1/audio/speech' for p, _, _ in api.requests)
                assert spoken[0]['fournisseur'].startswith('OpenAI')


def test_natif_windows_et_mac_ecrit_wav_sans_jouer_ni_exposer_cle(monkeypatch, tmp_path):
    import os
    import wave
    import voix
    monkeypatch.setenv('VERSEOBS_ECOUTE_OPENAI_CLE', 'fixture-native-secret')
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-generic-secret')
    calls = []
    class Process:
        returncode = 0
        def __init__(self, command, **kwargs):
            calls.append((command, kwargs))
            assert 'shell' not in kwargs
            env = kwargs['env']
            assert 'VERSEOBS_ECOUTE_OPENAI_CLE' not in env
            assert 'OPENAI_API_KEY' not in env
            assert 'verbatim user text' not in str(command)
            dest = env['VERSEOBS_VOIX_WAV'] if command[0] == 'powershell.exe' else command[command.index('-o') + 1]
            with wave.open(dest, 'wb') as wav:
                wav.setparams((1, 2, 24000, 0, 'NONE', ''))
                wav.writeframes(np.ones(240, dtype='<i2').tobytes())
        def poll(self):
            return 0
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
    monkeypatch.setattr(voix.subprocess, 'Popen', Process)
    for platform in ('win32', 'darwin'):
        monkeypatch.setattr(voix.sys, 'platform', platform)
        provider = voix.LocalTTS(tmp_path / 'absent.onnx')
        chunks = list(provider.stream('verbatim user text', 'marin', 1, threading.Event()))
        assert chunks and chunks[0][1] == 24000
    assert calls[0][0][0] == 'powershell.exe'
    assert calls[1][0][0] == 'say'


def test_sink_sounddevice_resample_sortie_isolee(monkeypatch):
    import types
    import voix
    calls = []
    class Stream:
        latency = .02
        def __init__(self, **kwargs):
            calls.append(('open', kwargs))
        def start(self):
            calls.append(('start',))
        def write(self, data):
            calls.append(('write', data.shape, float(data.max())))
        def stop(self):
            calls.append(('stop',))
        def abort(self):
            calls.append(('abort',))
        def close(self):
            calls.append(('close',))
    module = types.SimpleNamespace(query_devices=lambda *a: {'default_samplerate': 48000, 'max_output_channels': 2},
        check_output_settings=lambda **k: calls.append(('check', k)), OutputStream=Stream)
    monkeypatch.setitem(sys.modules, 'sounddevice', module)
    with voix.SoundDeviceSink(24000, 7) as sink:
        sink.write(np.ones(2400, np.float32) * .5, .4)
    assert calls[1][1]['device'] == 7
    assert calls[3][1] == (4800, 2)
    assert abs(calls[3][2] - .2) < .001
    assert calls[-1] == ('close',)


def test_callback_suspendu_rejete_apres_arret_et_redemarrage():
    import ecoute
    from types import SimpleNamespace
    import voix
    for restart in (False, True):
        service = ecoute.Service(ecoute.parse(['--sans-versets', '--sans-relais']))
        class Engine:
            status = 'idle'
            def start(self, source): self.status = 'listening'
            def stop(self): self.status = 'stopping'
        service.engine = Engine()
        service.file_source = SimpleNamespace(label='fixture')
        service.ready.set()
        local, sinks = LocalFaux(), SortiesFausses()
        voice = service.voice_engine = voix.VoiceEngine(local, outputs=[{'index': 7}], sink_factory=sinks)
        entered, release = threading.Event(), threading.Event()
        original = voice.submit
        def pending_submit(c, *args, **kwargs):
            entered.set()
            assert release.wait(2)
            return original(c, *args, **kwargs)
        try:
            voice.configure(output=7, enabled=True)
            service.start()
            old_callback = getattr(service.engine, 'on_caption', service.on_caption)
            voice.submit = pending_submit
            thread = threading.Thread(target=old_callback, args=({'en': 'Stale.', 'final': True, 'latency': 0},))
            thread.start()
            assert entered.wait(2)
            service.stop()
            if restart:
                service.engine.status = 'idle'  # fin de l'ancien moteur
                service.start()
            release.set()
            thread.join(2)
            attendre(voice.idle)
            assert sinks.blocks == [], 'une ancienne légende ne doit jamais ressusciter'
            if restart:
                voice.submit = original
                service.engine.on_caption({'en': 'Current.', 'final': True, 'latency': 0})
                attendre(lambda: voice.idle() and len(sinks.blocks) == 1)
                assert local.texts == ['Current.']
        finally:
            release.set()
            voice.close()


def test_annulation_callback_avant_write_ne_joue_aucun_bloc():
    import voix
    sinks, local = SortiesFausses(), LocalFaux()
    voice = voix.VoiceEngine(local, outputs=[{'index': 7}], sink_factory=sinks)
    cancelled = threading.Event()
    def cancel_once():
        if voice._busy and voice.active and not cancelled.is_set():
            cancelled.set()
            voice.configure(enabled=False)
    try:
        voice.configure(output=7, enabled=True)
        voice.on_change = cancel_once
        voice.submit({'en': 'Cancelled before write.', 'final': True})
        attendre(lambda: voice.idle() and cancelled.is_set())
        assert sinks.blocks == []
        assert sinks.exits[-1] is voix._Cancelled
    finally:
        voice.close()


def test_fermeture_sink_ou_generateur_apres_pcm_sans_double_parole():
    import voix
    for mode in ('sink', 'generator'):
        local, sink = LocalFaux(), SortiesFausses()
        class Remote(LocalFaux):
            name = 'distant-factice'
            budget = None
            def stream(self, *args):
                yield from super().stream(*args)
                if mode == 'generator':
                    raise OSError('fermeture générateur défaillante')
        def failing_sink(rate, device):
            inner = sink(rate, device)
            class Wrapper:
                latency = 0
                def __enter__(self):
                    inner.__enter__()
                    return self
                def write(self, *args): inner.write(*args)
                def __exit__(self, *args):
                    inner.__exit__(*args)
                    if mode == 'sink' and len(sink.blocks) == 1:
                        raise OSError('fermeture sortie défaillante')
            return Wrapper()
        voice = voix.VoiceEngine(local, Remote(), outputs=[{'index': 7}], sink_factory=failing_sink)
        try:
            voice.configure(enabled=True, output=7)
            voice.submit({'final': True, 'en': 'Once only.'})
            attendre(lambda: voice.idle() and sink.blocks)
            assert local.texts == []
            assert len(sink.blocks) == 1
            assert voice.state()['skipped'] == 1
        finally:
            voice.close()


def test_piper_json_utf8_meme_si_systeme_cp1252(monkeypatch, tmp_path):
    import json
    import types
    import voix
    model = tmp_path / 'voice.onnx'
    model.write_bytes(b'fixture')
    Path(str(model) + '.json').write_text(json.dumps({'phoneme_id_map': {'\u0081': [42]}}, ensure_ascii=False), encoding='utf-8')
    original = Path.read_text
    def non_utf8_default(path, encoding=None, **kwargs):
        return original(path, encoding=encoding or 'cp1252', **kwargs)
    monkeypatch.setattr(Path, 'read_text', non_utf8_default)
    class FakeVoice:
        def __init__(self, config, session):
            assert '\u0081' in config['phoneme_id_map']
        def synthesize(self, text, cfg):
            yield types.SimpleNamespace(audio_float_array=np.zeros(24, np.float32), sample_rate=24000)
    monkeypatch.setitem(sys.modules, 'piper', types.SimpleNamespace(PiperVoice=FakeVoice, SynthesisConfig=lambda **kw: kw))
    monkeypatch.setitem(sys.modules, 'piper.config', types.SimpleNamespace(PiperConfig=types.SimpleNamespace(from_dict=lambda d: d)))
    monkeypatch.setitem(sys.modules, 'onnxruntime', types.SimpleNamespace(SessionOptions=types.SimpleNamespace, InferenceSession=lambda *a, **k: None))
    provider = voix.LocalTTS(model)
    provider.prepare()
    assert provider.voice is not None


def test_pause_pendant_ouverture_sortie_abort_sans_bloc():
    import voix
    opened, release = threading.Event(), threading.Event()
    writes, exits = [], []
    class Sink:
        latency = 0
        def __init__(self, *args): pass
        def __enter__(self):
            opened.set()
            assert release.wait(2)
            return self
        def write(self, *args): writes.append(True)
        def __exit__(self, typ, *args): exits.append(typ)
    voice = voix.VoiceEngine(LocalFaux(), outputs=[{'index': 7}], sink_factory=Sink)
    try:
        voice.configure(output=7, enabled=True)
        voice.submit({'final': True, 'en': 'Old.'})
        assert opened.wait(2)
        voice.configure(paused=True)
        release.set()
        attendre(voice.idle)
        assert writes == [] and exits == [voix._Cancelled]
    finally:
        release.set()
        voice.close()


def test_erreur_moteur_dans_vrai_callback_ne_joue_pas():
    import ecoute
    import voix
    from types import SimpleNamespace
    service = ecoute.Service(ecoute.parse(['--sans-relais', '--sans-versets']))
    service.proc = None
    service.ready.set()
    service.engine = SimpleNamespace(status='listening', error='', source_label='', backlog=0, stats=lambda: {})
    class ErrorAtPCM(LocalFaux):
        def stream(self, *args):
            service.engine.status = 'error'
            service.engine.error = 'Fixture erreur moteur'
            yield from super().stream(*args)
    sinks = SortiesFausses()
    voice = service.voice_engine = voix.VoiceEngine(ErrorAtPCM(), outputs=[{'index': 7}],
        sink_factory=sinks, on_change=service.changed)
    try:
        voice.configure(output=7, enabled=True)
        voice.submit({'final': True, 'en': 'Old.'})
        attendre(lambda: voice.idle() and service.engine.status == 'error')
        assert sinks.blocks == [] and sinks.exits == [voix._Cancelled]
    finally:
        voice.close()
