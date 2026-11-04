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
    python ecoute.py --tout-local                  ignorer les clés d'API pour cette séance

Clés d'API (facultatives, enregistrées par configurer-cles.cmd, jamais dans
une page ni un journal) : VERSEOBS_ECOUTE_OPENAI_CLE → transcription par
OpenAI (gpt-transcribe) et traduction par GPT-6.1 Terra (banc 2 du 02/11) ;
VERSEOBS_ECOUTE_ANTHROPIC_CLE → secours de la traduction (Claude Sonnet 5),
seul traducteur payant s'il n'y a pas de clé OpenAI. --traduction claude :
Claude d'abord, GPT-4o mini en secours (ordre du banc 1).
Whisper et OPUS-MT restent chargés en secours et ne calculent rien tant que
l'API répond. Sans clé, tout reste local. Plafond de dépense : aucun par
défaut (--plafond-euros pour en fixer un).
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
        # API payantes (facultatives) : garde-fou, clients, récapitulatif.
        self.budget = None
        self.paid = []  # clients d'API actifs (traduction, transcription)
        self._secrets = []  # seulement pour les masquer dans un texte affiché
        self.cost_journal = None
        self.custom_api = ""  # --api-url (API compatible OpenAI) : modèle déclaré au Studio
        self.recap = ""
        self._was_listening = False
        self.listen_id = secrets.token_hex(12)
        self.verse_finder = None
        self.verse_notice = 'Recherche de versets en préparation.'
        self.verse_default_notice = self.verse_notice
        self.verse_notice_until = 0

    # -- chargement -------------------------------------------------------
    def load(self):
        a = self.args
        try:
            t0 = time.time()
            keys = {} if a.tout_local else {
                name: os.environ.get(var, "").strip() for name, var in moteur.KEY_ENV.items()}
            self._secrets = [k for k in keys.values() if k]
            self.budget = moteur.Depense(a.plafond_euros, a.euros_par_dollar,
                                         on_change=self.changed, journal=self.write_cost)
            if a.moteur == "openvino":
                transcribe = moteur.OpenVinoTranscriber(a.modele, device=a.appareil)
            else:
                transcribe = moteur.Transcriber(a.modele, threads=a.threads, beam=a.beam)
            if keys.get("openai"):  # sinon Whisper reste seul, en local
                transcribe = moteur.OpenAITranscriber(
                    keys["openai"], transcribe, self.budget, model=a.modele_transcription,
                    url=a.url_openai, timeout=a.delai_transcription)
                self.paid.append(transcribe)
            local = moteur.Translator(translator_dir(a.traducteur), threads=a.threads_traduction)
            translate = local
            if a.api_url and not a.tout_local:
                key = os.environ.get("VERSEOBS_ECOUTE_API_CLE", "")
                if not key:
                    raise RuntimeError("VERSEOBS_ECOUTE_API_CLE absente : API de traduction non activée")
                self._secrets.append(key)
                translate = moteur.ApiTranslator(a.api_url, key, a.api_modele, fallback=local)
                self.custom_api = a.api_modele
            elif keys.get("openai") and a.traduction == "gpt":
                # Ordre (banc 2 du 02/11, 4 prédications) : GPT-6.1 Terra → Claude Sonnet 5 → OPUS-MT local.
                secours = local
                if keys.get("anthropic"):
                    secours = moteur.AnthropicTranslator(
                        keys["anthropic"], local, self.budget, model=a.modele_claude,
                        url=a.url_anthropic, timeout=a.delai_api)
                translate = moteur.OpenAIChatTranslator(
                    keys["openai"], secours, self.budget, model=a.modele_gpt,
                    url=a.url_openai_traduction, timeout=a.delai_api)
                self.paid.append(translate)
                if secours is not local:
                    self.paid.append(secours)
            else:
                # --traduction claude (ordre du banc 1, 02/11) : Claude Sonnet 5 → GPT-4o mini → OPUS-MT local.
                secours = local
                if keys.get("openai") and a.secours_openai != "aucun":
                    secours = moteur.OpenAIChatTranslator(
                        keys["openai"], local, self.budget, model=a.secours_openai,
                        url=a.url_openai_traduction, timeout=a.delai_api)
                if keys.get("anthropic"):
                    translate = moteur.AnthropicTranslator(
                        keys["anthropic"], secours, self.budget, model=a.modele_claude,
                        url=a.url_anthropic, timeout=a.delai_api)
                    self.paid.append(translate)
                else:
                    translate = secours
                if secours is not local:
                    self.paid.append(secours)
            verse_key = keys.get('openai') if a.departage_versets else None
            keys = None
            if self.paid:
                parts = []
                tr = next((c for c in self.paid if isinstance(c, moteur.AnthropicTranslator)), None)
                if tr:
                    sec = tr.fallback if isinstance(tr.fallback, moteur.AnthropicTranslator) else None
                    parts.append("traduction " + ("Claude auto (Sonnet 5, Haiku 4.5 si lent)" if tr.auto else
                                                  moteur.display_name(tr.model))
                                 + (f" (secours {moteur.display_name(sec.model)})" if sec else ""))
                parts += ["transcription " + moteur.display_name(c.model)
                          for c in self.paid if isinstance(c, moteur.OpenAITranscriber)]
                self.log("API : " + ", ".join(parts) + " ; Whisper/OPUS-MT en secours." + (
                        "" if self.budget.plafond is None else
                        f" Plafond de dépense : {moteur.euros(self.budget.plafond)}."))
            self.translator_name = translate.name
            self.engine = moteur.Engine(
                transcribe,
                translate,
                self.on_caption,
                self.changed,
                segmenter=lambda: moteur.Segmenter(min_pause=a.pause, max_len=a.max_phrase),
                on_transcript=self.on_transcript,
            )
            if a.sans_versets:
                self.verse_default_notice = 'Recherche de versets désactivée.'
            else:
                # Le démarrage d'Écoute n'attend pas l'index : les sous-titres
                # restent utilisables pendant sa préparation (~20 s sur le VPS).
                threading.Thread(target=self.load_verses, args=(verse_key,), name='versets-chargement', daemon=True).start()
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
            self.load_error = moteur.mask_secrets("Chargement impossible : " + str(exc)[:200], *self._secrets)
            self.log(self.load_error)
        self.ready.set()
        self.changed()
        if self.engine and (self.args.demarrer or self.pending_start is not None):
            self.start(self.pending_start if self.pending_start is not None else self.device)

    def load_verses(self, key=None):
        try:
            from pathlib import Path
            from versets import BibleIndex, Finder, LatestFinder, ModelChooser, StreamFinder
            index = BibleIndex(Path(HERE).parents[1] / 'data')
            chooser = ModelChooser(key, self.budget) if key else None
            self.verse_finder = LatestFinder(StreamFinder(Finder(index, chooser)), self.on_verse, self.verse_warning)
            self.verse_default_notice = (f'{len(index.versions) - len(index.quarantined)} versions disponibles.' +
                (' Crampon exclu : numérotation incohérente.' if index.quarantined else ''))
            if self.engine and self.engine.status == 'listening':
                self.verse_finder.start()
        except Exception:
            self.verse_default_notice = 'Recherche de versets indisponible ; vérifiez les fichiers data/bibles.'
        self.changed()

    # -- commandes ----------------------------------------------------------
    def start(self, device=None, listen_id=None):
        if listen_id:
            self.listen_id = str(listen_id)[:80]
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
        if self.verse_finder:
            self.verse_finder.start()
        self.engine.start(source)

    def stop(self):
        if self.verse_finder:
            self.verse_finder.stop()
        if self.engine:
            self.engine.stop()
            self.log("Écoute arrêtée.")

    def command(self, msg):
        action = msg.get("action")
        if action == "start":
            device = msg.get("device")
            self.start(device if isinstance(device, int) else None, msg.get("listenId"))
        elif action == "stop":
            self.listen_id = secrets.token_hex(12)
            self.stop()

    # -- état et publication ------------------------------------------------
    def state(self):
        e = self.engine
        status = "loading" if not self.ready.is_set() else (e.status if e else "error")
        error = moteur.mask_secrets(self.load_error if not e else (e.error or ""), *self._secrets)
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
            "api": self.api_state(),
            "listenId": self.listen_id,
            "verses": self.verse_notice if time.monotonic() < self.verse_notice_until else self.verse_default_notice,
            "verseReady": bool(self.verse_finder and self.verse_finder.thread.is_alive()),
        }

    def api_state(self):
        """Ce que le Studio montre des API payantes : modèles, coût estimé, repli."""
        b = self.budget
        tr = next((c for c in self.paid if isinstance(c, moteur.AnthropicTranslator)), None)
        asr = next((c for c in self.paid if isinstance(c, moteur.OpenAITranscriber)), None)
        notices = [b.notice()] if b and b.capped else [c.garde.notice for c in self.paid if c.garde.notice]
        # Pas de coût dans le Studio (décision de Math, 01/11) : il reste au journal.
        return {
            "translation": (moteur.display_name(tr.model) if tr else
                            ("API " + self.custom_api if self.custom_api else "")),
            "transcription": moteur.display_name(asr.model) if asr else "",
            "capped": bool(b and b.capped),
            "notice": moteur.mask_secrets(" ".join(notices), *self._secrets)[:200],
        }

    def finish_session(self):
        """Fin de séance (arrêt, fin de fichier, sortie) : récapitulatif des dépenses."""
        if not self.paid or not self.budget:
            return
        self.recap = "Dernière écoute : " + self.budget.recap_text()
        self.write_cost(dict({"type": "api_recapitulatif", "t": time.time(), "texte": self.recap},
                             **self.budget.recap()))
        where = self.args.journal or (self.cost_journal.name if self.cost_journal else "")
        self.log("Fin d'écoute : récapitulatif des appels d'API noté dans " + where)

    def message(self, kind, **extra):
        self.n += 1
        return dict(type=kind, id=f"ecoute-{self.boot}-{self.n}", ts=int(time.time() * 1000), **extra)

    def _in_loop(self, fn, *args):
        """Programme fn dans la boucle du service ; rien si elle est déjà fermée (arrêt)."""
        loop = self.loop
        if not loop or loop.is_closed():
            return False
        try:
            loop.call_soon_threadsafe(fn, *args)
            return True
        except RuntimeError:  # fermée entre-temps : le service s'arrête
            return False

    def send(self, msg):
        if self.outbox is not None:
            self._in_loop(self.outbox.put_nowait, msg)

    def changed(self):
        listening = bool(self.engine and self.engine.status in ("listening", "stopping"))
        if self.verse_finder and self.engine and self.engine.status != 'listening':
            self.verse_finder.stop()
        if self._was_listening and not listening:
            self.finish_session()
        self._was_listening = listening
        st = self.state()
        self.write({"type": "state", "t": time.time(), "state": st})
        self.send(self.message("caption_engine", state=st))
        if self.args.fin_auto and self.started_once and st["status"] in ("idle", "error") and self.loop:
            self._in_loop(self.loop.call_later, 1.0, self.loop.stop)

    def verse_warning(self, message):
        self.verse_notice = message
        self.verse_notice_until = time.monotonic() + 10
        self.changed()

    def on_transcript(self, event):
        if self.verse_finder and self.engine and self.engine.status == 'listening':
            try:
                self.verse_finder.submit(dict(event, listenId=self.listen_id))
            except Exception:
                self.verse_notice = 'Recherche de versets indisponible ; les sous-titres continuent.'
                self.verse_notice_until = time.monotonic() + 10

    def on_verse(self, proposal):
        if self.engine and self.engine.status == 'listening' and proposal.get('listenId') == self.listen_id:
            self.write({'type': 'heard_verse', 'proposal': proposal})
            self.send(self.message('heard_verse', proposal=proposal))

    def on_caption(self, c):
        if 'gap' in c and self.verse_finder:
            self.verse_finder.stop()
            if self.engine and self.engine.status == 'listening':
                self.verse_finder.start()
        self.write({"type": "caption", "t": time.time(), "caption": c})
        if self.paid and not self.journal and "latency" in c and c.get("unit", 1) == 1:
            # Latence de chaque phrase (sans son texte) : choisir le modèle après le culte.
            tr = next((x for x in self.paid if isinstance(x, moteur.AnthropicTranslator)), None)
            self.write_cost({"type": "phrase", "t": time.time(), "latence_s": c.get("latency"),
                             "transcription_s": c.get("asr"), "traduction_s": c.get("mt"),
                             "audio_s": c.get("audio"), "modele_traduction": tr.model if tr else "local",
                             "transcription": self.asr_name})
        if "gap" in c:
            print(f"[retard] {c['gap']} s d'audio sautées pour revenir au direct", flush=True)
        else:
            print(f"[{c['latency']:4.1f} s] {c['en']}", flush=True)
        self.send(self.message("caption", caption=c))

    def write(self, obj):
        if self.journal:
            self.journal.write(json.dumps(obj, ensure_ascii=False) + "\n")
            self.journal.flush()

    def write_cost(self, obj):
        """Appels d'API (coût estimé, latences) : dans --journal s'il existe, sinon journaux/api-<date>.jsonl."""
        if self.journal:
            return self.write(obj)
        try:
            if self.cost_journal is None:
                folder = os.path.join(HERE, "journaux")
                os.makedirs(folder, exist_ok=True)
                name = time.strftime("api-%Y%m%d-%H%M%S.jsonl")
                self.cost_journal = open(os.path.join(folder, name), "a", encoding="utf-8")
            self.cost_journal.write(json.dumps(obj, ensure_ascii=False) + "\n")
            self.cost_journal.flush()
        except OSError:
            pass

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
    p.add_argument("--sans-versets", action="store_true", help="désactiver les propositions de versets")
    p.add_argument("--departage-versets", action="store_true", help="autoriser GPT-6.1 Terra à départager les candidats ambigus (clé OpenAI existante, délai 1,5 s ; désactivé par défaut)")
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
    p.add_argument("--tout-local", action="store_true",
                   help="ignorer les clés d'API pour cette séance : Whisper et OPUS-MT seulement")
    p.add_argument("--plafond-euros", type=float, default=None,
                   help="dépense estimée maximale par séance (aucune par défaut) ; au-delà, tout en local")
    p.add_argument("--euros-par-dollar", type=float, default=1.0,
                   help="conversion des prix en dollars (défaut 1 : 1 $ compté 1 €, estimation majorée)")
    p.add_argument("--modele-claude", default=moteur.ANTHROPIC_MODEL,
                   help="claude-sonnet-5 (défaut, mieux noté au banc du 02/11), claude-haiku-4-5 "
                        "(plus rapide) ou auto (Sonnet 5, Haiku 4.5 si la médiane dépasse 1,5 s)")
    p.add_argument("--secours-openai", default=moteur.OPENAI_SECOURS_MODEL,
                   help="traduction de secours par OpenAI si Claude tombe (défaut gpt-4o-mini ; "
                        "« aucun » : OPUS-MT directement) ; seule traduction payante sans clé Anthropic")
    p.add_argument("--traduction", choices=("gpt", "claude"), default="gpt",
                   help="qui traduit en premier quand la clé OpenAI existe : gpt (défaut, banc 2 du 02/11 : "
                        "GPT-6.1 Terra, secours Claude) ou claude (Claude, secours GPT-4o mini)")
    p.add_argument("--modele-gpt", default=moteur.OPENAI_TRADUCTION_MODEL,
                   help="modèle GPT qui traduit en premier (défaut gpt-6.1-terra)")
    p.add_argument("--modele-transcription", default=moteur.OPENAI_TRANSCRIBE_MODEL)
    p.add_argument("--delai-api", type=float, default=4.0, help="délai maximal d'une traduction par Claude (s)")
    p.add_argument("--delai-transcription", type=float, default=8.0,
                   help="délai maximal d'une transcription par OpenAI (s)")
    p.add_argument("--url-anthropic", default=moteur.ANTHROPIC_URL, help=argparse.SUPPRESS)
    p.add_argument("--url-openai", default=moteur.OPENAI_TRANSCRIBE_URL, help=argparse.SUPPRESS)
    p.add_argument("--url-openai-traduction", default=moteur.OPENAI_CHAT_URL, help=argparse.SUPPRESS)
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
        if service._was_listening:
            service.finish_session()


if __name__ == "__main__":
    main()
