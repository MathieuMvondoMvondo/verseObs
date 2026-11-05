# VerseObs 2.93 — téléphone et Mac

Base : `0d36b39`. Branche : `v293-telecommande-mac`. Worktree : `/home/ubuntu/work/verseobs-v293-20261105` uniquement. Le journal antérieur Verset entendu est conservé dans la base Git.
Aucun push, aucune publication ni installation PC. Identité du canonique non configurée ; commits explicites auteur ET committer MathieuMvondoMvondo <mathieu.mvondo-mvondo@supinfo.com> (identité du commit de base).

- [x] Workflow/références lus ; origin/main vérifié, worktree et lien node_modules créés.
- [x] Sélecteur téléphone livre/chapitre/verset/plage, aperçu puis envoi appairé dans l’aperçu régie, version active seulement.
- [x] Tests unitaires et protocole, refus sans appairage, parcours Chromium jusqu’à la sortie (passage initial vert ; régression bilingue ajoutée).
- [x] Mac : installation/lancement, saisie masquée et trousseau, guide, tests de portabilité (simulation Linux, pas de Mac matériel).
- [x] BUILD et toutes les URL ?v= / &v= à 2.93.
- [ ] npm run check, npm test et suites navigateur concernées verts.
- [ ] Une relecture Astra/Sol high/délai 2400 ; corriger seulement les blocages fondés.
- [ ] Commits et identité vérifiés, rapport final court avec preuves et limites.

## Nouveau périmètre demandé en cours de travail
- [x] Fabrication des zips Mac/Windows : Installer, Lancer, guide illustré et dossier Application au premier niveau.
- [x] Aucun Python/Node/Git système : téléchargements portables officiels épinglés, SHA-256 obligatoire.
- [x] Mac double-clic, pas d’outils Xcode ; Windows interface simple + raccourci Bureau ; anciens .cmd préservés.
- [x] Démarrage serveur/Écoute, ouverture navigateur et arrêt des deux à la fermeture.
- [ ] Faux téléchargements, refus d’archive altérée, ShellCheck, tests du gestionnaire et fabrication effective des zips.
- [x] Essais matériels explicitement laissés à Math ; pas de publication.

Revue du premier périmètre : Astra et Sol REQUEST_CHANGES (test bilingue sélectionné avant affichage ; caches sous-titres encore à 1). Corrections ciblées appliquées. Leurs retours ergonomiques non bloquants restent hors correction. La nouvelle distribution sans prérequis a été demandée APRÈS le gel ; elle n’est pas couverte par cette relecture.

## Corrections fondées après le complément de revue
- [x] Astra REQUEST_CHANGES : `tools/heard.js` absent des deux zips. Reproduit depuis chaque archive avec ses dépendances npm propres ; ajout à la liste blanche et aux fichiers obligatoires.
- [x] Panne enfant + stdin parent ouvert : CLI maintenant quitté avec code 1 après nettoyage ; tests de vrais processus pour panne, EOF et ARRETER.
- [x] Contrôle des deux zips extraits ajouté, sans binaire cible ni micro : lancement, ressources HTTP et arrêt.
- [x] Guide Windows : chemin du réglage Microphone pour applications de bureau, Windows 10/11 ; PDF régénéré.
- [x] Garde supplémentaire fondée : sonde prouvant qu’un lancement était accepté pendant une installation ; refus des deux marqueurs d’installation et recontrôle après acquisition des verrous.
- [ ] Nouvelle exécution de npm/check, essais ciblés, régénération et exécution des deux zips du SHA final.
- [ ] Suite browser-studio à rejouer : timeout intermittent déjà documenté de browser-onglet.mjs:362 (le premier passage avait 72/72 ; les suites suivantes ont été exécutées séparément et sont vertes).

## Preuves du nouveau périmètre (avant gel final)
- Six archives Node/Python officielles réellement téléchargées ; les six SHA-256 épinglés concordent (`artifacts/v293/archives/verification.json`). Binaires cibles jamais exécutés sur Linux.
- Roues Python résolues sans compilation pour macOS arm64, macOS x64 et Windows x64 (Python 3.12).
- Tests bootstrap Mac sans python3 système, altération refusée ; tests garde-fou PowerShell exécutés sur Linux ; ShellCheck et analyse syntaxique PowerShell verts.
- Gestionnaire testé avec un vrai processus enfant : serveur réel, URL ouverte, fermeture stdin, port libéré, enfant absent et double lancement refusé.
- Deux PDF illustrés d’une page, rendus et inspectés visuellement. Aucun test matériel revendiqué.

## Décisions
- Aucun endpoint Bible HTTP ; tout transite sur le WebSocket appairé existant. Liste blanche de deux commandes Bible, sélection numérique bornée, texte résolu par la régie, réponse ciblée au seul téléphone demandeur.
- L’envoi Bible prépare explicitement l’aperçu ; il ne diffuse jamais, même si « Enchaîner » est actif. La diffusion reste une action opérateur séparée dans la régie. Les commandes historiques du conducteur restent inchangées.
- Le chemin Playwright historique n’existe plus. Copie existante : `/home/ubuntu/work/verseobs-verset-entendu-20261104/artifacts/verset/dependencies/playwright-core/index.mjs` ; Chromium 1208 du skill présent.
- Exécutions lourdes sous verrou partagé ; serveur canonique 8080 intouchable. Aucun test matériel macOS revendiqué depuis Linux.
