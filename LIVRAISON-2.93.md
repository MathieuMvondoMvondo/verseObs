# Livraison locale — VerseObs 2.93 intégrée

Branche `release-20261105`, worktree `/home/ubuntu/work/verseobs-release-20261105`.
Base publiée `0d36b39` (2.92), parents intégrés `278a5b8` et `51daadb`.
Aucun push, publication ni installation sur les machines de Math. Auteur et committer : MathieuMvondoMvondo.
Le code produit final est validé au commit `272c064` ; les commits de clôture ne changent que ces notes.
Le SHA exact livré figure dans chaque `Application/manifest-livraison.json` et `artifacts/livraison-2.93/verification.json`.

## Ce qui change

- Télécommande : livre/recherche, chapitre, verset/plage, lecture dans la version active et préparation de l’aperçu régie, **sans diffusion automatique**, même avec Enchaîner et bilingue retardé.
- Mac Intel/Apple Silicon et Windows x64 : Installer/Lancer par double-clic, Node/Python autonomes vérifiés, arrêt coordonné serveur/Écoute. Aucun prérequis Python/Node/Git à faire installer au bénévole.
- Voix anglaise facultative : sortie casque/OBS explicite, nom exact en CLI, index+nom dans le Studio et identité revérifiée avant ouverture. Piper local, API OpenAI facultative, aucun haut-parleur implicite.
- Installateurs : Piper 1.4.2 et modèle anglais ONNX/JSON/fiche de licence ajoutés, SHA-256 vérifiés **avant** installation, préchauffage sans son. Mise à jour de `websockets>=15` incluse.
- Panne audio confinée : un fil matériel privé, attentes 1,5 s, verrouillage de la voix après pilote figé ; sous-titres/état/arrêt restent utilisables. Aucun deuxième écrivain matériel en parallèle.
- Realtime réutilisé sans historique, repli local stabilisé après deux échecs parmi cinq, grâce relais 10 s et alerte rouge. Publication bornée à 64 messages, sans stockage hors connexion ; premier son périmé refusé.
- BUILD et 47 URL de cache alignés à **2.93**.

## Livrables

- `artifacts/livraison-2.93/VerseObs-2.93-Mac.zip`
- `artifacts/livraison-2.93/VerseObs-2.93-Windows.zip`
- `artifacts/livraison-2.93/SHA256SUMS.txt` et `verification.json`
- Guides d’une page, rendus et inspectés : `tools/distribution/GUIDE-MAC.pdf`, `GUIDE-WINDOWS.pdf`, également au premier niveau des zips.
- Résumé opérateur et commande de publication **non exécutée**, avec garde de base/avance rapide/repère de retour : `A-MONTRER-A-MATH.md` (10 lignes).

## Tests réellement exécutés

| Commande / scénario | Résultat |
|---|---|
| `npm run check` | code 0 |
| `npm test` | code 0 ; socle, Studio, captions, heard, télécommande, arrêt CLI et voix |
| Python du banc : `-m pytest tools/ecoute -q` | **133 tests + 105 sous-tests réussis** sur le produit final |
| `python3 tests/distribution.py` | 6 tests, OK ; altération de chaque composant voix refusée avant pip |
| `pwsh -NoProfile -File tests/distribution-windows.ps1` | code 0, empreintes et parseur ; ce n’est pas WinForms exécuté sur Windows |
| ShellCheck des .command et installer-mac.sh | code 0 |
| `node tests/browser-remote-bible.mjs` | code 0, appairage, tactile, non-diffusion et bilingue retardé |
| `node tests/browser-studio.mjs` | **72/72**, code 0 |
| Chromium motion, dock, heard, captions, voix ; Studio paired/habillages/onglet | tous codes 0 ; voix/sous-titres/verset entendu rejoués après le dernier correctif Python |
| Reproduction indépendante Sol, pilote suspendu | aucun appel bloqué ; **2 légendes/2** publiées, code 0 |
| Régressions de confirmation | coupure longue, saturation, thread producteur, TTL, vrai WebSocket reconnecté, expiration avant premier PCM : rouges puis vertes |
| Mutant `VOIX_MUTANT_UNMASK=1 ... -k secret_absent` | code 1 attendu : le garde de secret détecte la suppression du masquage |
| `python3 tools/distribution/fabriquer_zip.py` + `python3 tests/distribution-zip.py` | deux archives CRC/manifeste/SHA vérifiés, extraites et exécutées avec dépendances npm propres, HTTP et arrêt vérifiés |
| Résolution binaire Python 3.12 Mac arm64/x64 et Windows x64 | trois codes 0, Piper et websockets inclus ; pas d’import natif cible revendiqué |

La matrice exhaustive `validation-complete-5adc33a/resultats.json` comporte **19 étapes vertes**, fichiers figés inchangés.
Le dernier correctif ne touche pas les entrées navigateur : HTML/JS/CSS/JSON/données identiques bit à bit, assertion `browser_inputs_unchanged=true`.
Après ce correctif, `validation-finale/resultats.json` confirme les tests globaux, Python, contrôles d’interface concernés et zips, avec `unchanged=true`.
Les zips de clôture sont refabriqués au SHA de livraison et leur exécution consignée séparément, sans changer le produit.

## Relectures et preuves

`artifacts/release/relecture/` conserve le premier passage final : Astra et Sol REQUEST_CHANGES, 8/10.
Défauts fondés reproduits puis corrigés : publication hors connexion non bornée et phrase expirant pendant l’ouverture audio ; les archives intermédiaires ont été remplacées.
L’unique confirmation complémentaire est consignée dans `artifacts/release/confirmation-ultime/{astra.md,sol.md,verdicts.json}` ; **ces verdicts font foi**, pas le seul code retour du lanceur.
Chaque annexe est sous 60 000 caractères, voix.py et test_voix_realtime.py sont fournis complets. Arbitrage : `artifacts/release/ARBITRAGE-FINAL.md`.
Journaux rouges conservés : un test legacy à source accélérée regroupait légitimement des phrases ; son contrat d’ordre est maintenant isolé du rattrapage, testé séparément. Une alerte non rouge a été corrigée avec assertion de style calculé et capture.

## Démo et limites avant dimanche

La démo et les mesures historiques de `51daadb` restent dans `artifacts/voix/` ; le banc refait sur la release est dans `artifacts/release/banc-voix/` (synthèse Piper réelle, sortie mémoire/WAV, API factices).
Pas d’API payante appelée, pas de validation acoustique en salle, pas de test natif Mac/Windows : Gatekeeper/TCC, SmartScreen/WinForms, microphone, bibliothèques natives, casque et fermeture doivent être essayés sur les machines cibles.
Ordre d’essai : **télécommande → écoute + voix au casque, pause/coupure réseau → installation sur PC/Mac neuf**.
Un bloc déjà confié à un pilote n’est pas révocable ; après pilote figé, redémarrer le service. La voix Realtime doit être écoutée et son sens contrôlé avant usage public.
Deux limites UX mineures conservées : le choix « VOIX OPENAI » ne change pas Piper (ne pas le manipuler pendant la voix locale) ; la notice rouge de coupure peut persister après réactivation explicite, même si l’interrupteur confirme la voix active.
