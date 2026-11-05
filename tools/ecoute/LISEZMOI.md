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

## Parcours conseillé aux bénévoles (Mac et Windows)

Utiliser le zip de sa plateforme et les deux fichiers **Installer VerseObs** et
**Lancer VerseObs** à sa racine. Le guide PDF d’une page explique le parcours,
sans commande à saisir et sans logiciel préalable. Ces fichiers démarrent aussi
le Studio : ne pas utiliser les instructions de développement ci-dessous.

## Sur Mac (lanceurs techniques historiques, facultatifs)

1. Installer **Python 3.10 à 3.13** depuis python.org ; `python3 --version`
   doit annoncer cette version. Les modèles tournent sur le processeur, sans
   OpenVINO (option Intel/Windows, pas le chemin par défaut sur Mac).
2. Double-cliquer **`tools/ecoute/installer-mac.command`**. Il se place dans
   son propre dossier (espaces acceptés), crée `.venv` avec `python3 -m venv`,
   installe `requirements.txt`, prépare les modèles et liste les entrées audio.
   Internet est nécessaire une première fois. Une `.venv` Windows ne se réutilise
   pas : la renommer et laisser l’installateur recréer celle du Mac.
   Si macOS bloque le fichier, clic droit › Ouvrir, après avoir vérifié sa source.
   Si le droit d’exécution a été perdu lors d’une copie, dans Terminal :
   `bash /chemin/vers/verseobs/tools/ecoute/installer-mac.command`.
3. Lancer VerseObs (`npm start` à la racine), puis double-cliquer
   **`lancer-ecoute-mac.command`** et garder Terminal ouvert.
4. Autoriser le **Microphone pour Terminal** dans Réglages Système ›
   Confidentialité et sécurité › Microphone, puis relancer Terminal/Écoute si
   nécessaire. La demande peut n’apparaître qu’au premier démarrage de l’écoute.
5. Dans **Studio › Connexions › Sous-titres anglais**, choisir l’entrée (micro
   intégré ou carte USB/table de mixage), puis **Démarrer l’écoute**.
   Pour vérifier les numéros depuis `tools/ecoute` :
   `.venv/bin/python ecoute.py --liste`. Le chemin audio utilise `sounddevice`
   et Core Audio ; si PortAudio est introuvable, installer PortAudio (par exemple
   `brew install portaudio` si Homebrew est déjà installé), puis relancer.

Toutes les options d’`ecoute.py` sont conservées, par exemple :
`./lancer-ecoute-mac.command --entree 0 --tout-local` ou
`./lancer-ecoute-mac.command --fichier "/chemin/culte du dimanche.m4a"`.
Le lanceur ajoute `--priorite-basse`, comme celui de Windows.

### Clés facultatives sur Mac : trousseau, pas de fichier

Lancer **`configurer-cles-mac.command`** : saisie masquée (`read -s`), Entrée
seule pour conserver/ignorer une clé. Les valeurs vont dans le **trousseau macOS**
avec `security`, via son entrée standard (pas dans les arguments de processus).
La lecture de contrôle confirme l’écriture sans afficher la clé. Aucun fichier
`.env`, profil shell ou fichier du dépôt n’est créé pour les secrets.

Les entrées du trousseau ont le service `org.verseobs.ecoute.` suivi du nom
`VERSEOBS_ECOUTE_ANTHROPIC_CLE`, `VERSEOBS_ECOUTE_OPENAI_CLE` ou
`VERSEOBS_ECOUTE_API_CLE` (API personnalisée facultative). Le compte est votre
nom d’utilisateur macOS. Le lanceur les lit dans ces **seules variables dédiées**,
uniquement pour le processus Écoute ; une variable dédiée déjà définie reste
prioritaire. Il n’utilise aucune variable API générique d’autres outils.
Autoriser l’accès au trousseau s’il le demande. En cas de trousseau inaccessible,
les clés manquantes restent absentes et Écoute peut fonctionner en local.

Relancer le lanceur après configuration. **`--tout-local` ne lit pas le trousseau
et efface ces variables pour la séance.** Pour supprimer durablement les clés,
ouvrir Trousseaux d’accès, chercher `org.verseobs.ecoute`, supprimer les entrées
concernées et retirer toute variable dédiée que vous auriez définie manuellement.
Les mêmes conditions d’envoi Internet et de facturation que ci-dessous s’appliquent.

