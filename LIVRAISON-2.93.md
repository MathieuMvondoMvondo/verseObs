# Livraison locale — VerseObs 2.93

Branche : `v293-telecommande-mac`, base `0d36b39`. Aucun push ni déploiement.
Worktree : `/home/ubuntu/work/verseobs-v293-20261105`.

## Livrables

- Télécommande Bible : recherche FR (`Jn`, `1 Co`, accents/casse/espaces), livre, chapitre, verset/plage, aperçu du texte dans la version active de la régie, puis préparation de l’aperçu régie. Aucun SHOW automatique, même avec Enchaîner. Les commandes historiques du conducteur restent distinctes.
- Installer/Lancer VerseObs pour Mac et Windows : double-clic, runtimes autonomes épinglés/vérifiés, préparation locale de l’Écoute, ouverture du Studio et arrêt du serveur/enfant à la fermeture. Fenêtre simple et raccourci Bureau Windows. Anciens .cmd inchangés.
- Deux guides PDF illustrés d’une page. Option .app gratuite décrite dans `tools/distribution/LISEZMOI.md`, pas distribuée comme application native testée.
- Archives sous `artifacts/livraison-2.93/` : `VerseObs-2.93-Mac.zip`, `VerseObs-2.93-Windows.zip`, `SHA256SUMS.txt`, `verification.json`. Le manifeste à l’intérieur donne le commit exact ; le fabricant relit tous les membres et leurs CRC.

## Tests exécutés

| Commande / scénario | Résultat réel |
|---|---|
| `npm run check` | code 0 |
| `npm test` | code 0 ; notamment 347 assertions du socle, 146 contrôles Studio, protocole Bible et gestionnaire CLI |
| `python3 -m unittest discover -s tools/ecoute -p 'test_*.py'` | 100 tests, OK |
| `python3 tests/distribution.py` | 5 tests, OK : bootstrap sans Python système, archive altérée, extraction, installation simulée, manifeste |
| `node tests/distribution-launch.js` et `node tests/distribution-cli.js` | serveur/enfant réels de test : arrêt, EOF, panne avec stdin ouvert, doublon, enfant absent, installation en cours |
| `pwsh -NoProfile -File tests/distribution-windows.ps1` | code 0 : empreinte factice, refus d’altération et parseur PowerShell |
| ShellCheck sur les .command et installer-mac.sh | code 0 |
| `node tests/browser-remote-bible.mjs` | parcours tactile 320/390/430 px, version régie, refus sans code, aperçu sans diffusion, attente bilingue et révocation verts |
| `node tests/browser-studio.mjs` | dernier passage complet : 72 vérifications, code 0 |
| Browser motion, dock, heard, captions ; Studio ONLY=paired, habillages, onglet | codes 0, neuf suites/scénarios navigateur au total avec les deux précédents |
| `python3 tools/distribution/fabriquer_zip.py` puis `python3 tests/distribution-zip.py` | deux zips relus, extraits, dépendances npm propres, serveur/ressources/arrêt : codes 0 |

Les exécutables de test sont conservés sous `artifacts/dependencies` ; Chromium est celui du skill. Les validations figées ont conservé leurs empreintes avant/après. Les 96 fichiers navigateur n’ont pas changé entre les passages concernés ; les derniers correctifs ne portent que sur la distribution, ses tests et les guides.

Journaux finaux : `artifacts/v293/check-final.log`, `npm-final.log`, `python-final.log`, `verification-cloture/`, `zips-executes.json`. Suites navigateur supplémentaires : `verification-finale/`. Une collision de port, un timeout Python sous charge et un timeout legacy navigateur ont été conservés dans les journaux historiques, puis rejoués verts sans tuer de service extérieur.

## Relecture

Commande utilisée : `python3 /home/ubuntu/.hermes/work/relecture.py`, relecteurs `astra,sol`, `--effort high --delai 2400`.
Premier périmètre : deux REQUEST_CHANGES, blocages corrigés. Le changement de cible vers des paquets autonomes Mac puis Windows a nécessité un complément limité à cette nouvelle surface : **Sol APPROVE ; Astra REQUEST_CHANGES avant corrections**.
Les défauts fondés d’Astra ont été reproduits et fermés : dépendance `heard.js` absente des archives, gestionnaire ne quittant pas après panne de l’enfant, absence de test d’exécution du zip. Guide Microphone Windows complété. Pas de nouvelle boucle d’approbation après ces corrections ; ne pas annoncer un APPROVE final unanime.

## Limites et prochaine étape humaine

Aucun binaire Mac/Windows ni microphone réel n’a été exécuté sur le VPS. Les six archives officielles ont été téléchargées et hachées, les roues Python résolues pour macOS arm64/x64 et Windows x64, mais les imports natifs, WinForms/PowerShell 5.1, Gatekeeper/SmartScreen, TCC et le vrai trousseau doivent encore être essayés par Math sur les machines cibles. Windows 10/11 x64 récent est visé. Aucun compte ni clé payante n’est requis pour l’écoute locale.

Aucun push, publication, signature Apple payante ou installation sur le PC/Mac de Math. Les fichiers produit restent dans le dossier du paquet ; aucun environnement ou secret n’est inclus dans les zips.
