# À montrer à Math — VerseObs 2.93
Téléphone : choisir/lire un passage puis le préparer en régie, sans diffusion automatique.
Écoute : voix anglaise facultative, casque choisi et vérifié par nom ; Piper local préparé par Installer.
Zips + SHA256SUMS.txt : `artifacts/livraison-2.93/VerseObs-2.93-{Mac,Windows}.zip` ; PDF : `tools/distribution/GUIDE-{MAC,WINDOWS}.pdf` (aussi dans les zips).
Avant dimanche, dans cet ordre : 1) télécommande ; 2) écoute + voix au casque, pause/coupure réseau ; 3) installation sur PC/Mac neuf.
Pas de push ni d’installation sur vos machines ; essais matériels encore requis (micro, Gatekeeper/SmartScreen, arrêt). Publication ci-dessous NON exécutée.
```bash
# Depuis ce worktree, après accord et essais ; repère local de retour sur la version publiée 2.92
 git fetch origin && test "$(git rev-parse origin/main)" = 0d36b39a9e8f5ded33f79f68f9ee4b6f805bc7a7 && git merge-base --is-ancestor origin/main release-20261105 && git branch repere-retour-2.92-20261105 origin/main && git push origin release-20261105:main
```
