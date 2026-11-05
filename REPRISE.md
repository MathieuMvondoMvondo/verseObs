# VerseObs 2.93 — téléphone, Mac et Windows

Base `0d36b39`, branche `v293-telecommande-mac`, worktree `/home/ubuntu/work/verseobs-v293-20261105` uniquement. Contenu produit testé au commit `83d471a` ; la clôture suivante ne change que la documentation et le manifeste des zips.
Aucun push, publication ou installation PC/Mac. Identité du canonique non configurée : tous les commits utilisent explicitement MathieuMvondoMvondo <mathieu.mvondo-mvondo@supinfo.com>, auteur ET committer. Canonique et serveur 8080 non modifiés ; origin/main reste `0d36b39`.

## Réalisé
- [x] Workflow et références lus ; worktree isolé et lien node_modules créés.
- [x] Télécommande : livre/recherche FR/abréviations, chapitre, verset/plage, texte de la version active, envoi dans l’aperçu régie uniquement.
- [x] Appairage et liste blanche conservés ; aucune API Bible HTTP ; refus sans code et révocation testés.
- [x] Non-diffusion vérifiée avec sortie occupée, Enchaîner et traduction secondaire retardée.
- [x] BUILD et toutes les URL de cache à 2.93 ; test étendu à toutes les pages HTML.
- [x] Mac sans prérequis : deux .command au premier niveau, Node/Python portables vérifiés, aucun Python système/Xcode, clés facultatives masquées au trousseau.
- [x] Windows sans prérequis : deux .cmd ouvrant une fenêtre simple, runtimes vérifiés, raccourci Bureau ; anciens lanceurs Windows inchangés.
- [x] Démarrage serveur + Écoute + navigateur ; arrêt par fermeture, EOF ou commande ; panne enfant avec stdin ouvert correctement signalée par sortie 1.
- [x] Six archives officielles réellement téléchargées et SHA-256 vérifiés ; roues résolues sans compilation pour les trois plateformes.
- [x] Tests simulés Mac/PowerShell, archive altérée refusée, ShellCheck, syntaxe PowerShell, 100 tests Python et npm/check verts.
- [x] Neuf suites/scénarios Chromium verts ; Studio complet rejoué : 72/72. Empreintes de 96 fichiers navigateur identiques entre les validations concernées.
- [x] Deux zips fabriqués, relus et exécutés après extraction avec leurs propres dépendances npm de production ; pages/ressources et arrêt vérifiés sur Linux.
- [x] Deux guides PDF illustrés d’une page, rendus et inspectés ; option .app gratuite documentée, non fournie comme app native validée.
- [x] Relecture initiale Astra/Sol, puis complément limité au nouveau périmètre demandé en cours de travail ; corrections fondées vérifiées, aucune troisième boucle.
- [x] Commits, identité et périmètre vérifiés ; détails dans LIVRAISON-2.93.md.

## Relectures et corrections
- Premier périmètre : Astra et Sol REQUEST_CHANGES. Corrigés : ordre du test bilingue et caches sous-titres.
- Nouveau périmètre autonome : Sol APPROVE ; Astra REQUEST_CHANGES. Reproduits puis corrigés : `heard.js` oublié dans les zips, CLI restant vivant après panne enfant, absence d’essai d’exécution des zips. Guide Microphone Windows complété. Les correctifs n’ont pas reçu une nouvelle approbation : ne pas inventer un verdict final unanime.
- Garde supplémentaire fondée : refus d’un lancement pendant une installation ; sonde rouge puis verte et tests des deux marqueurs.

## Incidents de validation conservés
- Un timeout intermittent du scénario legacy à browser-onglet.mjs:362 ; suite Studio complète rejouée verte (72 vérifications).
- Un EADDRINUSE sur le port de test 18766 et un timeout Python sous charge. Aucun service étranger arrêté ; après libération, npm/check et les 100 tests Python ont été rejoués verts sous les deux verrous partagés.
- Les journaux rouges ne sont pas effacés. Les résultats finaux sont dans `artifacts/v293/*-final.log`, `verification-cloture/` et `zips-executes.json` ; les autres suites Chromium vertes dans `verification-finale/`.

## À faire par Math, pas sur le VPS
- [ ] Essai réel Mac : installation double-clic, Gatekeeper, TCC Microphone/Terminal, vrai trousseau, écoute et fermeture.
- [ ] Essai réel Windows : installation, WinForms/SmartScreen, raccourci, bibliothèques natives, microphone et fermeture.

Les tests Linux ne prouvent pas ces fonctions natives. Prévoir l’essai avant le culte. Aucun contournement d’une politique de sécurité administrée n’est garanti.
