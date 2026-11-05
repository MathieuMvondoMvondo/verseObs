"""Serveur HTTP Upgrade/WebSocket factice : Realtime sans appel OpenAI."""
import base64
import json
import sys
import threading
import time
from pathlib import Path

import numpy as np
import pytest
from websockets.sync.server import serve

sys.path.insert(0, str(Path(__file__).parent))
import moteur
import voix
from test_voix import LocalFaux, SortiesFausses, attendre


class FakeRealtimeHTTP:
    def __init__(self, delay=.08, error=False):
        self.delay, self.error = delay, error
        self.requests = []
        self.server = serve(self.handle, '127.0.0.1', 0)
        self.url = f'ws://127.0.0.1:{self.server.socket.getsockname()[1]}/v1/realtime?model={voix.REALTIME_MODEL}'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def handle(self, ws):
        try:
            events = [json.loads(ws.recv(timeout=2)) for _ in range(3)]
            self.requests.append({'path': ws.request.path, 'headers': dict(ws.request.headers), 'events': events})
            ws.send(json.dumps({'type': 'session.updated'}))
            time.sleep(self.delay)
            if self.error:
                ws.send(json.dumps({'type': 'error', 'error': {'message': ws.request.headers.get('Authorization')}}))
                return
            raw = np.ones(2400, dtype='<i2').tobytes()
            ws.send(json.dumps({'type': 'response.output_audio.delta', 'delta': base64.b64encode(raw).decode()}))
            ws.send(json.dumps({'type': 'response.done', 'response': {'status': 'completed', 'usage': {
                'input_token_details': {'text_tokens': 100},
                'output_token_details': {'text_tokens': 5, 'audio_tokens': 10}}}}))
        except Exception:
            # Le client annule volontairement les scénarios de délai.
            pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.server.shutdown()
        self.thread.join(timeout=3)


def test_realtime_par_defaut_pcm_voix_et_facture():
    import ecoute
    assert ecoute.parse([]).voix_api == 'realtime'
    sink, rows = SortiesFausses(), []
    budget = moteur.Depense(journal=rows.append)
    with FakeRealtimeHTTP() as api:
        engine = voix.VoiceEngine(LocalFaux(), voix.RealtimeTTS('fixture-realtime', api.url, budget=budget),
                                 outputs=[{'index': 7}], sink_factory=sink, journal=rows.append)
        try:
            engine.configure(enabled=True, output=7, voice='cedar')
            engine.submit({'final': True, 'en': 'God is faithful.'})
            attendre(lambda: engine.idle() and sink.blocks)
            req = api.requests[0]
            assert req['headers']['authorization'] == 'Bearer fixture-realtime'
            session = req['events'][0]['session']
            assert session['model'] == 'gpt-realtime-2.1-mini'
            assert session['output_modalities'] == ['audio']
            assert session['audio']['output'] == {'format': {'type': 'audio/pcm', 'rate': 24000}, 'speed': 1, 'voice': 'cedar'}
            assert session['audio']['input']['turn_detection'] is None
            assert session['tools'] == [] and 'verbatim' in session['instructions']
            assert req['events'][1]['item']['content'] == [{'type': 'input_text', 'text': 'God is faithful.'}]
            assert req['events'][2] == {'type': 'response.create'}
            assert engine.state()['provider'] == 'OpenAI gpt-realtime-2.1-mini'
            assert .07 <= engine.state()['latency'] <= 1.5
            assert budget.usd == pytest.approx((100 * .6 + 5 * 2.4 + 10 * 20) / 1e6)
            assert not rows[-1]['estime']
        finally:
            engine.close()


@pytest.mark.parametrize('delay,error', [(.5, False), (0, True)])
def test_realtime_delai_ou_erreur_repli_sans_fuite(delay, error):
    with FakeRealtimeHTTP(delay, error) as api:
        local, sink = LocalFaux(), SortiesFausses()
        engine = voix.VoiceEngine(local, voix.RealtimeTTS('fixture-realtime', api.url, timeout=.2),
                                 outputs=[{'index': 7}], sink_factory=sink, secrets=['fixture-realtime'])
        try:
            engine.configure(enabled=True, output=7)
            engine.submit({'final': True, 'en': 'Hello.'})
            attendre(lambda: engine.idle() and sink.blocks)
            assert local.texts == ['Hello.']
            assert 'Repli' in engine.state()['notice']
            assert 'fixture-realtime' not in str(engine.state())
        finally:
            engine.close()


def test_redirection_realtime_refusee_avant_la_seconde_connexion():
    received = []
    def target_request(conn, req):
        received.append(req.path)
    with serve(lambda ws: None, '127.0.0.2', 0, process_request=target_request) as target:
        target_url = f'ws://127.0.0.2:{target.socket.getsockname()[1]}/interdit'
        target_thread = threading.Thread(target=target.serve_forever, daemon=True)
        target_thread.start()
        def redirect(conn, request):
            response = conn.respond(302, 'Redirection factice')
            response.headers['Location'] = target_url
            return response
        with serve(lambda ws: None, '127.0.0.1', 0, process_request=redirect) as source:
            thread = threading.Thread(target=source.serve_forever, daemon=True)
            thread.start()
            url = f'ws://127.0.0.1:{source.socket.getsockname()[1]}/autorise'
            with pytest.raises(Exception):
                list(voix.RealtimeTTS('fixture-redirection', url).stream('Private transcript.', 'marin', 1, threading.Event()))
        thread.join(2)
    target_thread.join(2)
    assert received == [], 'même le handshake vers une cible redirigée est interdit'
