#!/usr/bin/env python3
"""VerseObs Écoute : sous-titres anglais en direct (service local).

Usage habituel, sur le PC de la régie, VerseObs lancé avec « npm start » :
    python tools/ecoute/ecoute.py
puis, dans le Studio local (http://127.0.0.1:8080) › Connexions ›
« Sous-titres anglais » : choisir l'entrée audio, Démarrer l'écoute, Partager.

Autres usages :
    python ecoute.py --liste                       entrées audio de l'ordinateur
    python ecoute.py --fichier culte.m4a --debut 3900 --duree 300
                                                   simulation au rythme du direct
    python ecoute.py --fichier x.wav --sans-relais --demarrer --fin-auto --journal m.jsonl
                                                   mesure sans VerseObs
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import sys
import threading
import time
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import moteur  # noqa: E402

TRANSLATOR_REPO = "michaelfeil/ct2fast-opus-mt-fr-en"
TRANSLATOR_FILES = ["config.json", "model.bin", "shared_vocabulary.txt", "source.spm", "target.spm"]


def translator_dir(arg: str | None) -> str:
    if arg:
        return arg
    local = os.path.join(HERE, "modeles", "opus-mt-fr-en")
    if os.path.isfile(os.path.join(local, "model.bin")):
        return local
    from huggingface_hub import snapshot_download  # dépendance de faster-whisper

    return snapshot_download(TRANSLATOR_REPO, allow_patterns=TRANSLATOR_FILES)


def relay_origin(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme != "ws" or parts.hostname not in ("127.0.0.1", "localhost"):
        raise SystemExit("Le relais doit être local : ws://127.0.0.1:<port>/verseobs-relay")
    return "http://" + parts.netloc


class Service:
    def __init__(self, args):
        self.args = args
        self.boot = secrets.token_hex(3)
        self.n = 0
        self.loop: asyncio.AbstractEventLoop | None = None
        self.outbox: asyncio.Queue | None = None
        self.ready = threading.Event()
        self.pending_start = None
        self.devices = []
        self.device = None
        self.file_source = None
        self.load_error = ""
        self.started_once = False
        self.journal = open(args.journal, "a", encoding="utf-8") if args.journal else None
        self.proc = None
        try:
            import psutil

            self.proc = psutil.Process()
            self.proc.cpu_percent(None)
            if args.priorite_basse:
                self.proc.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 10)
        except Exception:
            self.proc = None
        self.engine = None
        self.translator_name = ""
        self.asr_name = "whisper-" + args.modele + "-int8"

    # -- chargement -------------------------------------------------------
    def load(self):
        a = self.args
        try:
            t0 = time.time()
            if a.moteur == "openvino":
                transcribe = moteur.OpenVinoTranscriber(a.modele, device=a.appareil)
            else:
                transcribe = moteur.Transcriber(a.modele, threads=a.threads, beam=a.beam)
            local = moteur.Translator(translator_dir(a.traducteur), threads=a.threads_traduction)
            translate = local
            if a.api_url:
                key = os.environ.get("VERSEOBS_ECOUTE_API_CLE", "")
                if not key:
                    raise RuntimeError("VERSEOBS_ECOUTE_API_CLE absente : API de traduction non activée")
                translate = moteur.ApiTranslator(a.api_url, key, a.api_modele, fallback=local)
            self.translator_name = translate.name
            self.engine = moteur.Engine(
                transcribe,
                translate,
                self.on_caption,
                self.changed,
                segmenter=lambda: moteur.Segmenter(min_pause=a.pause, max_len=a.max_phrase),
            )
            if a.fichier:
                self.file_source = moteur.FileSource(a.fichier, a.debut, a.duree)
            else:
                try:
                    self.devices = moteur.list_devices()
                except Exception as exc:
                    self.load_error = "Entrées audio indisponibles : " + str(exc)[:120]
                if a.entree is not None:
                    self.device = int(a.entree) if str(a.entree).isdigit() else a.entree
            self.asr_name = getattr(transcribe, "name", "whisper-" + a.modele + "-int8")
            self.log(f"Modèles prêts en {time.time() - t0:.1f} s ({self.asr_name}, {self.translator_name}).")
        except Exception as exc:
            self.load_error = "Chargement impossible : " + str(exc)[:200]
            self.log(self.load_error)
        self.ready.set()
        self.changed()
        if self.engine and (self.args.demarrer or self.pending_start is not None):
            self.start(self.pending_start if self.pending_start is not None else self.device)

    # -- commandes ----------------------------------------------------------
    def start(self, device=None):
        if not self.ready.is_set():
            self.pending_start = device if device is not None else self.device
            return
        if not self.engine:
            return
        if self.file_source is not None:
            source = self.file_source
        else:
            if device is not None:
                self.device = device
            try:
                source = moteur.MicSource(self.device)
            except Exception as exc:
                self.engine.error = "Entrée audio : " + str(exc)[:160]
                self.engine.status = "error"
                self.changed()
                return
        self.started_once = True
        self.log("Écoute démarrée : " + getattr(source, "label", "?"))
        self.engine.start(source)

    def stop(self):
        if self.engine:
            self.engine.stop()
            self.log("Écoute arrêtée.")

    def command(self, msg):
        action = msg.get("action")
        if action == "start":
            device = msg.get("device")
            self.start(device if isinstance(device, int) else None)
        elif action == "stop":
            self.stop()

    # -- état et publication ------------------------------------------------
    def state(self):
        e = self.engine
        status = "loading" if not self.ready.is_set() else (e.status if e else "error")
        error = self.load_error if not e else (e.error or "")
        cpu = ram = None
        if self.proc:
            try:
                cpu = round(self.proc.cpu_percent(None) / (os.cpu_count() or 1), 1)
                ram = round(self.proc.memory_info().rss / 1048576)
            except Exception:
                pass
        return {
            "status": status,
            "error": error,
            "source": e.source_label if e else "",
            "file": self.file_source is not None,
            "devices": self.devices,
            "device": self.device if isinstance(self.device, int) else None,
            "model": self.asr_name,
            "translator": self.translator_name,
            "latency": e.stats() if e else {},
            "backlog": round(e.backlog, 1) if e else 0,
            "cpu": cpu,
            "ram": ram,
        }

    def message(self, kind, **extra):
        self.n += 1
        return dict(type=kind, id=f"ecoute-{self.boot}-{self.n}", ts=int(time.time() * 1000), **extra)

    def send(self, msg):
        if self.loop and self.outbox is not None:
            self.loop.call_soon_threadsafe(self.outbox.put_nowait, msg)

    def changed(self):
        st = self.state()
        self.write({"type": "state", "t": time.time(), "state": st})
        self.send(self.message("caption_engine", state=st))
        if self.args.fin_auto and self.started_once and st["status"] in ("idle", "error"):
            if self.loop:
                self.loop.call_soon_threadsafe(self.loop.call_later, 1.0, self.loop.stop)

    def on_caption(self, c):
        self.write({"type": "caption", "t": time.time(), "caption": c})
        if "gap" in c:
            print(f"[retard] {c['gap']} s d'audio sautées pour revenir au direct", flush=True)
        else:
            print(f"[{c['latency']:4.1f} s] {c['en']}", flush=True)
        self.send(self.message("caption", caption=c))

    def write(self, obj):
        if self.journal:
            self.journal.write(json.dumps(obj, ensure_ascii=False) + "\n")
            self.journal.flush()

    def log(self, text):
        print(text, flush=True)

    # -- boucle -------------------------------------------------------------
    async def heartbeat(self):
        while True:
            await asyncio.sleep(2)
            self.changed()

    async def relay(self):
        from websockets.asyncio.client import connect

        url = self.args.relais
        origin = relay_origin(url)
        warned = False
        while True:
            try:
                async with connect(url, origin=origin, max_size=2**20, open_timeout=5) as ws:
                    self.log("Relié à VerseObs (" + url + ").")
                    warned = False
                    while not self.outbox.empty():  # pas de vieilles lignes au retour
                        self.outbox.get_nowait()
                    await ws.send(json.dumps(self.message("caption_engine", state=self.state())))

                    async def pump():
                        while True:
                            await ws.send(json.dumps(await self.outbox.get()))

                    sender = asyncio.create_task(pump())
                    try:
                        async for raw in ws:
                            try:
                                msg = json.loads(raw)
                            except ValueError:
                                continue
                            if isinstance(msg, dict) and msg.get("type") == "caption_command":
                                self.command(msg)
                    finally:
                        sender.cancel()
            except Exception as exc:
                if not warned:
                    self.log(f"VerseObs injoignable ({exc.__class__.__name__}) : nouvel essai toutes les 2 s.")
                    warned = True
            await asyncio.sleep(2)

    async def main(self):
        self.loop = asyncio.get_running_loop()
        self.outbox = asyncio.Queue(maxsize=0)
        threading.Thread(target=self.load, name="ecoute-chargement", daemon=True).start()
        tasks = [asyncio.create_task(self.heartbeat())]
        if not self.args.sans_relais:
            tasks.append(asyncio.create_task(self.relay()))
        await asyncio.gather(*tasks)


def parse(argv=None):
    p = argparse.ArgumentParser(description="VerseObs Écoute : sous-titres anglais en direct")
    p.add_argument("--relais", default="ws://127.0.0.1:8080/verseobs-relay")
    p.add_argument("--liste", action="store_true", help="lister les entrées audio et quitter")
    p.add_argument("--preparer", action="store_true", help="télécharger les modèles et quitter")
    p.add_argument("--entree", help="numéro ou nom de l'entrée audio (sinon : celle du système)")
    p.add_argument("--fichier", help="simulation : lire ce fichier au rythme du direct")
    p.add_argument("--debut", type=float, default=0.0, help="début de l'extrait (s)")
    p.add_argument("--duree", type=float, default=None, help="durée de l'extrait (s)")
    p.add_argument("--demarrer", action="store_true", help="démarrer l'écoute sans attendre le Studio")
    p.add_argument("--fin-auto", action="store_true", help="quitter à la fin du fichier")
    p.add_argument("--sans-relais", action="store_true", help="ne pas se relier à VerseObs (mesures)")
    p.add_argument("--journal", help="fichier JSONL des légendes et états (mesures)")
    p.add_argument("--modele", default="small", help="modèle Whisper : base, small (défaut), medium…")
    p.add_argument(
        "--threads",
        type=int,
        default=max(2, min(6, (os.cpu_count() or 4) // 2)),
        help="cœurs pour la transcription (défaut : la moitié, 6 au plus)",
    )
    p.add_argument("--threads-traduction", type=int, default=2)
    p.add_argument("--beam", type=int, default=1)
    p.add_argument(
        "--moteur",
        choices=["faster-whisper", "openvino"],
        default="faster-whisper",
        help="openvino : puce graphique Intel (pip install openvino-genai)",
    )
    p.add_argument("--appareil", default="GPU", help="OpenVINO : GPU (Iris Xe) ou CPU")
    p.add_argument("--pause", type=float, default=0.5, help="pause qui termine une phrase (s)")
    p.add_argument("--max-phrase", type=float, default=8.0, help="durée maximale d'une phrase (s)")
    p.add_argument("--traducteur", help="dossier d'un modèle CTranslate2 fr→en (sinon OPUS-MT)")
    p.add_argument("--api-url", help="option : API de traduction compatible OpenAI (https)")
    p.add_argument("--api-modele", default="gpt-4o-mini")
    p.add_argument("--priorite-basse", action="store_true")
    return p.parse_args(argv)


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):  # console Windows : jamais d'arrêt sur un accent
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass
    args = parse(argv)
    if args.liste:
        for d in moteur.list_devices():
            print(f"{d['index']:>3}  {d['name']}  ({d['api']})")
        return
    if args.preparer:
        from faster_whisper.utils import download_model

        print("Whisper " + args.modele + " : " + download_model(args.modele))
        print("Traduction fr→en : " + translator_dir(args.traducteur))
        return
    if not args.sans_relais:
        relay_origin(args.relais)
    service = Service(args)
    try:
        asyncio.run(service.main())
    except (KeyboardInterrupt, RuntimeError):
        pass
    finally:
        if service.engine:
            service.engine.stop()


if __name__ == "__main__":
    main()
