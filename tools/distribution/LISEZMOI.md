# Distribution autonome 2.93 — mainteneur

Les bénévoles utilisent les deux fichiers Installer/Lancer et le PDF d’une page,
pas cette documentation. Aucune commande ne doit leur être dictée.

## Fabrication sans publication

Sur la branche commitée : `python3 tools/distribution/fabriquer_zip.py`.
Deux archives sont créées dans `artifacts/livraison-2.93`, avec SHA256SUMS.txt et
verification.json. Elles contiennent le même commit, sans Git, environnement,
clés, journaux, node_modules ni résultats de tests. Les .command sont exécutables.
Les applications et données sont rangées dans Application ; le premier niveau
ne montre que Installer, Lancer, le guide et ce dossier. Aucun téléversement.

Les PDF peuvent être régénérés avec `creer_guides.py` (ReportLab/DejaVu pour le
mainteneur uniquement). Les zips réutilisent les PDF déjà présents.

## Dépendances vérifiées et isolation

`runtimes.tsv` épingle Node 22.23.4 officiel et Python 3.12.16 autonome, release
20261026 de python-build-standalone (Astral), Mac arm64/x64 et Windows x64.
Sources d’empreintes : https://nodejs.org/dist/v22.23.4/SHASUMS256.txt et
https://api.github.com/repos/astral-sh/python-build-standalone/releases/tags/20261026 .
Les six archives ont été téléchargées et leur SHA-256 contrôlé pendant la
validation ; aucun exécutable Mac/Windows n’a été lancé sur Linux.

Mac amorce Python avec curl/shasum/tar fournis par macOS, jamais python3 système
(ni Xcode). Windows utilise PowerShell, Get-FileHash et tar fournis par Windows
10/11 x64 récent. L’installateur partagé ne demande que des roues Python binaires :
il n’essaie pas de compiler. Node/Python, modèles et journaux restent sous
Application/.runtime ; l’environnement Écoute est sous tools/ecoute/.venv.
Les dépendances Python et npm passent par leurs registres HTTPS ; les empreintes
épinglées concernent les runtimes, pas l’ensemble des modèles distants.

Les anciens installer.cmd et lancer-ecoute.cmd sont inchangés. Les clés Mac
restent facultatives, saisies masquées par configurer-cles-mac.command et gardées
au trousseau. Aucun secret n’est inclus dans les archives. Pour Windows, les
variables dédiées existantes sont conservées ; la séance fonctionne sans clé.

Le gestionnaire ouvre le premier port local libre à partir de 8080 (ne ferme
jamais un serveur existant), démarre Écoute et ouvre le navigateur. La fermeture
lui demande d’arrêter : Écoute reçoit ARRETER sur stdin, ferme son moteur et ses
tâches, le serveur libère ses sockets. EOF couvre aussi la disparition du parent.
Un arrêt forcé après huit secondes borne un enfant qui ne répond plus.

## Option .app, gratuite mais non distribuée par défaut

Une enveloppe **Platypus** (https://sveinbjorn.org/platypus) peut lancer le même
script au premier plan dans une fenêtre native, sans Terminal, avec son bouton
Quitter. Elle n’exige pas de signature Apple payante mais **ne supprime pas
Gatekeeper**. Ne pas remplacer le lanceur testé par une .app créée sur Linux :
la fabrication et l’arrêt des enfants doivent être essayés sur un Mac avant de
l’ajouter au zip. La version livrée utilise les .command, sans dépendre de Platypus.

## Limites à conserver dans toute transmission

Linux ne valide ni le vrai trousseau/TCC Mac, ni SmartScreen/WinForms, ni la pile
microphone et les roues natives du PC/Mac réel. Math doit essayer installation,
ouverture, autorisation du micro, écoute, choix d’un verset et fermeture complète
sur ses deux machines avant le culte. Aucune installation utilisateur ni publication
n’a été réalisée ici. Sur un poste administré, aucune garantie de contournement
des politiques de sécurité : demander au responsable, ne pas les désactiver.
