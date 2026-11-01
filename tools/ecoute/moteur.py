"""VerseObs Écoute : moteur local (découpage par pauses, transcription, traduction).

Tout tourne sur le processeur de l'ordinateur de la régie : rien ne part sur
Internet, sauf si l'opérateur a enregistré ses propres clés d'API
(configurer-cles.cmd) : traduction par Claude (Anthropic), transcription par
OpenAI. Les clés ne sont lues que dans l'environnement du service, jamais
affichées ni journalisées ; un plafond de dépense par séance ramène tout en
local, comme toute panne, lenteur ou quota de l'API.
"""

from __future__ import annotations

import io
import json
import math
import os
import queue
import re
import secrets
import socket
import threading
import time
import urllib.error
import urllib.request
import wave
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
            if cut > 40:
                cut += 1
            else:  # jamais au milieu d'un mot
                space = p.rfind(" ", 0, limit)
                cut = space if space > 40 else limit
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


# --------------------------------------------- API payantes (option) --
# Vérifié le 01/11/2026 sur la documentation officielle :
# - Claude Sonnet 5 (« claude-sonnet-5 », 2 $ / 10 $ par million de jetons, réflexion
#   adaptative réglée par output_config.effort) et Claude Haiku 4.5, le Haiku le plus
#   récent (« claude-haiku-4-5-20251001 », 1 $ / 5 $, « le plus rapide », effort non pris
#   en charge) : docs.claude.com/en/docs/about-claude/models/overview, /pricing, /effort.
#   En-têtes x-api-key et anthropic-version (docs.claude.com/en/api/versioning :
#   2023-06-01 ; la 2026-10-21 refuse temperature/top_p/top_k, jamais envoyés ici).
# - Choix « auto » (défaut) : Sonnet 5 en effort bas ; si la médiane des 5 dernières
#   traductions dépasse 1,5 s (délai dépassé compté), Haiku 4.5 pour le reste de la séance.
#   Aucune clé n'était disponible pour mesurer avant le culte : la latence de chaque
#   phrase est notée au journal et le choix se fait sur place.
# - OpenAI « gpt-transcribe » est le modèle de transcription recommandé (guide
#   speech-to-text : « Start with gpt-transcribe »), 0,0045 $ par minute d'audio
#   (developers.openai.com/api/docs/models/gpt-transcribe). Envoi par phrase découpée
#   aux pauses (le flux temps réel passe par une session WebSocket : pas pour ce premier essai).
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
CLAUDE_SONNET = "claude-sonnet-5"
CLAUDE_HAIKU = "claude-haiku-4-5-20251001"
ANTHROPIC_MODEL = "auto"  # Sonnet 5, puis Haiku 4.5 si la médiane dépasse SLOW_CLAUDE
SLOW_CLAUDE = 1.5  # s par traduction (médiane des 5 dernières)
ANTHROPIC_PRICES = {  # $ par million de jetons (entrée, sortie)
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-opus-5": (5.0, 25.0),
}
EFFORT_MODELS = ("claude-sonnet-5", "claude-opus-5", "claude-fable-5")  # output_config.effort accepté
DISPLAY = {"claude-sonnet-5": "Claude Sonnet 5", "claude-haiku-4-5": "Claude Haiku 4.5",
           "claude-opus-5": "Claude Opus 5", "gpt-transcribe": "OpenAI gpt-transcribe"}
UNKNOWN_CLAUDE_PRICE = (5.0, 25.0)  # modèle hors table : on compte cher, le plafond protège
OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions"
OPENAI_TRANSCRIBE_MODEL = "gpt-transcribe"
OPENAI_TRANSCRIBE_PRICES = {"gpt-transcribe": 0.0045}  # $ par minute d'audio
UNKNOWN_TRANSCRIBE_PRICE = 0.006
# Noms propres à VerseObs : jamais ANTHROPIC_API_KEY / OPENAI_API_KEY, que
# Claude Code ou Codex sur le même PC prendraient pour eux (facturation API).
KEY_ENV = {"anthropic": "VERSEOBS_ECOUTE_ANTHROPIC_CLE", "openai": "VERSEOBS_ECOUTE_OPENAI_CLE"}
_KEY_LIKE = re.compile(r"(sk-|key-|bearer\s+)[A-Za-z0-9_\-.]{6,}", re.I)


def mask_secrets(text, *keys) -> str:
    """Retire toute clé (connue ou de forme sk-…) d'un texte affiché ou journalisé."""
    text = str(text or "")
    for k in keys:
        if k and len(k) >= 6:
            text = text.replace(k, "•••")
    return _KEY_LIKE.sub(lambda m: m.group(1) + "•••", text)


