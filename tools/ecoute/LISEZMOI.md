# VerseObs Écoute : sous-titres anglais en direct

Pour une personne qui ne comprend pas le français : l’ordinateur de la régie
écoute la prédication, la transcrit, la traduit en anglais et l’affiche sur son
téléphone, en direct, sur le Wi-Fi de l’église. Tout tourne sur l’ordinateur :
pas d’abonnement, pas d’envoi sur Internet. Rien ne passe à l’antenne sans
action de l’opérateur.

## Installer (une fois, sur le PC de la régie)

1. Python 3.10 à 3.13 doit être présent (c’est le cas sur le PC de Math).
2. Double-cliquer `tools\ecoute\installer.cmd`. Il crée `tools\ecoute\.venv`,
   installe les bibliothèques dans ce dossier seulement, télécharge les modèles
   (environ 650 Mo, une seule fois) et affiche les entrées audio.

## Le jour du culte

1. Lancer VerseObs comme d’habitude (`npm start`).
2. Double-cliquer `tools\ecoute\lancer-ecoute.cmd` (laisser la fenêtre ouverte).
3. Studio › **Connexions** › carte **Sous-titres anglais en direct** :
   - **Entrée audio** : choisir la sortie de la table de mixage branchée sur le
     PC (câble jack ou carte son USB). Le micro intégré du portable marche aussi,
     moins bien (bruit de salle, écho).
   - **Démarrer l’écoute**. La latence et la dernière phrase (anglais + français)
     s’affichent dans la carte.
   - **Partager sur le Wi-Fi** : un QR code apparaît. La sœur le scanne avec son
     téléphone, connecté au **même Wi-Fi** que le PC. La page est en lecture
     seule : elle ne donne aucun accès à la régie.
4. Sur son téléphone : texte blanc sur fond sombre, A− / A+ pour la taille, la
   page suit le direct ; si elle remonte lire, « Back to live » la ramène en bas.
5. Après le culte : **Arrêter l’écoute**, puis **Arrêter le partage**.
   **Nouveau lien** coupe les téléphones connectés et crée un autre QR code.

Option OBS : cocher **Afficher les sous-titres dans OBS** et ajouter la source
navigateur indiquée (1920 × 1080). Décochée, la source reste vide.

## Réglages utiles (`lancer-ecoute.cmd` accepte les mêmes options)

| Option | Effet |
|---|---|
| `--modele base` | 3 à 4 fois plus rapide, nettement moins juste (voir mesures) |
| `--entree 18` | entrée audio imposée (numéros : `ecoute.py --liste`) |
| `--fichier culte.m4a --debut 3900 --duree 300` | répétition sur un enregistrement, au rythme du direct |
| `--api-url https://…/v1/chat/completions --api-modele …` | traduction par l’API de l’église (désactivée par défaut). La clé se met dans la variable d’environnement `VERSEOBS_ECOUTE_API_CLE` du PC, jamais dans une page. En cas d’erreur, la traduction locale reprend. |

## Limites connues

- Traduction automatique : noms propres, versets cités de mémoire, mots du
  milieu chrétien (« affermi », « onction ») sont parfois faux. La page le dit.
- La latence dépend du processeur : voir `REPRISE.md` du dossier de travail pour
  les mesures du PC de la régie.
- Le téléphone doit être sur le même Wi-Fi que le PC ; un Wi-Fi « invités » qui
  isole les appareils bloque la page.
