"""Tests des API payantes de l'écoute (Claude, transcription OpenAI) : serveur
local simulé, fausses clés. Aucun appel réseau réel, aucun modèle chargé.

    python -m unittest discover -s tools/ecoute -p "test_*.py"
"""

import contextlib
import http.server
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ecoute  # noqa: E402
import moteur  # noqa: E402

# Fausses clés des fixtures : jamais de vraie clé dans le dépôt.
FAKE_ANTHROPIC = "sk-ant-FAUSSE-CLE-DE-TEST-pas-une-vraie-0000"
FAKE_OPENAI = "sk-FAUSSE-CLE-OPENAI-DE-TEST-0000"
FAKES = (FAKE_ANTHROPIC, FAKE_OPENAI)


class FakeApi:
    """Serveur HTTP local : répond selon un plan, garde chaque requête."""

    def __init__(self):
        self.plan = []  # (statut, corps, délai) ; le dernier se répète
        self.requests = []
        api = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                api.requests.append({"path": self.path, "headers": dict(self.headers), "body": body})
                status, payload, delay = api.plan.pop(0) if len(api.plan) > 1 else api.plan[0]
                if delay:
                    time.sleep(delay)
                data = json.dumps(payload).encode()
                try:
                    self.send_response(status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except OSError:
                    pass

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def claude_ok(text="For God so loved the world.", tin=100, tout=10):
    return (200, {"content": [{"type": "text", "text": text}],
                  "usage": {"input_tokens": tin, "output_tokens": tout}}, 0)


def local_mt(text):
    return "LOCAL: " + text


class ApiCase(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi()
        self.costs = []
        self.budget = moteur.Depense(None, 1.0, journal=self.costs.append)
        self.out = io.StringIO()
        self._redirect = contextlib.redirect_stdout(self.out)
        self._redirect.__enter__()

    def tearDown(self):
        self._redirect.__exit__(None, None, None)
        self.api.close()

    def claude(self, **kw):
        return moteur.AnthropicTranslator(FAKE_ANTHROPIC, local_mt, self.budget,
                                          url=self.api.base + "/v1/messages", **kw)

    def assertNoKey(self, *texts):
        for t in texts:
            for k in FAKES:
                self.assertNotIn(k, str(t))


class TestModeles(unittest.TestCase):
    def test_noms_et_prix_verifies(self):
        self.assertEqual(moteur.ANTHROPIC_MODEL, "auto")
        self.assertEqual(moteur.CLAUDE_SONNET, "claude-sonnet-5")
        self.assertEqual(moteur.CLAUDE_HAIKU, "claude-haiku-4-5-20251001")
        self.assertEqual(moteur.price_for(moteur.ANTHROPIC_PRICES, moteur.CLAUDE_HAIKU), (1.0, 5.0))
        self.assertEqual(moteur.price_for(moteur.ANTHROPIC_PRICES, moteur.CLAUDE_SONNET), (2.0, 10.0))
        self.assertEqual(moteur.SLOW_CLAUDE, 1.5)
        self.assertIsNone(moteur.Depense().plafond)  # aucun plafond par défaut
        self.assertIsNone(ecoute.parse([]).plafond_euros)
        self.assertEqual(moteur.OPENAI_TRANSCRIBE_MODEL, "gpt-transcribe")
        self.assertEqual(moteur.price_for(moteur.OPENAI_TRANSCRIBE_PRICES, "gpt-transcribe"), 0.0045)
        self.assertEqual(moteur.ANTHROPIC_VERSION, "2023-06-01")
        # Variables propres à VerseObs : jamais celles de Claude Code ou de Codex.
        self.assertEqual(set(moteur.KEY_ENV.values()),
                         {"VERSEOBS_ECOUTE_ANTHROPIC_CLE", "VERSEOBS_ECOUTE_OPENAI_CLE"})

    def test_masquage(self):
        text = f"refus {FAKE_ANTHROPIC} et Bearer {FAKE_OPENAI} puis sk-proj-abcdefghijklmnop"
        masked = moteur.mask_secrets(text, FAKE_ANTHROPIC)
        for k in FAKES + ("sk-proj-abcdefghijklmnop",):
            self.assertNotIn(k, masked)


class TestClaude(ApiCase):
    def test_en_tetes_corps_contexte_et_cout(self):
        self.api.plan = [claude_ok()]
        tr = self.claude()
        self.assertEqual(tr("Car Dieu a tant aimé le monde."), "For God so loved the world.")
        req = self.api.requests[0]
        h = {k.lower(): v for k, v in req["headers"].items()}
        self.assertEqual(req["path"], "/v1/messages")
        self.assertEqual(h["x-api-key"], FAKE_ANTHROPIC)
        self.assertEqual(h["anthropic-version"], "2023-06-01")
        self.assertNotIn("authorization", h)
        body = json.loads(req["body"])
        self.assertEqual(body["model"], "claude-sonnet-5")  # auto : Sonnet d'abord
        self.assertEqual(body["output_config"], {"effort": "low"})
        self.assertNotIn("temperature", body)  # refusé par l'API 2026-10-21
        self.assertIn("Car Dieu a tant aimé le monde.", body["messages"][0]["content"])
        self.assertAlmostEqual(self.budget.usd, (100 * 2 + 10 * 10) / 1e6)
        self.assertEqual(self.costs[-1]["type"], "api_cout")
        self.assertEqual(self.costs[-1]["jetons_entree"], 100)
        # Phrase suivante : le contexte court accompagne la demande, 3 paires au plus.
        for i in range(4):
            tr(f"Phrase {i}.")
        last = json.loads(self.api.requests[-1]["body"])["messages"][0]["content"]
        self.assertIn("FR: Phrase 2.", last)
        self.assertNotIn("FR: Car Dieu", last)
        self.assertEqual(last.count("FR: "), 3)
        self.assertNoKey(repr(tr), self.costs, self.out.getvalue())

    def test_erreur_passagere_puis_pause_d_une_minute(self):
        self.api.plan = [(500, {"error": {"type": "api_error"}}, 0)]
        tr = self.claude()
        self.assertEqual(tr("Un."), "LOCAL: Un.")
        self.assertEqual(len(self.api.requests), 1)
        self.assertIn("HTTP 500", tr.garde.notice)
        self.assertEqual(tr("Deux."), "LOCAL: Deux.")  # 2e panne de suite : pause
        self.assertEqual(tr("Trois."), "LOCAL: Trois.")
        self.assertEqual(len(self.api.requests), 2)
        self.assertIn("1 min", tr.garde.notice)
        self.assertEqual(self.budget.usd, 0.0)  # une erreur HTTP n'est pas facturée

    def test_quota_429_et_surcharge_529(self):
        for status in (429, 529):
            self.api.requests.clear()
            self.api.plan = [(status, {"error": {"type": "rate_limit_error"}}, 0)]
            tr = self.claude()
            self.assertEqual(tr("Un."), "LOCAL: Un.")
            if status == 429:  # quota : pause immédiate
                self.assertEqual(tr("Deux."), "LOCAL: Deux.")
                self.assertEqual(len(self.api.requests), 1)

    def test_delai_depasse_compte_une_estimation(self):
        self.api.plan = [(200, claude_ok()[1], 1.0)]
        tr = self.claude(timeout=0.3)
        t0 = time.time()
        self.assertEqual(tr("Lent."), "LOCAL: Lent.")
        self.assertLess(time.time() - t0, 0.9)
        self.assertIn("délai dépassé", tr.garde.notice)
        self.assertGreater(self.budget.usd, 0)  # parti sans réponse : compté, prudemment
        self.assertTrue(self.costs[-1]["estime"])

    def test_cle_refusee_local_jusqu_a_la_fin_et_jamais_affichee(self):
        # Même si le serveur renvoie la clé dans son message, rien ne la répète.
        self.api.plan = [(401, {"error": {"type": "authentication_error",
                                          "message": "invalid x-api-key " + FAKE_ANTHROPIC}}, 0)]
        tr = self.claude()
        self.assertEqual(tr("Un."), "LOCAL: Un.")
        self.assertEqual(tr("Deux."), "LOCAL: Deux.")
        self.assertEqual(len(self.api.requests), 1)
        self.assertIn("HTTP 401 authentication_error", tr.garde.notice)
        self.assertIn("fin de la séance", tr.garde.notice)
        self.assertNoKey(tr.garde.notice, self.out.getvalue(), self.costs)

    def test_auto_sonnet_puis_haiku_si_la_mediane_est_lente(self):
        self.api.plan = [(200, claude_ok()[1], 0.25)]
        tr = self.claude(slow=0.2)
        for i in range(4):
            tr(f"Phrase {i}.")
        self.assertEqual(tr.model, "claude-sonnet-5")
        tr("Phrase 4.")  # 5e mesure : médiane 0,25 s > 0,2 s
        self.assertEqual(tr.model, "claude-haiku-4-5-20251001")
        switch = [c for c in self.costs if c["type"] == "api_modele"]
        self.assertEqual(switch[0]["vers"], "claude-haiku-4-5-20251001")
        tr("Phrase 5.")
        body = json.loads(self.api.requests[-1]["body"])
        self.assertEqual(body["model"], "claude-haiku-4-5-20251001")
        self.assertNotIn("output_config", body)  # Haiku 4.5 : effort non pris en charge
        self.assertTrue(all("duree_s" in c for c in self.costs if c["type"] == "api_cout"))

    def test_auto_rapide_reste_sur_sonnet_et_modele_impose(self):
        self.api.plan = [claude_ok()]
        tr = self.claude(slow=5.0)
        for i in range(7):
            tr(f"Phrase {i}.")
        self.assertEqual(tr.model, "claude-sonnet-5")
        fixed = self.claude(model="claude-haiku-4-5-20251001", slow=0.0)
        for i in range(6):
            fixed(f"Phrase {i}.")
        self.assertEqual(fixed.model, "claude-haiku-4-5-20251001")
        self.assertNotIn("output_config", json.loads(self.api.requests[-1]["body"]))

    def test_sonnet_refuse_haiku_prend_la_suite(self):
        self.api.plan = [(404, {"error": {"type": "not_found_error"}}, 0), claude_ok("Hello.")]
        tr = self.claude()
        self.assertEqual(tr("Un."), "LOCAL: Un.")
        self.assertEqual(tr.model, "claude-haiku-4-5-20251001")
        self.assertEqual(tr("Deux."), "Hello.")
        self.assertFalse(tr.garde.off)

    def test_effort_refuse_renvoye_sans_effort(self):
        self.api.plan = [(400, {"error": {"type": "invalid_request_error"}}, 0), claude_ok("Hello.")]
        tr = self.claude(model="claude-sonnet-5")
        self.assertEqual(tr("Un."), "Hello.")
        self.assertIn("output_config", json.loads(self.api.requests[0]["body"]))
        self.assertNotIn("output_config", json.loads(self.api.requests[1]["body"]))
        self.assertFalse(tr.effort_ok)

    def test_reponse_illisible_ou_vide(self):
        self.api.plan = [(200, {"content": []}, 0)]
        tr = self.claude()
        self.assertEqual(tr("Un."), "LOCAL: Un.")

    def test_plafond_de_depense(self):
        tr = self.claude()
        text = "Car Dieu a tant aimé le monde."
        first = tr._cost((len(tr.SYSTEM) + len(tr._prompt(text))) / 3 + 20,
                         min(tr.max_tokens, len(text) / 2.5 + 30))
        self.budget = moteur.Depense(first * 1.01, 1.0, journal=self.costs.append)
        tr.budget = tr.garde.budget = self.budget
        self.api.plan = [claude_ok()]
        self.assertEqual(tr(text), "For God so loved the world.")
        self.assertEqual(tr("Deuxième phrase."), "LOCAL: Deuxième phrase.")
        self.assertEqual(tr("Troisième."), "LOCAL: Troisième.")
        self.assertEqual(len(self.api.requests), 1)  # plus aucun appel payant
        self.assertTrue(self.budget.capped)
        self.assertLessEqual(self.budget.eur, self.budget.plafond)
        self.assertIn("Plafond", self.budget.notice())
        self.assertNotIn("€", self.budget.notice())  # aucun montant affiché
        self.assertEqual(self.costs[-1]["type"], "api_plafond")
        recap = self.budget.recap()
        self.assertEqual(recap["appels_claude"], 1)
        self.assertTrue(recap["plafond_atteint"])
        self.assertEqual(recap["phrases_en_local"], 2)


class TestTranscriptionOpenAI(ApiCase):
    def asr(self, **kw):
        return moteur.OpenAITranscriber(FAKE_OPENAI, lambda a: "local fr", self.budget,
                                        url=self.api.base + "/v1/audio/transcriptions", **kw)

    def test_multipart_cle_et_cout_a_la_minute(self):
        self.api.plan = [(200, {"text": "Car Dieu a tant aimé le monde."}, 0)]
        asr = self.asr()
        audio = np.zeros(int(2.5 * moteur.SR), np.float32)
        self.assertEqual(asr(audio), "Car Dieu a tant aimé le monde.")
        req = self.api.requests[0]
        h = {k.lower(): v for k, v in req["headers"].items()}
        self.assertEqual(h["authorization"], "Bearer " + FAKE_OPENAI)
        self.assertTrue(h["content-type"].startswith("multipart/form-data; boundary="))
        body = req["body"]
        self.assertIn(b'name="model"\r\n\r\ngpt-transcribe\r\n', body)
        self.assertIn(b'name="language"\r\n\r\nfr\r\n', body)
        self.assertIn(b'filename="phrase.wav"', body)
        self.assertIn(b"RIFF", body)
        self.assertAlmostEqual(self.budget.usd, 3 / 60 * 0.0045)  # 2,5 s comptées 3 s
        self.assertEqual(self.costs[-1]["audio_s"], 2.5)
        # La phrase suivante reçoit la précédente comme contexte (prompt).
        asr(audio)
        self.assertIn("Car Dieu a tant aim".encode(), self.api.requests[1]["body"])

    def test_panne_whisper_local(self):
        self.api.plan = [(503, {"error": {"type": "server_error"}}, 0)]
        asr = self.asr()
        self.assertEqual(asr(np.zeros(moteur.SR, np.float32)), "local fr")
        self.assertIn("HTTP 503", asr.garde.notice)

    def test_silence_sans_texte_ne_bascule_pas(self):
        self.api.plan = [(200, {"text": ""}, 0)]
        asr = self.asr()
        self.assertEqual(asr(np.zeros(moteur.SR, np.float32)), "")
        self.assertEqual(asr.garde.notice, "")


class FakeLocalAsr:
    name = "whisper-test"

    def __init__(self, *a, **k):
        pass

    def __call__(self, audio):
        return "texte local"


class FakeLocalMt:
    def __init__(self, *a, **k):
        self.name = "opus-test"

    def __call__(self, text):
        return "local: " + text


@contextlib.contextmanager
def service_with(env, argv, api):
    with tempfile.TemporaryDirectory() as tmp, \
            mock.patch.dict(os.environ, env, clear=False), \
            mock.patch.object(moteur, "Transcriber", FakeLocalAsr), \
            mock.patch.object(moteur, "Translator", FakeLocalMt), \
            mock.patch.object(moteur, "list_devices", lambda: []), \
            mock.patch.object(ecoute, "translator_dir", lambda arg: tmp):
        for var in moteur.KEY_ENV.values():
            if var not in env:
                os.environ.pop(var, None)
        journal = os.path.join(tmp, "journal.jsonl")
        args = ecoute.parse(["--sans-relais", "--journal", journal,
                             "--url-anthropic", api.base + "/v1/messages",
                             "--url-openai", api.base + "/v1/audio/transcriptions"] + argv)
        service = ecoute.Service(args)
        sent = []
        service.send = sent.append
        service.load()
        try:
            yield service, sent, journal
        finally:
            if service.journal:
                service.journal.close()


class TestServiceSansFuite(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi()

    def tearDown(self):
        self.api.close()

    def test_cles_absentes_partout(self):
        env = {"VERSEOBS_ECOUTE_ANTHROPIC_CLE": FAKE_ANTHROPIC, "VERSEOBS_ECOUTE_OPENAI_CLE": FAKE_OPENAI}
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out), \
                service_with(env, [], self.api) as (service, sent, journal):
            self.assertEqual(len(service.paid), 2)
            # transcription puis traduction réussies, puis clé refusée qui « renvoie » la clé
            self.api.plan = [(200, {"text": "Car Dieu a tant aimé le monde."}, 0)]
            fr = service.engine.transcribe(np.zeros(moteur.SR, np.float32))
            self.api.plan = [claude_ok()]
            en = service.engine.translate(fr)
            self.assertEqual(en, "For God so loved the world.")
            self.api.plan = [(401, {"error": {"type": "authentication_error",
                                              "message": "bad key " + FAKE_ANTHROPIC + " " + FAKE_OPENAI}}, 0)]
            service.engine.translate("Deuxième phrase.")
            service.engine.transcribe(np.zeros(moteur.SR, np.float32))
            service.on_caption({"seq": 1, "fr": fr, "en": en, "latency": 1.0})
            service.changed()
            state = service.state()
            service._was_listening = True
            service.finish_session()
            with open(journal, encoding="utf-8") as f:
                journal_text = f.read()
        api = state["api"]
        self.assertEqual(api["translation"], "Claude Sonnet 5")
        self.assertEqual(api["transcription"], "OpenAI gpt-transcribe")
        self.assertEqual(sorted(api), ["capped", "notice", "transcription", "translation"])  # aucun coût
        self.assertGreater(service.budget.usd, 0)
        self.assertIn("HTTP 401", api["notice"])
        self.assertIn("api_cout", journal_text)
        self.assertIn("api_recapitulatif", journal_text)
        self.assertIn("estimés", service.recap)
        for k in FAKES:
            self.assertNotIn(k, journal_text)
            self.assertNotIn(k, out.getvalue())
            self.assertNotIn(k, json.dumps(state, ensure_ascii=False))
            self.assertNotIn(k, json.dumps(sent, ensure_ascii=False))
            self.assertNotIn(k, repr(service.paid))

    def test_journal_api_par_defaut_latence_de_chaque_phrase(self):
        env = {"VERSEOBS_ECOUTE_ANTHROPIC_CLE": FAKE_ANTHROPIC}
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()), \
                mock.patch.object(ecoute, "HERE", tmp), mock.patch.dict(os.environ, env), \
                mock.patch.object(moteur, "Transcriber", FakeLocalAsr), \
                mock.patch.object(moteur, "Translator", FakeLocalMt), \
                mock.patch.object(moteur, "list_devices", lambda: []), \
                mock.patch.object(ecoute, "translator_dir", lambda arg: tmp):
            os.environ.pop("VERSEOBS_ECOUTE_OPENAI_CLE", None)
            args = ecoute.parse(["--sans-relais", "--url-anthropic", self.api.base + "/v1/messages"])
            service = ecoute.Service(args)
            service.send = lambda m: None
            service.load()
            self.api.plan = [claude_ok()]
            en = service.engine.translate("Car Dieu a tant aimé le monde.")
            service.on_caption({"seq": 1, "fr": "Car Dieu…", "en": en, "unit": 1, "latency": 2.4,
                                "asr": 1.1, "mt": 0.9, "audio": 3.2})
            service._was_listening = True
            service.finish_session()
            service.cost_journal.close()
            files = os.listdir(os.path.join(tmp, "journaux"))
            with open(os.path.join(tmp, "journaux", files[0]), encoding="utf-8") as f:
                rows = [json.loads(line) for line in f]
        self.assertTrue(files[0].startswith("api-"))
        kinds = [r["type"] for r in rows]
        self.assertEqual(kinds, ["api_cout", "phrase", "api_recapitulatif"])
        self.assertEqual(rows[1]["latence_s"], 2.4)
        self.assertEqual(rows[1]["modele_traduction"], "claude-sonnet-5")
        self.assertNotIn("fr", rows[1])  # journal discret : pas le texte de la prédication
        for k in FAKES:
            self.assertNotIn(k, json.dumps(rows))

    def test_sans_cle_tout_local(self):
        with contextlib.redirect_stdout(io.StringIO()), service_with({}, [], self.api) as (service, sent, journal):
            self.assertEqual(service.paid, [])
            self.assertEqual(service.engine.translate("Bonjour."), "local: Bonjour.")
            api = service.state()["api"]
        self.assertEqual((api["translation"], api["transcription"]), ("", ""))
        self.assertEqual(self.api.requests, [])

    def test_tout_local_ignore_les_cles(self):
        env = {"VERSEOBS_ECOUTE_ANTHROPIC_CLE": FAKE_ANTHROPIC, "VERSEOBS_ECOUTE_OPENAI_CLE": FAKE_OPENAI}
        with contextlib.redirect_stdout(io.StringIO()), \
                service_with(env, ["--tout-local"], self.api) as (service, sent, journal):
            self.assertEqual(service.paid, [])
            self.assertEqual(service.engine.translate("Bonjour."), "local: Bonjour.")
        self.assertEqual(self.api.requests, [])

    def test_openai_seulement_si_sa_cle_existe(self):
        env = {"VERSEOBS_ECOUTE_ANTHROPIC_CLE": FAKE_ANTHROPIC}
        with contextlib.redirect_stdout(io.StringIO()), service_with(env, [], self.api) as (service, sent, journal):
            kinds = sorted(type(c).__name__ for c in service.paid)
            self.assertEqual(kinds, ["AnthropicTranslator"])
            self.assertIsInstance(service.engine.transcribe, FakeLocalAsr)


class TestScriptsEtDepot(unittest.TestCase):
    def test_configurer_cles_saisie_masquee_setx(self):
        with open(os.path.join(HERE, "configurer-cles.cmd"), "rb") as f:
            raw = f.read()
        text = raw.decode("utf-8")
        self.assertEqual(raw.count(b"\n"), raw.count(b"\r\n"), "fins de ligne Windows")
        self.assertEqual(text.count("-AsSecureString"), 2)
        self.assertIn("setx VERSEOBS_ECOUTE_ANTHROPIC_CLE $p > $null", text)
        self.assertIn("setx VERSEOBS_ECOUTE_OPENAI_CLE $p > $null", text)
        self.assertEqual(text.count("echo clé enregistrée"), 2)
        self.assertIn("ZeroFreeBSTR", text)
        # La clé n'est jamais affichée ni écrite dans un fichier.
        for bad in ("Write-Host $p", "Write-Output $p", "echo $p", "Out-File", "Set-Content",
                    "Add-Content", "%VERSEOBS_ECOUTE", "Get-Clipboard"):
            self.assertNotIn(bad, text)
        with open(os.path.join(HERE, "lancer-ecoute.cmd"), encoding="utf-8") as f:
            launcher = f.read()
        self.assertNotIn("CLE", launcher.upper().replace("CLES", ""))

    def test_aucune_vraie_cle_dans_le_depot(self):
        root = os.path.dirname(os.path.dirname(HERE))
        try:
            files = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True,
                                   check=True).stdout.decode().split("\0")
        except (OSError, subprocess.CalledProcessError):
            self.skipTest("pas un dépôt git")
        real = re.compile(rb"sk-ant-(?:api|admin)\d\d-[A-Za-z0-9_\-]{20,}|sk-(?:proj|svcacct)-[A-Za-z0-9_\-]{20,}"
                          rb"|\bsk-[A-Za-z0-9]{40,}")
        hits = []
        for name in filter(None, files):
            path = os.path.join(root, name)
            if not os.path.isfile(path) or os.path.getsize(path) > 5_000_000:
                continue
            with open(path, "rb") as f:
                if real.search(f.read()):
                    hits.append(name)
        self.assertEqual(hits, [])


if __name__ == "__main__":
    unittest.main()