def euros(x: float) -> str:
    return f"{x:.2f}".replace(".", ",") + " €"


def display_name(model: str) -> str:
    for name in sorted(DISPLAY, key=len, reverse=True):
        if model == name or model.startswith(name + "-"):
            return DISPLAY[name]
    return model


def price_for(prices: dict, model: str):
    for name in sorted(prices, key=len, reverse=True):
        if model == name or model.startswith(name + "-"):
            return prices[name]
    return None


class Depense:
    """Coût estimé d'une séance (un lancement du service), noté au journal.

    Aucun plafond par défaut (décision de Math, 01/11). Avec --plafond-euros,
    chaque appel payant est estimé AVANT de partir : s'il ferait dépasser le
    plafond, il ne part pas et tout repasse en local jusqu'à la fin de la séance.
    """

    def __init__(self, plafond_eur=None, euros_par_dollar=1.0, on_change=None, journal=None):
        self.plafond = None if plafond_eur is None else max(0.0, float(plafond_eur))
        self.taux = float(euros_par_dollar)
        self.on_change = on_change or (lambda: None)
        self.journal = journal or (lambda obj: None)
        self.usd = 0.0
        self.capped = False
        self.calls = {"anthropic": 0, "openai": 0}
        self.tokens_in = self.tokens_out = 0
        self.audio_s = 0.0
        self.local = 0  # phrases faites en local alors qu'une API était prévue
        self._lock = threading.Lock()

    @property
    def eur(self) -> float:
        return self.usd * self.taux

    def allow(self, estimate_usd: float) -> bool:
        with self._lock:
            if self.capped:
                return False
            if self.plafond is None or (self.usd + max(0.0, estimate_usd)) * self.taux <= self.plafond:
                return True
            self.capped = True
            total = self.eur
        self.journal({"type": "api_plafond", "t": time.time(), "total_eur": round(total, 4),
                      "plafond_eur": self.plafond})
        print("[api] plafond de dépense atteint : retour au tout local.", flush=True)
        self.on_change()
        return False

    def add(self, service: str, model: str, usd: float, estimated=False, **detail):
        with self._lock:
            self.usd += max(0.0, usd)
            self.calls[service] = self.calls.get(service, 0) + 1
            self.tokens_in += int(detail.get("jetons_entree") or 0)
            self.tokens_out += int(detail.get("jetons_sortie") or 0)
            self.audio_s += float(detail.get("audio_s") or 0.0)
            total = self.eur
        self.journal(dict({"type": "api_cout", "t": time.time(), "service": service, "modele": model,
                           "cout_usd": round(usd, 6), "estime": bool(estimated),
                           "total_eur": round(total, 4)}, **detail))

    def notice(self) -> str:
        return ("Plafond de dépense atteint : traduction et transcription repassées en local "
                "jusqu'à la fin de la séance.") if self.capped else ""

    def recap(self) -> dict:
        with self._lock:
            return {
                "total_eur": round(self.eur, 4),
                "plafond_eur": self.plafond,
                "plafond_atteint": self.capped,
                "appels_claude": self.calls.get("anthropic", 0),
                "jetons_entree": self.tokens_in,
                "jetons_sortie": self.tokens_out,
                "appels_transcription": self.calls.get("openai", 0),
                "minutes_transcrites": round(self.audio_s / 60, 2),
                "phrases_en_local": self.local,
            }

    def recap_text(self) -> str:
        r = self.recap()
        plafond = "sans plafond" if r["plafond_eur"] is None else "plafond " + euros(r["plafond_eur"])
        parts = [f"{euros(r['total_eur'])} estimés ({plafond}" + (", atteint" if r["plafond_atteint"] else "") + ")"]
        if r["appels_claude"]:
            parts.append(f"Claude : {r['appels_claude']} phrases")
        if r["appels_transcription"]:
            parts.append(f"OpenAI : {r['minutes_transcrites']:.1f} min".replace(".", ","))
        if r["phrases_en_local"]:
            parts.append(f"{r['phrases_en_local']} replis en local")
        return " · ".join(parts)