Validation de cette version : syntaxe Bash, exécution des lanceurs avec trousseau
simulé, chemins contenant des espaces, options inchangées, test du service avec
Core Audio simulé et priorité POSIX. **Le microphone, l’autorisation macOS, le
vrai trousseau et l’installation des dépendances sur Mac restent à essayer sur
le Mac cible** ; ces essais Linux ne valent pas une validation matérielle.

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
   traduction GPT-6.1 Terra (secours Claude Sonnet 5), transcription OpenAI
   gpt-transcribe ». Dans le Studio, la carte indique « API : traduction GPT-6.1
   Terra, transcription OpenAI gpt-transcribe ».

Ce qui part sur Internet : chaque phrase (le son et le texte français vers
OpenAI si sa clé existe, le texte français vers Anthropic si GPT ne répond pas).
Modèles choisis au banc 2 du 02/11/2026 : 4 prédications d’ICC Tours (Pst
Nanushka M. le 01/11, Pst Joyce Manfoundou le 11/10, AP Hozzy Tchibinda le
20/09, Mathieu Mvondo), 6 à 7 min chacune, mesurées depuis le PC de la régie ;
80 phrases traduites par 16 systèmes et notées à l’aveugle par deux relecteurs
(fidélité, anglais naturel, termes bibliques, rien d’ajouté ni d’oublié) :
- traduction : **GPT-6.1 Terra** sans raisonnement, le mieux noté des modèles
  qui tiennent 1,5 s de médiane et 3 s de p90 sans appel au-delà de 4 s
  (19,7/20 ; 1,28 s et 1,53 s), devant pour chacun des quatre orateurs.
  Secours, dans l’ordre : **Claude Sonnet 5** (clé Anthropic, 19,1/20, 1,23 s),
  puis **OPUS-MT** en local (17/20, contresens possibles). Le secours prend la
  phrase si GPT dépasse 4 s, tombe en panne, refuse la clé ou atteint un
  quota, avec le même contexte. Sans clé OpenAI, Claude Sonnet 5 traduit seul.
  `--traduction claude` remet l’ordre du banc 1 (Claude, puis GPT-4o mini).
  La latence de chaque phrase reste notée dans `tools\ecoute\journaux\api-<date>.jsonl` ;
- transcription : **gpt-transcribe**, envoyé par phrase découpée aux pauses :
  0,65 s par phrase (médiane, 0,84 s au p90), le moins d’erreurs des 9 voies
  OpenAI essayées ; Whisper small en local fait environ deux fois plus d’erreurs.

Coût (pour mémoire, les crédits inclus le couvrent), d’après la consommation
réelle du banc 2 du 02/11 : 780 phrases par heure de prédication. GPT-6.1 Terra
(1 $ / 5 $ par million de jetons, ~239 jetons envoyés et ~19 reçus par phrase)
≈ 0,26 $ par heure ; gpt-transcribe (0,0045 $ par minute facturée, 55 min
facturées par heure de parole) ≈ 0,25 $ ; Claude Sonnet 5, s’il devait tout
prendre, ≈ 0,75 $. Total ≈ 0,51 $ par heure de prédication (≈ 1 $ au plus). Aucun plafond par défaut (`--plafond-euros 5` en fixe
un ; au-delà, tout repasse en local). Le coût estimé est noté au journal, pas
dans le Studio.

**Revenir au tout local** : `lancer-ecoute.cmd --tout-local` (pour une séance),
ou `effacer-cles.cmd` (retire les deux clés du PC). Si la traduction est lente :
`lancer-ecoute.cmd --traduction claude --modele-claude claude-haiku-4-5` (0,74 s,
18,8/20), ou `--traduction claude --modele-claude auto` (Sonnet 5, puis Haiku 4.5
si la médiane dépasse 1,5 s).

## Voix anglaise

**Facultative et désactivée au départ.** Dans Studio › Connexions › **Sous-titres
anglais**, choisir d’abord une **sortie audio**, puis cocher **Voix anglaise**.
Seuls les segments anglais **finals** sont prononcés, jamais les partiels. Le
choix de voix OpenAI, le volume, Pause/Reprendre et l’état (fournisseur,
retard, délai texte → voix, segments sautés) sont dans la même carte. La voix
est synthétique : le dire aux auditeurs. Le QR code ne transporte toujours
que les sous-titres, pas le son.

### Brancher sans larsen

- **Dans la salle** : sortie de carte son distincte vers des casques, ou un
  émetteur de traduction distribué aux anglophones. Ne pas renvoyer ce canal
  dans le mix français capté par Écoute.
