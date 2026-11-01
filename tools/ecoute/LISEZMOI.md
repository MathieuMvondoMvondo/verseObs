# VerseObs Écoute : sous-titres anglais en direct

Pour une personne qui ne comprend pas le français : l’ordinateur de la régie
écoute la prédication, la transcrit, la traduit en anglais et l’affiche sur son
téléphone, en direct, sur le Wi-Fi de l’église. C’est une aide pour **suivre le
fil**, pas une traduction fidèle : sur un extrait relu, 3 phrases sur 10 étaient
justes, 5 compréhensibles avec des fautes, 2 fausses. Les premiers essais se
font avec elle, en lui demandant ce qu’elle a compris. Tout tourne sur l’ordinateur :
pas d’abonnement, pas d’envoi sur Internet. Rien ne passe à l’antenne sans
action de l’opérateur.

Avec les clés d’API de Math (facultatif, voir plus bas), la transcription passe
par OpenAI et la traduction par Claude : le PC ne calcule presque plus rien.
Whisper et OPUS-MT restent chargés en secours et reprennent seuls, sans délai,
à la moindre panne, lenteur ou quota de l’API.

## Installer (une fois, sur le PC de la régie)

1. Python 3.10 à 3.13 doit être présent (c’est le cas sur le PC de Math).
2. Double-cliquer `tools\ecoute\installer.cmd`. Il crée `tools\ecoute\.venv`,
   installe les bibliothèques dans ce dossier seulement, télécharge les modèles
   (environ 650 Mo, une seule fois) et affiche les entrées audio.

## Le jour du culte

1. Lancer VerseObs comme d’habitude (`npm start`).
2. Double-cliquer `tools\ecoute\lancer-ecoute.cmd` (laisser la fenêtre ouverte).
   La première fois que l’on partage le QR code, Windows peut demander d’autoriser
   Node.js : accepter pour les **réseaux privés** seulement.
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
navigateur indiquée (1920 × 1080). Décochée, la source reste vide. La case se
décoche seule si l’écoute s’arrête, tombe en panne ou si la connexion est perdue ;
un sous-titre quitte l’écran après 12 s sans nouvelle phrase.

Si le PC prend trop de retard (plus de 30 s), il saute l’audio en attente pour
revenir au direct ; le téléphone affiche alors « Some speech was missed » et le
Studio compte les secondes sautées. En cas de panne, le téléphone l’indique et la
carte du Studio affiche l’erreur : « Démarrer l’écoute » relance.

## Avec vos clés d’API (facultatif)

Les clés ne s’écrivent qu’au clavier du PC de la régie, en saisie masquée.
Elles ne passent jamais par Telegram, un message, une page ou un fichier du
dépôt, et Hermes ne les voit jamais.

1. **Réclamer les crédits inclus dans les abonnements** (avant de créer les clés) :
   - ChatGPT Pro : sur chatgpt.com, Paramètres › Facturation › *API credits*
     (crédits de l’API OpenAI, audio compris ; ils ne couvrent pas Codex).
   - Claude Max ou Ultra : sur claude.ai, Paramètres › Facturation ›
     *API credits* › *Link organization*.
2. **Créer les clés** : platform.claude.com › *API keys* › *Create key*
   (commence par `sk-ant-`) ; platform.openai.com › *API keys* ›
   *Create new secret key* (commence par `sk-`, facultative).
3. Sur le PC de la régie, double-cliquer **`tools\ecoute\configurer-cles.cmd`** :
   coller la clé Anthropic (rien ne s’affiche), Entrée ; puis la clé OpenAI,
   ou Entrée seule pour garder Whisper en local. Chaque clé enregistrée affiche
   seulement « clé enregistrée ». Elles vont dans les variables d’environnement
   de l’utilisateur Windows (`VERSEOBS_ECOUTE_ANTHROPIC_CLE`,
   `VERSEOBS_ECOUTE_OPENAI_CLE` : des noms propres à VerseObs, pour que Claude
   Code ou Codex sur le même PC ne les prennent pas).