def _api_error(exc):
    """(code HTTP, raison courte, définitive) — jamais le corps brut de la réponse."""
    if isinstance(exc, urllib.error.HTTPError):
        kind = ""
        try:
            data = json.loads(exc.read(4000).decode("utf-8", "replace"))
            kind = re.sub(r"[^a-z_]", "", str((data.get("error") or {}).get("type") or ""))[:40]
        except Exception:
            pass
        reason = f"HTTP {exc.code}" + (f" {kind}" if kind else "")
        # Clé refusée, facturation, droits, modèle inconnu, requête rejetée
        # (dont le plafond de dépense fixé dans la console) : inutile d'insister.
        return exc.code, reason, exc.code in (400, 401, 402, 403, 404)
    if isinstance(exc, (socket.timeout, TimeoutError)) or "timed out" in str(exc):
        return 0, "délai dépassé", False
    if isinstance(exc, urllib.error.URLError) and isinstance(getattr(exc, "reason", None), (socket.timeout, TimeoutError)):
        return 0, "délai dépassé", False
    return 0, ("réseau indisponible" if isinstance(exc, (urllib.error.URLError, OSError))
               else "réponse illisible"), False


class _Garde:
    """Repli local d'un client payant : une panne → cette phrase en local ;
    deux de suite ou un quota (429) → local pendant 60 s ; clé refusée ou
    requête rejetée → local jusqu'à la fin de la séance."""

    PAUSE = 60.0

    def __init__(self, label: str, budget: Depense):
        self.label, self.budget = label, budget
        self.calls = self.failures = self.consecutive = 0
        self.until = 0.0
        self.off = ""
        self.notice = ""

    def usable(self) -> bool:
        return not self.off and not self.budget.capped and time.time() >= self.until

    def ok(self):
        self.calls += 1
        self.consecutive = 0
        if not self.off:
            self.notice = ""

    def failed(self, exc, key) -> bool:
        """Retourne True si l'appel a pu partir et être facturé (délai dépassé)."""
        code, reason, final = _api_error(exc)
        self.failures += 1
        self.consecutive += 1
        if final:
            self.off = reason
            self.notice = f"{self.label} : {reason}, local jusqu'à la fin de la séance."
        elif code == 429 or self.consecutive >= 2:
            self.until = time.time() + self.PAUSE
            self.notice = f"{self.label} : {reason}, local pendant 1 min."
        else:
            self.notice = f"{self.label} : {reason}, phrase faite en local."
        self.notice = mask_secrets(self.notice, key)
        print("[api] " + self.notice, flush=True)
        return reason == "délai dépassé"


_WRAPPERS = re.compile(r'^(?:english|translation|traduction)\s*:\s*', re.I)


