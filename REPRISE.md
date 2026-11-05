# VerseObs 2.93 — release intégrée locale

Worktree `/home/ubuntu/work/verseobs-release-20261105`, branche `release-20261105`.
Base publiée `0d36b39`, parents `278a5b8` (télécommande/installateurs) et `51daadb` (voix).
Aucun push, déploiement, installation PC/Mac ni modification du service de production.
Auteur et committer explicites : MathieuMvondoMvondo <mathieu.mvondo-mvondo@supinfo.com>.

- [x] Fusion réelle, scripts de tests réunis, BUILD et 47 URL de cache 2.93.
- [x] Piper/modèle ajoutés aux deux parcours d’installation, SHA-256 contrôlés avant pip.
- [x] Blocages de confirmation voix corrigés avec régressions rouges puis vertes.
- [x] Matrice exhaustive 19/19 verte sur 5adc33a, sources figées.
- [x] Confirmation Astra/Sol : publication non bornée et expiration avant premier PCM reproduites puis corrigées.
- [x] Produit final 272c064 : npm check/test, 133 tests Python + 105 sous-tests, interfaces concernées et deux zips exécutés verts ; entrées des autres suites Chromium inchangées bit à bit.
- [x] Deux guides PDF inspectés ; A-MONTRER-A-MATH.md en 10 lignes avec publication préparée mais non exécutée.

Le code produit ne change plus dans la clôture documentaire. Le SHA exact des zips est dans leur manifeste.
La confirmation complémentaire unique et ses verdicts sont dans `artifacts/release/confirmation-ultime/`.
Voir `LIVRAISON-2.93.md` pour les commandes, preuves, écarts mineurs conservés et limites natives.

À Math : essayer la télécommande, puis écoute/voix au casque et coupure réseau,
puis installation sur Mac/PC neuf. Ne rien publier avant son accord et ces essais.
