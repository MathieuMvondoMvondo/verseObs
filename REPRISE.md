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

## Décisions
- Aucun endpoint Bible HTTP ; tout transite sur le WebSocket appairé existant. Liste blanche de deux commandes Bible, sélection numérique bornée, texte résolu par la régie, réponse ciblée au seul téléphone demandeur.
- L’envoi Bible prépare explicitement l’aperçu ; il ne diffuse jamais, même si « Enchaîner » est actif. La diffusion reste une action opérateur séparée dans la régie. Les commandes historiques du conducteur restent inchangées.
- Le chemin Playwright historique n’existe plus. Copie existante : `/home/ubuntu/work/verseobs-verset-entendu-20261104/artifacts/verset/dependencies/playwright-core/index.mjs` ; Chromium 1208 du skill présent.
- Exécutions lourdes sous verrou partagé ; serveur canonique 8080 intouchable. Aucun test matériel macOS revendiqué depuis Linux.
