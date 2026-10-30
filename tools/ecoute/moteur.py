"""VerseObs Écoute : moteur local (découpage par pauses, transcription, traduction).

Tout tourne sur le processeur de l'ordinateur de la régie : rien ne part sur
Internet, sauf si l'église active elle-même une traduction par API (option,
désactivée par défaut, clé lue dans l'environnement du service uniquement).
"""

from __future__ import annotations

import json
import os
import queue
import re
import threading
import time
import urllib.request
from collections import deque
from urllib.parse import urlsplit
from dataclasses import dataclass

import numpy as np

SR = 16000  # Whisper travaille en 16 kHz mono.

# Phrases que Whisper invente sur du silence ou de la musique (génériques de
# vidéos françaises). Une ligne qui les contient n'est jamais publiée.
HALLUCINATIONS = re.compile(
    r"(sous-titr|amara\.org|merci d'avoir regard|abonnez-vous|"
    r"n'oubliez pas de vous abonner|st' ?501|radio-canada|"
    r"merci de votre attention\.?$)",
    re.I,
)
DEFAULT_PROMPT = "Prédication à l'église. Jésus-Christ, le Saint-Esprit, Dieu."


# ---------------------------------------------------------------- audio --


def to_mono(block: np.ndarray) -> np.ndarray:
    """(trames, canaux) -> mono float32."""
    block = np.asarray(block, dtype=np.float32)
    if block.ndim == 1:
        return block
    return block.mean(axis=1).astype(np.float32)


class Resampler:
    """Rééchantillonnage en continu vers 16 kHz (PyAV si présent, sinon linéaire)."""

    def __init__(self, rate: int):
        self.rate = int(rate)
        self._av = None
        self._pos = 0.0  # repli linéaire : position fractionnaire de la prochaine sortie
        self._last = np.zeros(0, np.float32)
        if self.rate != SR:
            try:
                import av  # dépendance de faster-whisper

                self._avmod = av
                self._av = av.AudioResampler(format="flt", layout="mono", rate=SR)
            except Exception:
                self._av = None

    def __call__(self, mono: np.ndarray) -> np.ndarray:
        mono = np.asarray(mono, dtype=np.float32)
        if self.rate == SR or mono.size == 0:
            return mono
        if self._av is not None:
            try:
                frame = self._avmod.AudioFrame.from_ndarray(
                    mono.reshape(1, -1), format="flt", layout="mono"
                )
                frame.sample_rate = self.rate
                out = [f.to_ndarray().reshape(-1) for f in self._av.resample(frame)]
                return (
                    np.concatenate(out).astype(np.float32)
                    if out
                    else np.zeros(0, np.float32)
                )
            except Exception:
                self._av = None
        # Repli : interpolation linéaire continue d'un bloc à l'autre.
        x = np.concatenate([self._last, mono])
        step = self.rate / SR
        idx = np.arange(self._pos, len(x) - 1, step)
        out = np.interp(idx, np.arange(len(x)), x).astype(np.float32)
        nxt = self._pos + len(idx) * step
        keep = int(np.floor(nxt))
        self._pos = nxt - keep
        self._last = x[keep:]
        return out


# --------------------------------------------------------- segmentation --


@dataclass
class Segment:
    audio: np.ndarray
    start: float  # secondes depuis le début du flux
    end: float
    wall_start: float  # heure (time.time) où le début a été entendu
    wall_end: float  # heure où la fin a été entendue
    forced: bool = False  # coupé faute de pause (phrase très longue)


def silero_vad(threshold: float = 0.5, min_silence_ms: int = 250, min_speech_ms: int = 120):
    """Détecteur de voix Silero fourni avec faster-whisper (ONNX, local)."""
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    opts = VadOptions(
        threshold=threshold,
        min_silence_duration_ms=min_silence_ms,
        min_speech_duration_ms=min_speech_ms,
        speech_pad_ms=0,
    )

    def run(audio: np.ndarray):
        return [(c["start"], c["end"]) for c in get_speech_timestamps(audio, opts)]

    return run