class AnthropicTranslator:
    """Traduction par Claude (API Messages d'Anthropic) avec un court contexte
    des phrases précédentes. Toute erreur, lenteur, quota ou dépassement du
    plafond : la traduction locale (OPUS-MT) prend la phrase."""

    SYSTEM = (
        "You write live English subtitles for a French Christian sermon, for a listener who "
        "does not speak French. Translate the NEW French fragment into natural, faithful English. "
        "Keep names and Bible references, with standard English book names (Jean 3:16 -> John 3:16). "
        "The French comes from speech recognition: fix an obvious recognition slip only when the "
        "context makes it certain. Never add notes, quotes or comments. Answer with the English "
        "translation of the new fragment only."
    )

    def __init__(self, key: str, fallback, budget: Depense, model=ANTHROPIC_MODEL, url=ANTHROPIC_URL,
                 timeout=4.0, context=3, max_tokens=400, slow=SLOW_CLAUDE):
        check_api_url(url)
        if not key:
            raise ValueError("clé Anthropic absente")
        self._key = key
        self.fallback, self.budget = fallback, budget
        self.auto = model in ("", "auto")
        self.url, self.timeout = url, float(timeout)
        self.max_tokens = int(max_tokens)
        self.history: deque = deque(maxlen=max(0, int(context)))
        self.slow = float(slow)
        self.latencies: deque = deque(maxlen=5)
        self.effort_ok = True
        self.garde = _Garde("Claude", budget)
        self._use(CLAUDE_SONNET if self.auto else model)

    def _use(self, model: str):
        self.model = model
        self.p_in, self.p_out = price_for(ANTHROPIC_PRICES, model) or UNKNOWN_CLAUDE_PRICE
        self.name = "claude:" + model
        self.latencies.clear()

    def _switch_to_haiku(self, why: str):
        if not self.auto or self.model == CLAUDE_HAIKU:
            return False
        before = self.model
        self._use(CLAUDE_HAIKU)
        self.budget.journal({"type": "api_modele", "t": time.time(), "de": before, "vers": CLAUDE_HAIKU,
                             "raison": why})
        print(f"[api] traduction : {display_name(before)} → {display_name(CLAUDE_HAIKU)} ({why}).", flush=True)
        return True

    def _measured(self, seconds: float):
        """Latence d'une traduction (ou délai dépassé) : règle Sonnet/Haiku du mode auto."""
        self.latencies.append(seconds)
        if self.auto and self.model != CLAUDE_HAIKU and len(self.latencies) == self.latencies.maxlen:
            median = sorted(self.latencies)[len(self.latencies) // 2]
            if median > self.slow:
                self._switch_to_haiku(f"médiane {median:.2f} s > {self.slow:.1f} s")

    def __repr__(self):
        return f"AnthropicTranslator(model={self.model!r})"

    def _prompt(self, text: str) -> str:
        lines = []
        if self.history:
            lines.append("Context, already subtitled (do not translate again):")
            for fr, en in self.history:
                lines.append("FR: " + fr[-300:])
                lines.append("EN: " + en[-300:])
            lines.append("")
        lines.append("New French fragment to translate:")
        lines.append(text)
        return "\n".join(lines)

    def _cost(self, tokens_in: float, tokens_out: float) -> float:
        return (tokens_in * self.p_in + tokens_out * self.p_out) / 1e6

    def __call__(self, text: str) -> str:
        if not self.garde.usable():
            return self._local(text)
        user = self._prompt(text)
        estimate = self._cost((len(self.SYSTEM) + len(user)) / 3 + 20,
                              min(self.max_tokens, len(text) / 2.5 + 30))
        if not self.budget.allow(estimate):
            return self._local(text)
        t0 = time.time()
        try:
            data = self._post(user)
            took = time.time() - t0
            usage = data.get("usage") or {}
            tin, tout = int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0)
            model = self.model
            self.budget.add("anthropic", model, self._cost(tin, tout), jetons_entree=tin,
                            jetons_sortie=tout, duree_s=round(took, 3))
            self._measured(took)
            out = "".join(b.get("text", "") for b in data.get("content") or []
                          if isinstance(b, dict) and b.get("type") == "text")
            out = clean_text(_WRAPPERS.sub("", out.strip().strip('"').strip("“”")))
            if not out:
                raise ValueError("réponse vide")
            self.garde.ok()
            self.history.append((text, out))
            return out
        except Exception as exc:
            code = exc.code if isinstance(exc, urllib.error.HTTPError) else 0
            if self.auto and code in (400, 404) and self._switch_to_haiku(f"HTTP {code} sur Sonnet"):
                return self._local(text)  # Haiku dès la phrase suivante
            if self.garde.failed(exc, self._key):  # parti mais sans réponse : compté
                self.budget.add("anthropic", self.model, estimate, estimated=True,
                                duree_s=round(time.time() - t0, 3))
                self._measured(self.timeout)
            return self._local(text)

    def _post(self, user: str) -> dict:
        payload = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": self.SYSTEM,
            "messages": [{"role": "user", "content": user}],
        }
        effort = self.effort_ok and any(self.model == m or self.model.startswith(m + "-") for m in EFFORT_MODELS)
        if effort:  # sous-titres : réflexion minimale, réponse aussitôt
            payload["output_config"] = {"effort": "low"}
        try:
            return self._send(payload)
        except urllib.error.HTTPError as exc:
            if not (effort and exc.code == 400):
                raise
            self.effort_ok = False  # paramètre refusé : on le retire pour la séance
            payload.pop("output_config")
            return self._send(payload)

    def _send(self, payload: dict) -> dict:
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode("utf-8"), method="POST", headers={
            "content-type": "application/json",
            "x-api-key": self._key,
            "anthropic-version": ANTHROPIC_VERSION,
        })
        with _API_OPENER.open(req, timeout=self.timeout) as r:
            return json.loads(r.read().decode("utf-8"))

    def _local(self, text: str) -> str:
        self.budget.local += 1
        out = self.fallback(text) if self.fallback else ""
        if out:
            self.history.append((text, out))
        return out


