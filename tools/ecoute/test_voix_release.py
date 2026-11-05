"""Régressions de confirmation : matériel bloqué, identité, relais et fin bornée."""
import sys
from pathlib import Path
import threading
import time
from types import SimpleNamespace

import pytest
sys.path.insert(0, str(Path(__file__).parent))
import ecoute
import voix
from test_voix import LocalFaux, SortiesFausses, attendre


def service_test():
    service = ecoute.Service(ecoute.parse(['--sans-versets', '--sans-relais']))
    service.engine = SimpleNamespace(status='listening', error='', source_label='', backlog=0,
                                    stats=lambda: {}, stop=lambda: None)
    service.proc = None
    service.ready.set()
    return service


def test_pilote_suspendu_ne_bloque_ni_etat_ni_arret_ni_legendes():
    entered, release = threading.Event(), threading.Event()
    class Sink:
        latency = 0
        def __init__(self, *args): pass
        def __enter__(self): return self
        def write(self, *args):
            entered.set()
            release.wait(10)
        def __exit__(self, *args): pass
    service = service_test()
    messages = []
    service.send = messages.append
    voice = service.voice_engine = voix.VoiceEngine(LocalFaux(), outputs=[{'index': 7}], sink_factory=Sink)
    completed = {k: threading.Event() for k in ('state', 'stop', 'captions')}
    def run(name, fn):
        fn()
        completed[name].set()
    def captions():
        for i in range(2):
            service.on_caption({'en': f'Next {i}', 'final': True, 'latency': 0})
    threads = []
    try:
        voice.configure(enabled=True, output=7)
        voice.submit({'en': 'First.', 'final': True})
        assert entered.wait(2)
        threads = [threading.Thread(target=run, args=(k, fn), daemon=True) for k, fn in
                   [('state', service.state), ('stop', service.stop), ('captions', captions)]]
        for thread in threads: thread.start()
        assert all(e.wait(.3) for e in completed.values())
        assert sum(m.get('type') == 'caption' for m in messages) == 2
        attendre(voice.idle, timeout=3)
        assert not voice.state()['enabled']
        voice.configure(enabled=True)
        assert not voice.state()['enabled'], 'pas de nouvel écrivain concurrent sur un pilote figé'
    finally:
        release.set()
        for thread in threads: thread.join(2)
        voice.close()


def test_nom_sortie_obligatoire_au_demarrage_et_index_decale_refuse():
    args = ecoute.parse(['--voix', '--sortie', '7', '--sortie-nom', 'Casques USB'])
    outputs = [{'index': 7, 'name': 'Salle', 'api': 'WASAPI'}, {'index': 8, 'name': 'Casques USB', 'api': 'WASAPI'}]
    assert voix.resolve_output(outputs, args.sortie, args.sortie_nom) is None
    assert voix.resolve_output(outputs, None, args.sortie_nom) == 8
    assert voix.resolve_output(outputs, 7, None) is None
    sink = SortiesFausses()
    engine = voix.VoiceEngine(LocalFaux(), outputs=outputs, sink_factory=sink)
    try:
        engine.configure(output=7, outputName='Casques USB', enabled=True)
        assert not engine.state()['enabled']
        assert 'sortie' in engine.state()['notice'].lower()
        assert not engine.submit({'en': 'Forbidden.', 'final': True})
        assert not sink.blocks
        engine.configure(output=8, outputName='Casques USB', enabled=True)
        assert engine.state()['outputName'] == 'Casques USB'
        assert engine.state()['enabled']
    finally:
        engine.close()


def test_submit_en_panne_ne_coupe_pas_les_sous_titres():
    service = service_test()
    service._secrets = ['fixture-secret']
    messages, logs = [], []
    service.send, service.log = messages.append, logs.append
    def broken(*args, **kwargs): raise RuntimeError('fixture-secret: panne voix')
    service.voice_engine = SimpleNamespace(submit=broken, notice='', configure=lambda **kw: None)
    for i in range(2): service.on_caption({'en': f'Caption {i}', 'final': True, 'latency': 0})
    assert len(messages) == 2
    assert logs and 'fixture-secret' not in str(logs)
    assert 'panne voix' in str(logs)


def test_hysteresis_deux_echecs_sur_cinq_reste_local_jusqua_nouvelle_ecoute():
    class Remote(LocalFaux):
        def stream(self, *args):
            self.texts.append(args[0])
            raise TimeoutError('réseau lent')
            yield
    remote, local, sink = Remote(), LocalFaux(), SortiesFausses()
    engine = voix.VoiceEngine(local, remote, outputs=[{'index': 7}], sink_factory=sink)
    try:
        engine.configure(output=7, enabled=True)
        for i in range(4):
            engine.submit({'en': f'Text {i}', 'final': True})
            attendre(lambda: engine.idle() and len(local.texts) == i+1)
        assert len(remote.texts) == 2
        assert len(local.texts) == 4
        engine.begin_session('nouvelle-ecoute')
        engine.submit({'en': 'New session', 'final': True}, session='nouvelle-ecoute')
        attendre(lambda: engine.idle() and len(local.texts) == 5)
        assert len(remote.texts) == 3
    finally:
        engine.close()


def test_relais_grace_dix_secondes_et_reconnexion_courte(monkeypatch):
    service = service_test()
    voice = service.voice_engine = voix.VoiceEngine(LocalFaux(), outputs=[{'index': 7}], sink_factory=SortiesFausses())
    clock = [100.]
    monkeypatch.setattr(ecoute.time, 'monotonic', lambda: clock[0])
    try:
        voice.configure(output=7, enabled=True)
        service.relay_health(False)
        clock[0] = 109.
        service.relay_health(False)
        assert voice.enabled
        assert 'relais' in service.state()['voice']['relayNotice'].lower()
        service.relay_health(True)
        assert voice.enabled and not service.state()['voice']['relayNotice']
        service.relay_health(False)
        clock[0] = 120.
        service.relay_health(False)
        assert not voice.enabled
        service.relay_health(True)
        assert not voice.enabled, 'pas de réactivation automatique après longue coupure'
    finally:
        voice.close()


def test_fin_auto_borne_meme_si_voix_non_videe():
    service = service_test()
    service.args.fin_auto = True
    service.started_once = True
    service.engine.status = 'idle'
    scheduled, stopped = [], []
    service.loop = SimpleNamespace(is_closed=lambda: False, call_soon_threadsafe=lambda fn,*args: fn(*args),
        call_later=lambda delay,fn: scheduled.append((delay,fn)), stop=lambda: stopped.append(True))
    service.voice_engine = SimpleNamespace(idle=lambda: False, state=lambda: {}, stop=lambda: None)
    service.changed()
    assert scheduled and max(d for d,_ in scheduled) <= 12
    scheduled[-1][1]()
    assert stopped


def test_sortie_renommee_avant_ouverture_ne_joue_rien(monkeypatch):
    opened = []
    sd = SimpleNamespace(query_devices=lambda *a: {'name':'Salle', 'hostapi':0},
                         query_hostapis=lambda: [{'name':'WASAPI'}],
                         OutputStream=lambda **kw: opened.append(kw))
    monkeypatch.setitem(sys.modules,'sounddevice',sd)
    engine = voix.VoiceEngine(LocalFaux(), outputs=[{'index':7,'name':'Casques','api':'WASAPI'}])
    try:
        engine.configure(output=7,outputName='Casques',enabled=True)
        engine.submit({'final':True,'en':'Never on speakers.'})
        attendre(lambda: engine.idle() and not engine.enabled)
        assert not opened
        assert 'sortie' in engine.notice.lower()
    finally:
        engine.close()