class Segmenter:
    """Découpe un flux 16 kHz en phrases courtes, aux pauses naturelles.

    Une phrase part dès qu'une pause de `min_pause` s suit la parole ; une
    tirade sans pause est coupée à sa plus longue respiration avant `max_len` s.
    """

    def __init__(self, vad=None, min_pause=0.5, max_len=8.0, min_len=1.0, pad=0.15, hop=0.3):
        self.vad = vad or silero_vad()
        self.min_pause, self.max_len, self.min_len = min_pause, max_len, min_len
        self.pad, self.hop = pad, hop
        self.buf = np.zeros(0, np.float32)
        self.t0 = 0.0  # temps du flux de buf[0]
        self.total = 0  # échantillons reçus depuis le début
        self.since = 0
        self.anchors: deque = deque(maxlen=4000)  # (temps du flux, heure murale)

    def wall(self, t: float) -> float:
        """Heure murale à laquelle l'instant `t` du flux a été entendu."""
        for stream_end, wall_end in self.anchors:
            if stream_end >= t:
                return wall_end - (stream_end - t)
        if self.anchors:
            stream_end, wall_end = self.anchors[-1]
            return wall_end + (t - stream_end)
        return time.time()

    def feed(self, chunk: np.ndarray, wall_end: float | None = None, scan=True, max_len=None):
        """Ajoute un bloc ; rend les phrases terminées. `max_len` plus grand
        quand le moteur a du retard : moins d'appels, même texte."""
        chunk = np.asarray(chunk, dtype=np.float32)
        self.buf = np.concatenate([self.buf, chunk])
        self.total += len(chunk)
        if len(chunk):
            self.anchors.append((self.total / SR, wall_end if wall_end else time.time()))
        self.since += len(chunk)
        if not scan or self.since < self.hop * SR:
            return []
        self.since = 0
        out = []
        while True:
            seg = self._cut(max_len or self.max_len)
            if seg is None:
                return out
            out.append(seg)

    def reset(self):
        """Abandonne l'audio en attente (rattrapage du direct)."""
        self.t0 += len(self.buf) / SR
        self.buf = np.zeros(0, np.float32)

    def flush(self):
        """Fin du flux : la parole en attente part telle quelle."""
        out = []
        if len(self.buf) >= int(0.3 * SR):
            spans = self.vad(self.buf)
            if spans:
                a = max(0, spans[0][0] - int(self.pad * SR))
                b = min(len(self.buf), spans[-1][1] + int(self.pad * SR))
                self._drop(a)
                out.append(self._emit(b - a, forced=False))
        self.buf = np.zeros(0, np.float32)
        return out

    def take(self, limit: float):
        """En retard : une seule phrase avec tout ce qui attend (`limit` s au
        plus), coupée à la dernière respiration avant la fin."""
        n = len(self.buf)
        if n < int(self.min_len * SR):
            return None
        spans = self.vad(self.buf)
        if not spans:
            self._drop(n - int(0.3 * SR))
            return None
        pad = int(self.pad * SR)
        lead = max(0, spans[0][0] - pad)
        if lead:
            self._drop(lead)
            spans = [(a - lead, b - lead) for a, b in spans]
            n -= lead
        lim = min(n, int(limit * SR))
        end = spans[-1][1]
        if n - end >= self.min_pause * SR and end <= lim:
            return self._emit(min(n, end + pad), forced=False)
        best = None
        for (_, b), (c, _) in zip(spans, spans[1:]):
            if b >= self.min_len * SR and c <= lim:
                best = b + min((c - b) // 2, pad)  # la plus tardive
        if best:
            return self._emit(best, forced=True)
        if n >= int(min(limit, self.max_len) * SR):
            return self._emit(lim, forced=True)
        return None  # phrase en cours, sans respiration : attendre la suite

    def _drop(self, n: int):
        if n > 0:
            self.buf = self.buf[n:]
            self.t0 += n / SR

    def _emit(self, cut: int, forced: bool) -> Segment:
        audio = self.buf[:cut].copy()
        start, end = self.t0, self.t0 + cut / SR
        seg = Segment(audio, start, end, self.wall(start), self.wall(end), forced)
        self._drop(cut)
        return seg

    def _cut(self, max_len):
        n = len(self.buf)
        if n < int(0.4 * SR):
            return None
        spans = self.vad(self.buf)
        if not spans:
            self._drop(n - int(0.3 * SR))  # garder 0,3 s avant une prise de parole
            return None
        pad = int(self.pad * SR)
        lead = max(0, spans[0][0] - pad)
        if lead:
            self._drop(lead)
            spans = [(a - lead, b - lead) for a, b in spans]
            n -= lead
        first, last = spans[0][0], spans[-1][1]
        silence = n - last
        limit = int(max_len * SR)
        if silence >= self.min_pause * SR and last <= limit:
            # Un « amen » isolé attend un peu : il est souvent suivi d'une phrase.
            if last - first < self.min_len * SR and silence < 1.5 * SR:
                return None
            return self._emit(min(n, last + pad), forced=False)
        if n >= limit:
            best = None
            for (_, b), (c, _) in zip(spans, spans[1:]):
                if b >= self.min_len * SR and c <= limit:
                    if best is None or c - b > best[0]:
                        best = (c - b, b)
            if best and best[0] >= int(0.12 * SR):
                return self._emit(best[1] + min(best[0] // 2, pad), forced=True)
            return self._emit(limit, forced=True)
        return None


# -------------------------------------------------------- transcription --


def collapse_repeats(text: str, limit: int = 3) -> str:
    """« amen amen amen amen amen » -> trois fois au plus (boucles de Whisper)."""
    words = text.split()
    for size in (1, 2, 3, 4):
        keys = [re.sub(r"[^\w]", "", w.lower()) for w in words]
        out, i = [], 0
        while i < len(words):
            gram = keys[i : i + size]
            if len(gram) < size:
                out.extend(words[i:])
                break
            j, count = i + size, 1
            while keys[j : j + size] == gram:
                count += 1
                j += size
            if count > limit:
                out.extend(words[i : i + size * limit])
                i = j
            else:
                out.append(words[i])
                i += 1
        words = out
    return " ".join(words)


def clean_text(text: str) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return collapse_repeats(text)


class Transcriber:
    """faster-whisper en int8 sur le processeur, français imposé."""

    def __init__(self, model="small", threads=4, beam=1, prompt=DEFAULT_PROMPT, download_root=None):
        from faster_whisper import WhisperModel

        self.name = model
        self.model = WhisperModel(
            model, device="cpu", compute_type="int8", cpu_threads=threads, download_root=download_root
        )
        self.beam, self.base_prompt, self.previous = beam, prompt, ""

    def __call__(self, audio: np.ndarray) -> str:
        prompt = (self.base_prompt + " " + self.previous[-200:]).strip()
        segments, _ = self.model.transcribe(
            audio,
            language="fr",
            task="transcribe",
            beam_size=self.beam,
            best_of=1,
            temperature=(0.0, 0.3, 0.6),
            vad_filter=False,
            condition_on_previous_text=False,
            without_timestamps=True,
            initial_prompt=prompt or None,
            # Spectrogramme calculé sur la phrase (+2 s) au lieu de 30 s de
            # silence ajouté : 10 à 15 % de temps en moins, même texte mesuré.
            chunk_length=max(10, min(30, int(len(audio) / SR) + 2)),
        )
        parts = []
        for s in segments:
            if s.no_speech_prob > 0.6 and s.avg_logprob < -0.8:
                continue
            t = s.text.strip()
            if t and not HALLUCINATIONS.search(t):
                parts.append(t)
        text = clean_text(" ".join(parts))
        if text:
            self.previous = text
        return text


class OpenVinoTranscriber:
    """Option : Whisper par OpenVINO sur la puce graphique Intel (Iris Xe) ou
    le processeur. Mesuré sur le PC de la régie : small int8 2 fois plus
    rapide sur l'Iris Xe que faster-whisper sur le processeur, mais plus de
    mots perdus (écart de 20 % contre 12 % à la référence, extrait de 5 min)."""

    def __init__(self, model="small", device="GPU", prompt=DEFAULT_PROMPT):
        import openvino_genai as ov_genai

        path = model
        if not os.path.isdir(model):
            from huggingface_hub import snapshot_download

            path = snapshot_download(f"OpenVINO/whisper-{model}-int8-ov")
        self.pipe = ov_genai.WhisperPipeline(path, device)
        self.cfg = self.pipe.get_generation_config()
        self.cfg.language = "<|fr|>"
        self.cfg.task = "transcribe"
        self.cfg.return_timestamps = False
        self.cfg.max_new_tokens = 220
        if prompt and hasattr(self.cfg, "initial_prompt"):
            try:
                self.cfg.initial_prompt = prompt
            except Exception:
                pass
        self.name = f"openvino-{os.path.basename(os.path.normpath(model))}-{device.lower()}"
        self.pipe.generate(np.zeros(SR, np.float32).tolist(), self.cfg)  # compilation

    def __call__(self, audio: np.ndarray) -> str:
        result = self.pipe.generate(np.asarray(audio, np.float32).tolist(), self.cfg)
        texts = getattr(result, "texts", None) or [str(result)]
        parts = [t.strip() for t in texts if t and not HALLUCINATIONS.search(t)]
        return clean_text(" ".join(parts))


# ---------------------------------------------------------- traduction --


def split_sentences(text: str, limit: int = 280):
    parts = [p.strip() for p in re.split(r"(?<=[.!?…])\s+", text) if p.strip()]
    out = []
    for p in parts:
        while len(p) > limit:  # très long : couper à une virgule
            cut = p.rfind(", ", 0, limit)
            cut = cut + 1 if cut > 40 else limit
            out.append(p[:cut].strip())
            p = p[cut:].strip()
        if p:
            out.append(p)
    return out


def caption_units(text: str, limit: int = 160):
    """Unités de lecture courtes (une ou deux phrases), aucun mot perdu."""
    units, cur = [], ""
    for sentence in split_sentences(text, limit=limit):
        if cur and len(cur) + 1 + len(sentence) > limit:
            units.append(cur)
            cur = sentence
        else:
            cur = (cur + " " + sentence).strip()
    if cur:
        units.append(cur)
    return units


class Translator:
    """Marian OPUS-MT français -> anglais converti pour CTranslate2 (int8)."""

    def __init__(self, model_dir: str, threads=2, beam=2):
        import ctranslate2
        import sentencepiece as spm

        self.name = os.path.basename(os.path.normpath(model_dir))
        self.model = ctranslate2.Translator(
            model_dir, device="cpu", compute_type="int8", inter_threads=1, intra_threads=threads
        )
        self.src = spm.SentencePieceProcessor(model_file=os.path.join(model_dir, "source.spm"))
        self.tgt = spm.SentencePieceProcessor(model_file=os.path.join(model_dir, "target.spm"))
        self.beam = beam

    def __call__(self, text: str) -> str:
        sentences = split_sentences(text)
        if not sentences:
            return ""
        batch = [self.src.encode(s, out_type=str) + ["</s>"] for s in sentences]
        results = self.model.translate_batch(
            batch, beam_size=self.beam, max_decoding_length=256, repetition_penalty=1.05
        )
        out = [self.tgt.decode(r.hypotheses[0]).strip() for r in results]
        return clean_text(" ".join(o for o in out if o))


LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def check_api_url(url: str) -> str:
    """https:// partout ; http:// seulement vers cet ordinateur ; jamais d'identifiants dans l'adresse."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.username or parts.password or not host:
        raise ValueError("API de traduction : adresse invalide")
    if parts.scheme == "https" or (parts.scheme == "http" and host in LOOPBACK):
        return url
    raise ValueError("API de traduction : adresse https:// obligatoire (http seulement sur cet ordinateur)")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Une redirection ne doit jamais emporter la clé vers une autre adresse."""

    def redirect_request(self, *args, **kwargs):
        return None


_API_OPENER = urllib.request.build_opener(_NoRedirect)


class ApiTranslator:
    """Option : traduction par une API compatible OpenAI (chat/completions)
    fournie par l'église. Désactivée par défaut ; la clé ne quitte jamais ce
    service. En cas d'erreur ou de lenteur, la traduction locale prend le relais.
    """

    SYSTEM = (
        "Translate this French sermon transcript fragment into natural English. "
        "Keep Bible names and references. Answer with the translation only."
    )

    def __init__(self, url: str, key: str, model: str, fallback=None, timeout=4.0):
        check_api_url(url)
        self.url, self.key, self.model_name = url, key, model
        self.fallback, self.timeout = fallback, timeout
        self.name = "api:" + model
        self.failures = 0

    def __call__(self, text: str) -> str:
        body = json.dumps(
            {
                "model": self.model_name,
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": self.SYSTEM},
                    {"role": "user", "content": text},
                ],
            }
        ).encode()
        req = urllib.request.Request(
            self.url,
            data=body,
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.key},
        )
        try:
            with _API_OPENER.open(req, timeout=self.timeout) as r:
                data = json.loads(r.read().decode("utf-8"))
            out = clean_text(data["choices"][0]["message"]["content"])
            if out:
                return out
        except Exception:
            self.failures += 1
        return self.fallback(text) if self.fallback else ""


# -------------------------------------------------------------- sources --


def decode_file(path: str, start: float = 0.0, duration: float | None = None) -> np.ndarray:
    """Décode [start, start+duration] d'un fichier audio/vidéo en 16 kHz mono."""
    import av

    out, need = [], None if duration is None else int(duration * SR)
    got = 0
    with av.open(path) as container:
        stream = container.streams.audio[0]
        if start > 0:
            container.seek(int(start * 1_000_000), any_frame=False, backward=True)
        resampler = av.AudioResampler(format="flt", layout="mono", rate=SR)
        for frame in container.decode(stream):
            t = float(frame.pts * frame.time_base) if frame.pts is not None else 0.0
            for f in resampler.resample(frame):
                a = f.to_ndarray().reshape(-1)
                if t < start:  # le seek tombe un peu avant le début demandé
                    skip = int((start - t) * SR)
                    a = a[skip:]
                    t = start
                out.append(a)
                got += len(a)
            if need is not None and got >= need:
                break
    audio = np.concatenate(out).astype(np.float32) if out else np.zeros(0, np.float32)
    return audio[:need] if need is not None else audio


class FileSource:
    """Lit un extrait au rythme du direct (simulation, mesures, démonstration)."""

    def __init__(self, path, start=0.0, duration=None, chunk=0.1, realtime=True):
        self.label = os.path.basename(path)
        self.audio = decode_file(path, start, duration)
        self.chunk, self.realtime = chunk, realtime

    def run(self, push, stop: threading.Event):
        n = int(self.chunk * SR)
        t0 = time.time()
        for i in range(0, len(self.audio), n):
            if stop.is_set():
                return
            due = t0 + (i + n) / SR
            if self.realtime:
                delay = due - time.time()
                if delay > 0:
                    stop.wait(delay)
            push(self.audio[i : i + n], due if self.realtime else time.time())


def list_devices():
    """Entrées audio de cet ordinateur (WASAPI de préférence sous Windows)."""
    import sounddevice as sd

    apis = sd.query_hostapis()
    preferred = None
    for i, api in enumerate(apis):
        if "WASAPI" in api["name"]:
            preferred = i
    out = []
    for i, dev in enumerate(sd.query_devices()):
        if dev["max_input_channels"] <= 0:
            continue
        if preferred is not None and dev["hostapi"] != preferred:
            continue
        out.append({"index": i, "name": dev["name"][:80], "api": apis[dev["hostapi"]]["name"]})
    return out


class MicSource:
    """Micro, carte son ou sortie de la sono branchée sur une entrée de l'ordinateur."""

    def __init__(self, device):
        import sounddevice as sd

        self.sd = sd
        info = sd.query_devices(device, "input")
        self.device = device
        self.label = info["name"][:80]
        self.rate = int(info["default_samplerate"]) or 48000
        self.channels = max(1, min(2, int(info["max_input_channels"])))

    def run(self, push, stop: threading.Event):
        resample = Resampler(self.rate)

        def callback(data, frames, when, status):  # noqa: ARG001
            push(resample(to_mono(data)), time.time())

        with self.sd.InputStream(
            device=self.device,
            channels=self.channels,
            samplerate=self.rate,
            dtype="float32",
            blocksize=int(self.rate * 0.1),
            callback=callback,
        ):
            while not stop.wait(0.2):
                pass


# --------------------------------------------------------------- moteur --


class Engine:
    """Source -> découpage -> transcription -> traduction -> légende publiée."""

    def __init__(self, transcribe, translate, on_caption, on_change=None, segmenter=None,
                 catchup_max=24.0, max_delay=30.0, catchup=True, catchup_after=2.0):
        self.transcribe, self.translate = transcribe, translate
        self.on_caption, self.on_change = on_caption, on_change or (lambda: None)
        self.make_segmenter = segmenter or (lambda: Segmenter())
        self.status, self.error, self.source_label = "idle", "", ""
        self.latencies: deque = deque(maxlen=30)
        self.backlog = 0.0
        self.skipped = 0.0  # secondes abandonnées pour revenir au direct
        self.catchup_max, self.max_delay, self.catchup = catchup_max, max_delay, catchup
        self.catchup_after = catchup_after
        self.seq = 0
        self._stop = threading.Event()
        self._threads = []
        self._lock = threading.Lock()

    def stats(self):
        lat = list(self.latencies)
        return {
            "last": round(lat[-1], 2) if lat else None,
            "avg": round(sum(lat) / len(lat), 2) if lat else None,
            "max": round(max(lat), 2) if lat else None,
            "count": self.seq,
            "skipped": round(self.skipped, 1),
        }

    def start(self, source):
        with self._lock:
            if self.status in ("listening", "stopping"):
                return
            self._stop = threading.Event()
            self.status, self.error = "listening", ""
            self.source_label = getattr(source, "label", "")
            q: queue.Queue = queue.Queue(maxsize=1200)  # 2 min de blocs de 0,1 s au plus
            stop = self._stop

            def put(item):
                while True:
                    try:
                        q.put_nowait(item)
                        return
                    except queue.Full:  # moteur bloqué : on perd le plus ancien
                        try:
                            old = q.get_nowait()
                            if old is not None:
                                self.skipped += len(old[0]) / SR
                        except queue.Empty:
                            pass

            def produce():
                try:
                    source.run(lambda chunk, wall: put((chunk, wall)), stop)
                except Exception as exc:  # périphérique débranché, refusé…
                    self.error = "Entrée audio : " + str(exc)[:160]
                finally:
                    put(None)

            def consume():
                try:
                    seg = self.make_segmenter()
                    ended = False
                    while not ended:
                        items = [q.get()]
                        while True:  # tout ce qui attend : un seul passage s'il y a du retard
                            try:
                                items.append(q.get_nowait())
                            except queue.Empty:
                                break
                        if None in items:
                            ended = True
                            items = items[: items.index(None)]
                        if stop.is_set():
                            return  # arrêt de l'opérateur : plus rien n'est publié
                        if not items:
                            break
                        # Retard = attente du plus vieux bloc : la durée du dernier appel.
                        self.backlog = max(0.0, time.time() - items[0][1])
                        if self.backlog > self.max_delay:
                            # Le processeur ne suit plus : revenir au direct, et le dire.
                            lost = sum(len(c) for c, _ in items) / SR + len(seg.buf) / SR
                            self.skipped += lost
                            seg.reset()
                            self.on_caption({"gap": round(lost, 1)})
                            continue
                        if not self.catchup:  # une phrase par appel (comparaison)
                            for chunk, wall in items:
                                for s in seg.feed(chunk, wall):
                                    self._process(s, stop)
                            continue
                        # En retard (plus de 2 s d'attente, ou plus d'une phrase en réserve) :
                        # tout ce qui attend part en un seul appel, 24 s au plus.
                        # L'encodeur de Whisper coûte autant pour 2 s que pour 24 s.
                        for chunk, wall in items:
                            seg.feed(chunk, wall, scan=False)
                        behind = (
                            self.backlog > self.catchup_after
                            or len(seg.buf) / SR > seg.max_len + self.catchup_after
                        )
                        if behind:
                            s = seg.take(self.catchup_max)
                            if s:
                                self._process(s, stop)
                        else:
                            for s in seg.feed(np.zeros(0, np.float32), items[-1][1]):
                                self._process(s, stop)
                    if not stop.is_set():  # fin naturelle d'un fichier
                        for s in seg.flush():
                            self._process(s, stop)
                except Exception as exc:  # modèle, traduction ou publication en panne
                    self.error = "Moteur : " + (str(exc) or exc.__class__.__name__)[:160]
                    stop.set()  # la capture s'arrête aussi : rien ne s'accumule
                finally:
                    self.backlog = 0.0
                    with self._lock:
                        self.status = "error" if self.error else "idle"
                    self.on_change()

            self._threads = [
                threading.Thread(target=produce, name="ecoute-source", daemon=True),
                threading.Thread(target=consume, name="ecoute-moteur", daemon=True),
            ]
            for t in self._threads:
                t.start()
        self.on_change()

    def stop(self, wait=False):
        with self._lock:
            if self.status == "listening":
                self.status = "stopping"  # « idle » quand le calcul en cours est abandonné
        self._stop.set()
        self.on_change()
        if wait:
            self.wait()

    def wait(self):
        for t in self._threads:
            t.join()

    def _process(self, seg: Segment, stop: threading.Event):
        if stop.is_set():
            return
        t_a = time.time()
        fr = self.transcribe(seg.audio)
        t_b = time.time()
        if not fr or stop.is_set():
            return
        en = self.translate(fr)
        t_c = time.time()
        if not en or stop.is_set():
            return
        latency = t_c - seg.wall_end
        self.latencies.append(latency)
        units = caption_units(en)
        for i, unit in enumerate(units):
            self.seq += 1
            self.on_caption(
                {
                    "seq": self.seq,
                    "fr": fr,
                    "en": unit,
                    "unit": i + 1,
                    "units": len(units),
                    "start": round(seg.wall_start * 1000),
                    "end": round(seg.wall_end * 1000),
                    "ready": round(t_c * 1000),
                    "audio": round(seg.end - seg.start, 2),
                    "asr": round(t_b - t_a, 3),
                    "mt": round(t_c - t_b, 3),
                    "latency": round(latency, 2),
                    "forced": seg.forced,
                }
            )