def wav_bytes(audio: np.ndarray) -> bytes:
    pcm = (np.clip(np.asarray(audio, np.float32), -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)
    return buf.getvalue()


def multipart(fields: dict, file: tuple):
    boundary = "verseobs-" + secrets.token_hex(12)
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n'.encode())
        out.write(str(v).encode("utf-8") + b"\r\n")
    name, filename, ctype, data = file
    out.write(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
              f'filename="{filename}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
    out.write(data + f"\r\n--{boundary}--\r\n".encode())
    return out.getvalue(), "multipart/form-data; boundary=" + boundary


class OpenAITranscriber:
    """Transcription par l'API OpenAI (gpt-transcribe), seulement si une clé
    OpenAI est enregistrée. Toute erreur, lenteur, quota ou dépassement du
    plafond : Whisper en local prend la phrase."""

    def __init__(self, key: str, fallback, budget: Depense, model=OPENAI_TRANSCRIBE_MODEL,
                 url=OPENAI_TRANSCRIBE_URL, timeout=8.0, prompt=DEFAULT_PROMPT):
        check_api_url(url)
        if not key:
            raise ValueError("clé OpenAI absente")
        self._key = key
        self.fallback, self.budget = fallback, budget
        self.model, self.url, self.timeout = model, url, float(timeout)
        self.price = price_for(OPENAI_TRANSCRIBE_PRICES, model) or UNKNOWN_TRANSCRIBE_PRICE
        self.base_prompt, self.previous = prompt, ""
        self.garde = _Garde("Transcription OpenAI", budget)
        self.name = "openai:" + model

    def __repr__(self):
        return f"OpenAITranscriber(model={self.model!r})"

    def __call__(self, audio: np.ndarray) -> str:
        seconds = len(audio) / SR
        if not self.garde.usable():
            return self._local(audio)
        estimate = math.ceil(seconds) / 60 * self.price
        if not self.budget.allow(estimate):
            return self._local(audio)
        fields = {"model": self.model, "language": "fr", "response_format": "json"}
        prompt = (self.base_prompt + " " + self.previous[-200:]).strip()
        if prompt:
            fields["prompt"] = prompt
        body, ctype = multipart(fields, ("file", "phrase.wav", "audio/wav", wav_bytes(audio)))
        req = urllib.request.Request(self.url, data=body, method="POST", headers={
            "Content-Type": ctype,
            "Authorization": "Bearer " + self._key,
        })
        t0 = time.time()
        try:
            with _API_OPENER.open(req, timeout=self.timeout) as r:
                data = json.loads(r.read().decode("utf-8"))
            usage = data.get("usage") or {}
            billed = math.ceil(seconds)
            if usage.get("type") == "duration" and isinstance(usage.get("seconds"), (int, float)):
                billed = float(usage["seconds"])
            self.budget.add("openai", self.model, billed / 60 * self.price, audio_s=round(seconds, 2),
                            duree_s=round(time.time() - t0, 3))
            if not isinstance(data, dict) or not isinstance(data.get("text"), str):
                raise ValueError("réponse sans texte")  # schéma inattendu : repli local
            text = clean_text(data["text"])
            if HALLUCINATIONS.search(text) and len(text) < 120:
                text = ""
            self.garde.ok()
            if not text:
                # Un segment retenu comme parole par le découpage, rendu vide par l'API :
                # Whisper le tente (il peut lui aussi conclure au silence).
                return self._local(audio)
            self.previous = text
            return text
        except Exception as exc:
            if self.garde.failed(exc, self._key):
                self.budget.add("openai", self.model, estimate, estimated=True, audio_s=round(seconds, 2),
                                duree_s=round(time.time() - t0, 3))
            return self._local(audio)

    def _local(self, audio: np.ndarray) -> str:
        self.budget.local += 1
        return self.fallback(audio) if self.fallback else ""


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

    SILENT_AFTER = 3.0  # secondes sans aucun bloc : entrée perdue

    def run(self, push, stop: threading.Event):
        resample = Resampler(self.rate)
        last = [time.time()]

        def callback(data, frames, when, status):  # noqa: ARG001
            last[0] = time.time()
            push(resample(to_mono(data)), last[0])

        with self.sd.InputStream(
            device=self.device,
            channels=self.channels,
            samplerate=self.rate,
            dtype="float32",
            blocksize=int(self.rate * 0.1),
            callback=callback,
        ) as stream:
            while not stop.wait(0.2):
                # Un câble débranché ou un pilote figé ne lève pas toujours
                # d'erreur : sans bloc depuis 3 s, l'écoute passe en panne.
                if not stream.active or time.time() - last[0] > self.SILENT_AFTER:
                    raise RuntimeError("plus aucun son reçu (entrée débranchée ou arrêtée ?)")


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
        self._lost = 0.0  # pertes de la file pas encore annoncées
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
                                with self._lock:
                                    self._lost += len(old[0]) / SR
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
                        with self._lock:
                            lost, self._lost = self._lost, 0.0
                        if lost:  # file saturée : la perte est annoncée comme un saut
                            self.skipped += lost
                            self.on_caption({"gap": round(lost, 1)})
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
            if stop.is_set():
                return
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