- **Dans OBS** : choisir une sortie virtuelle ou une carte son séparée, puis
  ajouter sa capture comme **source audio distincte**. La source navigateur
  des sous-titres reste muette. Choisir séparément les pistes et le monitoring
  OBS ; ne pas capter deux fois la même sortie.
- **Jamais sur les haut-parleurs de la salle** : larsen et boucle de
  retraduction possibles. Aucun périphérique par défaut n’est sélectionné
  implicitement. Rebrancher une carte son nécessite de relancer Écoute pour
  rafraîchir ses numéros ; vérifier le nom avant d’activer.

Pause abandonne la phrase en cours et la file ; Reprendre lit les nouvelles
phrases, pas celles passées pendant la pause. Arrêter l’écoute coupe aussi la
voix. Une perte de connexion au relais désactive la voix : la réactiver dans
le Studio après reconnexion. Le microphone n’est jamais arrêté par le lecteur
vocal (flux sounddevice privé, pas de `sd.stop()` global).

La file rattrape à **×1,12** dès 3 s de retard/attente estimée. Au-delà de
**8 s** (`--retard-voix`), les plus anciens segments sont abandonnés et un
compteur/une notice le signalent ; une phrase déjà commencée peut être coupée
s’il y a du retard derrière elle. Il n’y a jamais deux voix en même temps.
Ce choix privilégie le direct, pas l’exhaustivité d’une traduction différée.

### Fournisseur OpenAI et coût

Avec `VERSEOBS_ECOUTE_OPENAI_CLE`, le défaut est **gpt-realtime-2.1-mini** via
WebSocket (transport HTTP Upgrade), voix **marin** ; **cedar** est également
recommandée. Consigne : anglais naturel, calme et chaleureux, ton de
prédication, lecture sans commentaire ajouté. La connexion Realtime est réutilisée
entre segments ; chaque réponse utilise `conversation: none` et son seul texte,
sans historique ni outil. Un changement de voix/vitesse recrée la session. Seul le texte anglais final est
ajouté par cette fonction aux données envoyées à OpenAI. La clé reste dans
le processus Python : ni page, ni relais, ni journal. `OPENAI_API_KEY` n’est
jamais consultée. Le service n’envoie aucune requête vocale tant que
l’interrupteur n’est pas activé et une sortie choisie.

