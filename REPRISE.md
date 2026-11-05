# Reprise — voix anglaise

Branche `v293-voix`, base `0d36b39` (BUILD 2.92). Aucun push ni installation PC. Ne pas modifier BUILD, les `?v=`, remote.html ou les lanceurs Mac. Historique Verset entendu conservé dans la base Git.

- [x] Worktree isolé créé, dépendances Node liées au canonique.
- [x] Lecture service/relais/Studio ; documentation officielle TTS et Piper consultée.
- [x] Tests rouges puis module voix, file bornée, sortie audio et repli.
- [x] Intégration des segments finals, commandes et état Studio/relais.
- [x] Tests HTTP factice, cycle main, secrets et mutant.
- [x] Latences/coût sourcés, démo Piper réelle du 11/10 : 72,969 s.
- [x] Documentation ; npm run check et npm test verts ; pytest : 115 tests + 105 sous-tests verts.
- [x] Une relecture Astra/Sol : REQUEST_CHANGES initiaux, blocages reproduits puis corrigés ; aucun second tour.
- [x] Commit identité MathieuMvondoMvondo ; rapport et preuves avec limites, sans push.

Choix : gpt-realtime-2.1-mini (doc TTS officielle actuelle ; gpt-4o-mini-tts déprécié),
Piper ljspeech-medium préchauffé, SAPI/say si modèle absent. Aucune clé générique.
Mesures : `artifacts/voix/mesures.json`, PortAudio réelle sur ALSA virtuelle
`artifacts/voix/portaudio-apres-relecture.log`, Chromium `artifacts/voix/browser-resultat.json`.
Pas d'essai acoustique Windows/macOS ni d'appel OpenAI réel ; à répéter au casque avant le culte.
