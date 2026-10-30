"""Tests du moteur d'écoute (sans modèle : détecteur et moteurs simulés).

    python -m unittest discover -s tools/ecoute -p "test_*.py"
"""

import http.server
import json
import os
import sys
import threading
import time
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import moteur  # noqa: E402

SR = moteur.SR


def energy_vad(audio, frame=320, gap=0.25):
    """Détecteur de test : « parole » = échantillons non nuls."""
    loud = np.abs(audio[: len(audio) // frame * frame].reshape(-1, frame)).max(axis=1) > 0.05
    spans, start, quiet = [], None, 0
    for i, v in enumerate(loud):
        if v:
            if start is None:
                start = i
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet * frame >= gap * SR:
                spans.append((start * frame, (i - quiet + 1) * frame))
                start, quiet = None, 0
    if start is not None:
        spans.append((start * frame, (len(loud) - quiet) * frame))
    return spans


def speech(seconds):
    rng = np.random.default_rng(int(seconds * 1000))
    return (rng.uniform(-0.4, 0.4, int(seconds * SR))).astype(np.float32)


def silence(seconds):
    return np.zeros(int(seconds * SR), np.float32)


def feed_all(seg, audio, chunk=0.1, **kw):
    out, n, t0 = [], int(chunk * SR), 1000.0
    for i in range(0, len(audio), n):
        out += seg.feed(audio[i : i + n], t0 + (i + n) / SR, **kw)
    return out + seg.flush()


class SegmenterTest(unittest.TestCase):
    def test_cuts_at_pauses(self):
        audio = np.concatenate([silence(1), speech(2.5), silence(0.8), speech(3), silence(1.0)])
        segs = feed_all(moteur.Segmenter(vad=energy_vad), audio)
        self.assertEqual(len(segs), 2)
        self.assertAlmostEqual(segs[0].end - segs[0].start, 2.5 + 0.3, delta=0.35)
        self.assertFalse(segs[0].forced)
        # Heure murale : la fin de la 1re phrase a été entendue vers 1000 + 3,5 s.
        self.assertAlmostEqual(segs[0].wall_end, 1000 + 1 + 2.5 + 0.15, delta=0.3)

    def test_long_speech_cut_at_breath(self):
        audio = np.concatenate([speech(5), silence(0.3), speech(6), silence(1)])
        segs = feed_all(moteur.Segmenter(vad=energy_vad, max_len=8), audio)
        self.assertGreaterEqual(len(segs), 2)
        self.assertTrue(segs[0].forced)
        self.assertAlmostEqual(segs[0].end - segs[0].start, 5.15, delta=0.3)
        self.assertLessEqual(max(s.end - s.start for s in segs), 8.01)

    def test_no_pause_hard_limit(self):
        segs = feed_all(moteur.Segmenter(vad=energy_vad, max_len=6), speech(14))
        self.assertTrue(all(s.end - s.start <= 6.01 for s in segs))
        self.assertAlmostEqual(sum(s.end - s.start for s in segs), 14, delta=0.2)

    def test_silence_only_emits_nothing(self):
        self.assertEqual(feed_all(moteur.Segmenter(vad=energy_vad), silence(12)), [])

    def test_larger_limit_when_late(self):
        audio = np.concatenate([speech(3), silence(0.3), speech(3), silence(0.3), speech(3), silence(1)])
        seg = moteur.Segmenter(vad=energy_vad, max_len=4)
        n = int(0.1 * SR)
        for i in range(0, len(audio) - n, n):
            seg.feed(audio[i : i + n], 1000 + i / SR, scan=False)
        out = seg.feed(audio[len(audio) - n :], 1000 + len(audio) / SR, max_len=20)
        self.assertEqual(len(out), 1)  # un seul appel pour 9 s de parole
        self.assertGreater(out[0].end - out[0].start, 9)


    def test_take_groups_pending_phrases_at_last_breath(self):
        seg = moteur.Segmenter(vad=energy_vad, max_len=8)
        audio = np.concatenate([speech(2), silence(0.6), speech(2), silence(0.3), speech(1.5)])
        feed_all_no_flush = [seg.feed(audio[i : i + 1600], 1000 + i / SR, scan=False) for i in range(0, len(audio), 1600)]
        self.assertEqual(sum(map(len, feed_all_no_flush)), 0)
        out = seg.take(24)
        self.assertAlmostEqual(out.end - out.start, 4.75, delta=0.3)  # jusqu'à la dernière respiration
        self.assertTrue(out.forced)
        self.assertIsNone(seg.take(24))  # la phrase en cours attend sa fin

    def test_take_whole_buffer_when_it_ends_in_a_pause(self):
        seg = moteur.Segmenter(vad=energy_vad, max_len=8)
        audio = np.concatenate([speech(3), silence(0.4), speech(9), silence(0.8)])
        for i in range(0, len(audio), 1600):
            seg.feed(audio[i : i + 1600], 1000 + i / SR, scan=False)
        out = seg.take(24)
        self.assertGreater(out.end - out.start, 12)
        self.assertFalse(out.forced)


class TextTest(unittest.TestCase):
    def test_collapse_repeats(self):
        self.assertEqual(moteur.collapse_repeats("amen amen amen amen amen"), "amen amen amen")
        self.assertEqual(
            moteur.collapse_repeats("Merci Seigneur, merci Seigneur, merci Seigneur, merci Seigneur. Oui"),
            "Merci Seigneur, merci Seigneur, merci Seigneur, Oui",
        )
        self.assertEqual(moteur.collapse_repeats("il est il est là"), "il est il est là")

    def test_hallucinations(self):
        self.assertTrue(moteur.HALLUCINATIONS.search("Sous-titres réalisés par la communauté d'Amara.org"))
        self.assertIsNone(moteur.HALLUCINATIONS.search("Dieu te bénit, amen."))

    def test_split_sentences(self):
        parts = moteur.split_sentences("Il vient. Est-ce clair ? Oui ! " + "mot, " * 80)
        self.assertEqual(parts[:3], ["Il vient.", "Est-ce clair ?", "Oui !"])
        self.assertTrue(all(len(p) <= 280 for p in parts))

    def test_caption_units_keep_every_word(self):
        text = " ".join("Sentence number %d says something about grace and faith." % i for i in range(9))
        units = moteur.caption_units(text)
        self.assertGreater(len(units), 2)
        self.assertTrue(all(len(u) <= 160 for u in units))
        self.assertEqual(" ".join(units).split(), text.split())

    def test_long_sentence_never_cut_inside_a_word(self):
        text = " ".join(["unbelievable"] * 40)
        for part in moteur.split_sentences(text, limit=100) + moteur.caption_units(text):
            self.assertTrue(all(w == "unbelievable" for w in part.split()), part)

    def test_clean_text_controls(self):
        self.assertEqual(moteur.clean_text("a\x00b\n c"), "a b c")


class ResamplerTest(unittest.TestCase):
    def test_48k_sine_keeps_frequency(self):
        r = moteur.Resampler(48000)
        t = np.arange(48000 * 2) / 48000
        x = np.sin(2 * np.pi * 440 * t).astype(np.float32)
        y = np.concatenate([r(x[i : i + 4800]) for i in range(0, len(x), 4800)])
        self.assertAlmostEqual(len(y), 32000, delta=400)
        spec = np.abs(np.fft.rfft(y[2000:30000]))
        peak = np.argmax(spec) * SR / len(y[2000:30000])
        self.assertAlmostEqual(peak, 440, delta=3)

    def test_linear_fallback_is_continuous(self):
        r = moteur.Resampler(44100)
        r._av = None
        t = np.arange(44100) / 44100
        x = np.sin(2 * np.pi * 300 * t).astype(np.float32)
        y = np.concatenate([r(x[i : i + 441]) for i in range(0, len(x), 441)])
        self.assertAlmostEqual(len(y), 16000, delta=3)
        self.assertLess(np.max(np.abs(np.diff(y))), 0.2)  # pas de saut entre blocs


class FakeSource:
    label = "test"

    def __init__(self, audio, realtime=False, start_wall=None, speed=None):
        self.audio, self.realtime = audio, realtime
        self.start_wall, self.speed = start_wall, speed

    def run(self, push, stop):
        n = int(0.1 * SR)
        t0 = self.start_wall or time.time()
        for i in range(0, len(self.audio), n):
            if stop.is_set():
                return
            due = t0 + (i + n) / SR
            if self.realtime:
                time.sleep(max(0, due - time.time()))
            elif self.speed:
                time.sleep(0.1 / self.speed)
            push(self.audio[i : i + n], due)


class EngineTest(unittest.TestCase):
    def run_engine(self, audio, transcribe, **kw):
        captions = []
        e = moteur.Engine(
            transcribe,
            lambda fr: "EN:" + fr,
            captions.append,
            segmenter=lambda: moteur.Segmenter(vad=energy_vad, max_len=kw.pop("max_len", 8)),
            **kw,
        )
        e.start(FakeSource(audio, speed=10))
        e.wait()
        return e, captions

    def test_captions_in_order_with_timing(self):
        audio = np.concatenate([speech(2), silence(0.8), speech(2), silence(0.8), speech(1.5), silence(2)])
        calls = []

        def transcribe(a):
            calls.append(len(a))
            return "phrase %d" % len(calls)

        e, caps = self.run_engine(audio, transcribe)
        self.assertEqual([c["en"] for c in caps], ["EN:phrase 1", "EN:phrase 2", "EN:phrase 3"])
        self.assertEqual([c["seq"] for c in caps], [1, 2, 3])
        for c in caps:
            self.assertLessEqual(c["start"], c["end"])
            self.assertIn("latency", c)
        self.assertEqual(e.status, "idle")

    def test_empty_transcript_publishes_nothing(self):
        audio = np.concatenate([speech(2), silence(1)])
        e, caps = self.run_engine(audio, lambda a: "")
        self.assertEqual(caps, [])

    def test_slow_engine_batches_and_stays_bounded(self):
        # Coût simulé : 2,5 s par appel quelle que soit la longueur (comme
        # l'encodeur de Whisper, toujours sur 30 s), pour des phrases de 1,2 s
        # toutes les 1,8 s. Une phrase par appel : le retard grandit sans fin.
        parts = []
        for _ in range(12):
            parts += [speech(1.2), silence(0.6)]
        audio = np.concatenate(parts + [silence(1)])

        def slow(a):
            time.sleep(2.5)
            return "x"

        def run(catchup):
            captions = []
            e = moteur.Engine(
                slow,
                lambda fr: fr,
                captions.append,
                segmenter=lambda: moteur.Segmenter(vad=energy_vad, max_len=8),
                catchup=catchup,
            )
            e.start(FakeSource(audio, realtime=True))
            e.wait()
            return captions

        grouped, single = run(True), run(False)
        self.assertEqual(len(single), 12)
        self.assertLess(len(grouped), len(single))
        worst_single = max(c["latency"] for c in single)
        worst_grouped = max(c["latency"] for c in grouped)
        self.assertGreater(worst_single, 10)  # 12 × 2,5 s pour 21,6 s de parole
        self.assertLess(worst_grouped, worst_single - 3)

    def test_engine_error_is_reported_and_capture_stops(self):
        def broken(a):
            raise RuntimeError("modèle introuvable")

        e = moteur.Engine(broken, lambda fr: fr, lambda c: None,
                          segmenter=lambda: moteur.Segmenter(vad=energy_vad))
        e.start(FakeSource(np.concatenate([speech(2), silence(1)] * 20), realtime=True))
        e.wait()  # les deux fils se terminent : la capture s'arrête aussi
        self.assertEqual(e.status, "error")
        self.assertIn("modèle introuvable", e.error)

    def test_stop_discards_the_phrase_being_computed(self):
        entered, release = threading.Event(), threading.Event()
        captions = []

        def slow(a):
            entered.set()
            release.wait(5)
            return "phrase"

        e = moteur.Engine(slow, lambda fr: fr, captions.append,
                          segmenter=lambda: moteur.Segmenter(vad=energy_vad))
        e.start(FakeSource(np.concatenate([speech(2), silence(1)] * 10), realtime=True))
        self.assertTrue(entered.wait(5))
        e.stop()
        self.assertEqual(e.status, "stopping")
        release.set()
        e.wait()
        self.assertEqual(captions, [])
        self.assertEqual(e.status, "idle")
        e.start(FakeSource(np.concatenate([speech(2), silence(1)]), speed=10))  # redémarrage propre
        e.wait()
        self.assertEqual(len(captions), 1)

    def test_silent_input_becomes_an_error(self):
        class DeadStream:
            active = True

            def __init__(self, **kw):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        src = moteur.MicSource.__new__(moteur.MicSource)
        src.sd = type("SD", (), {"InputStream": DeadStream})
        src.device, src.rate, src.channels, src.label = 0, 16000, 1, "muet"
        src.SILENT_AFTER = 0.5
        e = moteur.Engine(lambda a: "x", lambda fr: fr, lambda c: None,
                          segmenter=lambda: moteur.Segmenter(vad=energy_vad))
        e.start(src)
        e.wait()
        self.assertEqual(e.status, "error")
        self.assertIn("plus aucun son", e.error)

    def test_drops_audio_when_hopelessly_late(self):
        audio = np.concatenate([speech(2), silence(0.8)] * 4)
        gaps = []
        e = moteur.Engine(
            lambda a: "x",
            lambda fr: fr,
            lambda c: gaps.append(c["gap"]) if "gap" in c else None,
            segmenter=lambda: moteur.Segmenter(vad=energy_vad),
            max_delay=5,
        )
        old = time.time() - 60  # audio « entendu » il y a une minute
        e.start(FakeSource(audio, start_wall=old))
        e.wait()
        self.assertGreater(e.skipped, 5)
        self.assertAlmostEqual(sum(gaps), e.skipped, delta=0.2)  # chaque saut est annoncé


class ApiTranslatorTest(unittest.TestCase):
    def setUp(self):
        self.requests = []
        test = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                test.requests.append((self.headers.get("Authorization"), body))
                if body["messages"][1]["content"] == "panne":
                    self.send_response(500)
                    self.end_headers()
                    return
                out = json.dumps({"choices": [{"message": {"content": "Hello church"}}]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

            def log_message(self, *a):
                pass

        self.server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = "http://127.0.0.1:%d/v1/chat/completions" % self.server.server_address[1]

    def tearDown(self):
        self.server.shutdown()

    def test_request_and_fallback(self):
        t = moteur.ApiTranslator(self.url, "cle-test", "modele", fallback=lambda fr: "local:" + fr)
        self.assertEqual(t("Bonjour l'église"), "Hello church")
        auth, body = self.requests[0]
        self.assertEqual(auth, "Bearer cle-test")
        self.assertEqual(body["model"], "modele")
        self.assertEqual(t("panne"), "local:panne")
        self.assertEqual(t.failures, 1)

    def test_refuses_plain_http_elsewhere(self):
        for url in (
            "http://example.com/v1",
            "http://localhost.evil.example/v1",
            "http://127.0.0.1.example.invalid/v1",
            "https://user:pass@api.example.com/v1",
            "ftp://127.0.0.1/v1",
        ):
            with self.assertRaises(ValueError, msg=url):
                moteur.ApiTranslator(url, "k", "m")
        for url in ("https://api.example.com/v1/chat/completions", "http://127.0.0.1:8080/v1", "http://[::1]:9/v1"):
            moteur.check_api_url(url)


if __name__ == "__main__":
    unittest.main()