**Choix vérifié dans la documentation officielle le 05/11/2026** :
[Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech)
recommande désormais ce modèle en remplacement de `gpt-4o-mini-tts`, déprécié
le 01/10/2026, retrait annoncé le 06/01/2027 ([avis officiel](https://developers.openai.com/api/docs/deprecations)). L’ancien `/v1/audio/speech`
reste une option explicite `--voix-api speech`, testée contre une fausse API
HTTP, mais **ce n’est pas le défaut**. Aucune bascule payante vers un autre
modèle en cas de panne : le secours est local.

Premier son attendu sous **1,2 s** (`--delai-voix`) ; erreur, refus ou délai
API → secours local pour la phrase et notice. Après deux échecs parmi les cinq
derniers essais, la voix reste locale jusqu’à la prochaine écoute : pas de
bascule API/Piper toutes les minutes.
Si un début a déjà été joué, on ne répète pas toute la phrase en local : la
suite est abandonnée et signalée. Les comptes rendus de coûts attendent la
fin de la voix. Avec un `--plafond-euros` explicite, **la voix reste locale**
pour ne pas contourner le plafond avec une requête audio au coût inconnu.

Tarif du modèle actuel : [page officielle de tarifs](https://developers.openai.com/api/docs/pricing),
**20 $ / million de jetons audio sortants**, **0,60 $ / million** de jetons
texte entrants, **2,40 $ / million** sortants. La
[documentation de facturation Realtime](https://developers.openai.com/api/docs/guides/voice-latency-cost?voice-api=realtime)
indique un jeton audio assistant par **50 ms**. Donc 60 minutes de voix
produite coûtent environ **1,44 $ d’audio**. Avec l’hypothèse du banc de
780 segments par heure, 100 jetons de consigne + 19 de texte par segment et
19 jetons de texte sortants, cela donne **environ 1,53 $ / heure de prédication**
si la voix parle pendant toute l’heure ; **0,81 $** si elle parle 30 minutes.
C’est le **surcoût voix**, hors transcription/traduction, taxes et variations
de jetons/raisonnement. Ce n’est ni une facture observée ni une garantie.
Les champs `usage` reçus alimentent le journal, sinon une provision est
marquée estimée. **Aucun appel payant n’a été réalisé pour ce développement.**
Le local ne facture aucune API.

### Préparer le secours hors ligne avant dimanche

Choix retenu : **Piper 1.4.2, en_US-ljspeech-medium** (voix féminine anglaise,
22 050 Hz), plutôt que les voix système généralement moins naturelles.
Les [roues officielles](https://pypi.org/project/piper-tts/1.4.2/#files) couvrent
Windows x64, macOS Intel/Apple Silicon et Linux. Le moteur est GPL-3.0-or-later ;
la [fiche du modèle](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD)
indique un corpus du domaine public. Les modèles/binaires ne sont pas inclus
dans le dépôt. La variante *high* a été écartée au banc : trop lente pour
ce VPS. Le modèle Lessac a été écarté pour éviter sa licence de corpus plus
restrictive. Pour redistribuer un paquet contenant Piper, conserver sa
licence et ses obligations GPL.

Dans les zips 2.93, **Installer VerseObs** installe automatiquement Piper 1.4.2,
son modèle anglais, le JSON et la fiche de licence : URL/révision et SHA-256
épinglés dans `tools/distribution/voix.tsv`, contrôlés avant installation.
Le modèle reste sous `Application/tools/ecoute/modeles` ; aucune lecture
sonore pendant la préparation. Relancez **Installer VerseObs** pour mettre à
jour une ancienne installation, notamment **websockets>=15**.

Pour les installations techniques existantes seulement, depuis `tools/ecoute`,
avec le Python du service (Internet nécessaire ; cette voie manuelle ne fait
pas les vérifications SHA-256 du paquet bénévole) :

```powershell
# Windows PowerShell : mettre à jour toutes les dépendances avant dimanche.
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-voix.txt
# Windows PowerShell : modèle et son fichier JSON, téléchargés avant le culte.
.\.venv\Scripts\python.exe -m piper.download_voices --download-dir modeles en_US-ljspeech-medium
```

```sh
# macOS : mettre à jour toutes les dépendances avant dimanche.
.venv/bin/python -m pip install -r requirements.txt -r requirements-voix.txt
# macOS : préparer le modèle avant de passer hors ligne.
.venv/bin/python -m piper.download_voices --download-dir modeles en_US-ljspeech-medium
```

Le service préchauffe Piper **sans jouer de son** avant d’annoncer « prêt ».
Aucun modèle n’est téléchargé à l’exécution du culte. Si le modèle Piper
n’est pas présent, Windows utilise **SAPI** avec une voix anglaise installée ;
macOS utilise **Samantha** via `say`. Ces voies natives créent un WAV
temporaire, lu uniquement par sounddevice sur la sortie choisie, puis
supprimé ; elles ne parlent jamais directement sur la sortie système.
Installer les ressources anglaises du système à l’avance. Si aucun repli
n’est disponible, les sous-titres continuent et la voix signale l’échec.
`--tout-local` force le local pour transcription, traduction **et voix**.

Options (même Python, `ecoute.py` ou lanceur existant) :

| Option | Effet |
|---|---|
| `--liste-sorties` | lister les sorties sounddevice, puis quitter |
| `--voix --sortie-nom "Casques USB"` | nom exact et unique ; voix désactivée si absent/ambigu |
| `--sortie 7 --sortie-nom "Casques USB"` | vérifie aussi que l’index 7 correspond toujours au nom |
| `--voix-nom cedar` | voix OpenAI ; le local garde sa voix préinstallée |
| `--volume-voix 0.5` | volume entre 0 et 1 |
| `--voix-modele-local /chemin/voix.onnx` | modèle Piper déjà installé, avec `.onnx.json` adjacent |
| `--tout-local --voix --sortie-nom "Casques USB"` | essai hors ligne sans aucune API |

Le Studio conserve le nom avec l’index choisi ; le nom et l’API audio sont
revérifiés avant ouverture. Débrancher/rebrancher un casque exige de vérifier
le catalogue ; en cas de doute, relancer le service et choisir à nouveau.
Un appel matériel figé plus de **1,5 s** verrouille la voix jusqu’au redémarrage,
sans bloquer les sous-titres, l’état ou Arrêter. Le bloc déjà confié au pilote
peut finir ; aucun nouveau lecteur concurrent n’est créé.
Une panne de `submit` est journalisée, la voix désactivée ; les légendes continuent.
Une rupture du relais a **10 s de grâce**, avec alerte rouge dans le Studio ;
au-delà la voix reste désactivée jusqu’à action explicite. `--fin-auto` borne
la vidange à 12 s, puis ferme les travailleurs avec leurs délais bornés.

### Mesures, démo et limites du banc

Banc `tools/ecoute/banc_voix.py`, données archivées du culte du **11/10/2026**
(Pst Joyce Manfoundou), sans traduction supplémentaire ni appel payant :

- Faux serveur HTTP Upgrade/Realtime, 12 segments, délai injecté 80 ms :
  texte final publié → premier bloc audio **0,115 s médiane**, **0,144 s p90**,
  **0,145 s maximum**. Ancien `/speech` HTTP factice : 0,176 / 0,219 / 0,220 s.
  L’objectif ≤ 1,5 s est vérifié **sur les serveurs factices**, pas sur Internet.
- Piper local réel : préchauffage **10,023 s** ; 16 segments après chauffe,
  premier PCM **0,505 s médiane**, **1,869 s p90**, **2,182 s maximum**.
  Le local réel n’est donc pas garanti sous 1,5 s ; il dépend du CPU et du texte.
- Sounddevice/PortAudio réellement exercé sur **sortie ALSA virtuelle choisie**
  du VPS : 0,290 s jusqu’au premier bloc, aucun segment sauté. Ce n’est pas
  une carte son Windows/macOS ni une mesure acoustique dans un casque.
- La mesure part de la publication du texte par le service, pas d’une
  photodiode sur l’écran. Le délai du relais/rendu et le tampon matériel
  restent à mesurer à la régie. Le compteur de démarrage ajoute la latence
  annoncée par PortAudio lorsqu’une sortie matérielle est utilisée.

Démo locale : `artifacts/voix/culte-1110-anglais-piper.wav`, **72,969 s**,
mono 22 050 Hz. La fixture versionnée `tests/fixtures/voix-culte-1110.json`
contient la provenance, le hash de l’archive et les traductions préexistantes
(montage chronologique, pas une re-traduction). Mesures et journaux sont dans
`artifacts/voix/`; le WAV doit être copié avec les artefacts lors de l’intégration.

**Avant un usage public** : écouter le WAV, installer/préparer Piper sur la
machine cible, tester un extrait au casque avec OBS, le routage anti-larsen,
la coupure réseau, Pause/Reprendre et les retards. Windows/SAPI et macOS/say
ont des tests de contrat, mais n’ont pas été exécutés ici sur ces systèmes.
La qualité réelle de la voix OpenAI et le respect mot-à-mot du modèle Realtime
restent à auditionner ; une consigne de lecture n’est pas une garantie
contre une omission/reformulation. Ne pas présenter cette branche comme une
validation acoustique en salle ou une fidélité théologique garantie.

## Réglages utiles (`lancer-ecoute.cmd` accepte les mêmes options)

| Option | Effet |
|---|---|
| `--modele base` | 3 à 4 fois plus rapide, nettement moins juste (voir mesures) |
| `--moteur openvino` | Whisper sur la puce graphique Intel (Iris Xe) : texte en 1,8 s au lieu de 6,2 s, processeur libre, mais plus de mots perdus (écart 20 % au lieu de 12 %). Installer d’abord `.venv\Scripts\python.exe -m pip install openvino-genai`. |
| `--entree 18` | entrée audio imposée (numéros : `ecoute.py --liste`) |
| `--fichier culte.m4a --debut 3900 --duree 300` | répétition sur un enregistrement, au rythme du direct |
| `--api-url https://…/v1/chat/completions --api-modele …` | traduction par l’API de l’église (désactivée par défaut). La clé se met dans la variable d’environnement `VERSEOBS_ECOUTE_API_CLE` du PC, jamais dans une page. En cas d’erreur, la traduction locale reprend. |
| `--tout-local` | ignore les clés d’API pour cette séance |
| `--traduction claude` | Claude traduit en premier, GPT-4o mini en secours (ordre du banc 1) ; défaut `gpt` : GPT-6.1 Terra, secours Claude Sonnet 5 |
| `--modele-gpt gpt-6-sol` | autre modèle GPT en premier (défaut `gpt-6.1-terra` ; GPT-6 Sol 19,6/20, 1,10 s) |
| `--modele-claude claude-haiku-4-5` | Claude (secours, ou premier avec `--traduction claude`) en Haiku 4.5 : plus rapide, moins bien noté (`claude-sonnet-5` par défaut ; `auto` : Sonnet puis Haiku si lent) |
| `--secours-openai aucun` | avec `--traduction claude` : pas de secours GPT, OPUS-MT en local si Claude ne répond pas (défaut : `gpt-4o-mini`) |
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