4. Fermer puis relancer `lancer-ecoute.cmd`. Sa fenêtre annonce « API :
   traduction Claude auto… ». Dans le Studio, la carte indique « API :
   traduction Claude Sonnet 5, transcription OpenAI gpt-transcribe ».

Ce qui part sur Internet : chaque phrase (le son vers OpenAI si sa clé existe,
le texte français vers Anthropic). Modèles (vérifiés le 01/11/2026 sur les
documentations officielles) :
- traduction « auto » : **Claude Sonnet 5** en effort bas ; si la médiane des
  5 dernières traductions dépasse 1,5 s, **Claude Haiku 4.5** (le plus rapide)
  pour le reste de la séance. Aucune mesure n’a pu être faite avant le culte
  (pas de clé côté serveur) : la latence de chaque phrase est notée dans
  `tools\ecoute\journaux\api-<date>.jsonl` ;
- transcription : **gpt-transcribe**, le modèle recommandé par OpenAI, envoyé
  par phrase découpée aux pauses (le flux temps réel d’OpenAI demanderait un
  autre protocole : pas pour ce premier essai).

Coût (pour mémoire, les crédits inclus le couvrent) : sur la prédication du
11/10, 12,6 phrases par minute, soit environ 760 par heure, ~330 jetons
envoyés et ~20 reçus par phrase. Claude Sonnet 5 (2 $ / 10 $ par million de
jetons) ≈ 0,66 $ par heure ; Haiku 4.5 (1 $ / 5 $) ≈ 0,33 $ ; gpt-transcribe
(0,0045 $ par minute d’audio) ≤ 0,27 $ par heure de parole. Total ≈ 1 $ par
heure de culte au plus. Aucun plafond par défaut (`--plafond-euros 5` en fixe
un ; au-delà, tout repasse en local). Le coût estimé est noté au journal, pas
dans le Studio.

**Revenir au tout local** : `lancer-ecoute.cmd --tout-local` (pour une séance),
ou `effacer-cles.cmd` (retire les deux clés du PC). Si la traduction est lente :
`lancer-ecoute.cmd --modele-claude claude-haiku-4-5`.

## Réglages utiles (`lancer-ecoute.cmd` accepte les mêmes options)

| Option | Effet |
|---|---|
| `--modele base` | 3 à 4 fois plus rapide, nettement moins juste (voir mesures) |
| `--moteur openvino` | Whisper sur la puce graphique Intel (Iris Xe) : texte en 1,8 s au lieu de 6,2 s, processeur libre, mais plus de mots perdus (écart 20 % au lieu de 12 %). Installer d’abord `.venv\Scripts\python.exe -m pip install openvino-genai`. |
| `--entree 18` | entrée audio imposée (numéros : `ecoute.py --liste`) |
| `--fichier culte.m4a --debut 3900 --duree 300` | répétition sur un enregistrement, au rythme du direct |
| `--api-url https://…/v1/chat/completions --api-modele …` | traduction par l’API de l’église (désactivée par défaut). La clé se met dans la variable d’environnement `VERSEOBS_ECOUTE_API_CLE` du PC, jamais dans une page. En cas d’erreur, la traduction locale reprend. |
| `--tout-local` | ignore les clés d’API pour cette séance |
| `--modele-claude claude-haiku-4-5` | traduction toujours par Haiku 4.5 (`claude-sonnet-5` : toujours Sonnet ; `auto` par défaut) |
| `--delai-api 4` / `--delai-transcription 8` | délai maximal d’un appel (s) avant de passer la phrase en local |

## Limites connues

- Traduction automatique : noms propres, versets cités de mémoire, mots du
  milieu chrétien (« affermi », « onction ») sont parfois faux. La page le dit.
- Mesuré sur le PC de la régie (prédication réelle de 5 min, au rythme du direct) :
  le texte anglais arrive 6 s (médiane, 10 s au pire) après la fin de chaque phrase ;
  le service prend 40 % du processeur et 0,7 Go de mémoire. Sur une réception plus
  chargée (OBS qui encode), le retard peut grandir : au-delà de 30 s, le service saute
  l’audio en attente pour revenir au direct.
- Le téléphone doit être sur le même Wi-Fi que le PC ; un Wi-Fi « invités » qui
  isole les appareils bloque la page.
