"""Banc reproductible voix : synthèse Piper réelle et API HTTP factice, sans paiement.

Le DAC du VPS est remplacé par un récepteur mémoire : aucune mesure de carte
son, de casque ou de réseau OpenAI réel n'est revendiquée.
"""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import threading
import time
import wave

import numpy as np
import voix
from test_voix import FakeSpeechHTTP, LocalFaux, SortiesFausses, attendre
from test_voix_realtime import FakeRealtimeHTTP


def quantiles(values):
    return {'n': len(values), 'mediane_s': round(statistics.median(values), 4),
            'p90_s': round(float(np.percentile(values, 90)), 4), 'max_s': round(max(values), 4)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--modele', required=True)
    parser.add_argument('--sortie', default='artifacts/voix')
    args = parser.parse_args()
    out = Path(args.sortie)
    out.mkdir(parents=True, exist_ok=True)
    fixture_path = Path(__file__).parents[2] / 'tests/fixtures/voix-culte-1110.json'
    fixture = json.loads(fixture_path.read_text())
    local = voix.LocalTTS(args.modele)
    start = time.monotonic()
    local.prepare()
    preparation = time.monotonic() - start
    cancel = threading.Event()
    samples, measures, used = [], [], []
    total = 0
    for segment in fixture['segments']:
        start = time.monotonic()
        first = None
        blocks = []
        for data, sr in local.stream(segment['en'], 'marin', 1, cancel):
            if first is None:
                first = time.monotonic() - start
            blocks.append(data)
        audio = np.concatenate(blocks)
        samples.append(audio)
        total += len(audio) / sr
        measures.append(first)
        used.append(segment)
        if total >= 65:
            break
    assert 60 <= total <= 90, f'Durée démo hors cible : {total}'
    pcm = np.clip(np.concatenate(samples) * 32767, -32768, 32767).astype('<i2')
    wavpath = out / 'culte-1110-anglais-piper.wav'
    with wave.open(str(wavpath), 'wb') as wav:
        wav.setparams((1, 2, sr, 0, 'NONE', ''))
        wav.writeframes(pcm.tobytes())
    (out / 'demo-source.json').write_text(json.dumps(dict(fixture, segments=used), ensure_ascii=False, indent=2))
    result = {'limites': 'Synthèse locale réelle sur VPS Linux, sortie mémoire/WAV ; ni DAC physique ni API payante.',
              'demo': {'fichier': str(wavpath), 'duree_s': total, 'frequence_hz': sr,
                       'sha256': hashlib.sha256(wavpath.read_bytes()).hexdigest(),
                       'segments': len(used), 'rms': float(np.sqrt(np.mean((pcm.astype(float) / 32768)**2)))},
              'piper_preparation_s': round(preparation, 4),
              'piper_premier_segment_s': round(measures[0], 4), 'piper_chaud': quantiles(measures)}
    for label, cls, provider in [('speech_http_factice', FakeSpeechHTTP, voix.OpenAITTS),
                                 ('realtime_http_upgrade_factice', FakeRealtimeHTTP, voix.RealtimeTTS)]:
        with cls(delay=.08) as api:
            sink, rows = SortiesFausses(), []
            engine = voix.VoiceEngine(LocalFaux(), provider('fixture-banc', url=api.url),
                outputs=[{'index': 7}], sink_factory=sink, journal=rows.append)
            try:
                engine.configure(output=7, enabled=True)
                for i in range(12):
                    engine.submit({'en': 'The free gift of God is eternal life.', 'final': True})
                    attendre(lambda: engine.idle() and len(rows) == i + 1)
                assert all(r['fournisseur'].startswith('OpenAI') for r in rows), 'le banc distant ne doit pas mesurer un repli local'
                result[label] = quantiles([r['latence_s'] for r in rows])
            finally:
                engine.close()
    # Scénarios explicitement hypothétiques, pas un débit audio OpenAI mesuré.
    result['cout_scenarios'] = {
        'tarifs_usd_par_million': {'texte_entree': .6, 'texte_sortie': 2.4, 'audio_sortie': 20},
        'hypotheses': '20 jetons audio/s (1 par 50 ms, documentation Realtime), 780 segments/h, 100 jetons de consigne + 19 de texte/segment, 19 jetons texte de sortie/segment ; aucun cache.',
        '60_min_voix_usd': (3600 * 20 * 20 + 780 * 119 * .6 + 780 * 19 * 2.4) / 1e6,
        '30_min_voix_usd': (1800 * 20 * 20 + 780 * 119 * .6 + 780 * 19 * 2.4) / 1e6,
        'source_debit': 'https://developers.openai.com/api/docs/guides/voice-latency-cost?voice-api=realtime',
        'source': 'https://developers.openai.com/api/docs/pricing',
        'local_usd_api': 0,
    }
    (out / 'mesures.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
