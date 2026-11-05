# VerseObs 2.93 — release intégrée

Branche `release-20261105`, worktree `/home/ubuntu/work/verseobs-release-20261105`.
Base publiée : `0d36b39` (2.92). Parents : télécommande/installateurs `278a5b8`, voix `51daadb`.
Aucun push, publication ni installation sur le PC. Canonique et service 8080 intacts.
Commits : MathieuMvondoMvondo <mathieu.mvondo-mvondo@supinfo.com>, auteur et committer.

## Périmètre
- Télécommande : choisir/lire un passage, le préparer en régie sans le diffuser.
- Installation double-clic Mac Intel/Apple Silicon et Windows x64, Node/Python autonomes.
- Voix anglaise sur sortie choisie, API facultative, Piper local puis SAPI/say en secours.
- BUILD et caches 2.93 ; listes blanches distinctes pour le téléphone et la voix.

## Validation et livraison
Les preuves propres au commit intégré sont dans `artifacts/release/`.
Les anciens résultats ne valent que pour leurs branches respectives.
La relecture de confirmation doit reprendre les blocages Astra précédents : archive sans
heard.js, panne enfant avec stdin ouvert, absence d’exécution des zips, guide microphone,
scénario bilingue interrompu et caches sous-titres. Pas d’APPROVE inventé après correction.
Les résultats finaux, verdicts et limites sont consignés dans `LIVRAISON-2.93.md`.

## Limites opérateur
Les essais Linux et sorties audio virtuelles ne prouvent ni Gatekeeper/TCC, ni
SmartScreen/WinForms, ni les bibliothèques natives et le casque sur un vrai Mac/PC.
Avant le culte : télécommande, écoute + voix au casque, installation sur poste neuf.
Aucun appel payant ni validation acoustique en salle n’est revendiqué.
