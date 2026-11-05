# Verset entendu — candidat de démonstration

## Ce que l’opérateur fait

1. Dans **Connexions → Écoute**, choisir l’entrée audio et démarrer comme auparavant.
2. Revenir dans **Bible**. La carte **Verset entendu** propose une référence et le texte local correspondant.
3. Ouvrir **Lire et vérifier** pour le texte complet, la parole reconnue et le score, puis **Charger l’aperçu**. La version retrouvée est conservée, pour ne pas changer implicitement sa numérotation. Si elle diffère de votre version de travail, la carte annonce ce remplacement avant le clic ; le sélecteur de version du Studio change avec le passage. Rechoisir votre version si vous souhaitez y revenir.
4. Utiliser ensuite **Diffuser**, explicitement. Réception et chargement ne diffusent rien, même avec **Enchaîner à l’antenne** coché. **Écarter** ne touche pas à l’antenne.

Un chapitre seul est annoncé comme tel : **Ouvrir le chapitre** prépare le verset 1, à choisir ensuite. Une carte expire après une minute ; arrêt ou déconnexion la retirent immédiatement. Une nouvelle proposition ne remplace pas un bouton ayant le focus. Rien n’est mémorisé pour être reproposé au redémarrage.

## Reconnaissance et limites

- Références françaises : noms complets/abrégés, ordinaux, nombres en lettres jusqu’à 176, chapitre avant le livre, verset et plage. Exemple : « au chapitre trois de Jean, verset seize ».
- Citations : mots locaux normalisés (accents, pluriels), index inversé et ordre des mots ; abstention sur les fragments trop courts ou les candidats proches. Deux phrases contiguës peuvent se compléter, jamais un contexte ancien indéfini.
- L’**indice /100 est un score de correspondance, pas une probabilité**. « Référence dite » signifie que la référence prononcée est reconnue, pas que le prédicateur ne peut pas se tromper.
- Les 12 fichiers sont chargés et contrôlés. **Crampon est en quarantaine** : son fichier attribue des textes aux mauvais livres (notamment Jean 3:16 à l’identifiant Philippiens). Les **11 autres versions** sont admissibles. Les fichiers bibliques originaux n’ont pas été modifiés. Évitez aussi Crampon dans le sélecteur manuel : son corpus préexistant demeure incohérent ; cette livraison ne le répare pas arbitrairement.
- **Les paraphrases et citations courtes sont souvent manquées.** Ce candidat privilégie l’absence de fausse proposition plutôt que le rappel. Il ne remplace ni la recherche manuelle ni la vigilance de l’opérateur.
- La transcription et la traduction déjà choisies restent **gpt-transcribe / GPT-6.1 Terra**, avec leurs replis existants. La recherche commence après transcription, sans attendre la traduction.
- Option `--departage-versets` : GPT-6.1 Terra ne départage que des candidats lexicaux proches. Il ne peut produire ni référence ni texte libres ; erreur/délai/schema invalide → abstention. L’option est **désactivée par défaut**, transport testé avec réponse simulée, pas validée sur un culte. Appel limité à un toutes les 3 s, délai socket 1,5 s, coût estimé majoré 0,008 $ par tentative. Si `--plafond-euros` est configuré, ce départage facultatif reste désactivé pour ne pas concurrencer la transcription/traduction dans le plafond. Les appels déjà partis ne sont pas annulables côté fournisseur ; une réponse tardive est ignorée.
- `--sans-versets` garde Écoute et ses sous-titres sans recherche biblique.

## Mesures et démonstration

Le banc `tools/ecoute/banc_versets.py` reprend **344 phrases réellement transcrites** lors du banc du 02/11, quatre prédications, dont le culte du 11/10. Les annotations sont dans `tests/fixtures/heard-gold.json`. Une abstention sur une phrase annotée est comptée comme un faux négatif. Les répétitions sont des occasions distinctes ; le score par phrase est calculé avant l’anti-doublon de la carte. Le corpus est un **banc de développement non aveugle**, pas une validation indépendante.

La recherche locale est chronométrée. Le délai ASR historique du PC et la pause VAD hypothétique de 0,5 s sont séparés : leur somme **n’est pas une nouvelle mesure microphone en régie**. Le rejeu vidéo utilise l’audio d’origine et la transcription enregistrée aux instants correspondants, avec la recherche actuelle et le vrai Studio. Aucun résultat biblique n’est préfabriqué pour la vidéo.

Commandes de reproduction, depuis la racine du projet (chemins des dépendances à adapter) :

```sh
python tools/ecoute/banc_versets.py --source /chemin/vers/asr2.json --sortie artifacts/verset/banc
# DEMO_AUDIO_ROOT contient extrait-V1jrg_sS2tQ.wav et extrait-jwY55s-CoWU.wav du banc original.
DEMO_SCENE=0 node tools/demo-verset.mjs  # référence explicite, culte du 11/10
DEMO_SCENE=2 node tools/demo-verset.mjs  # citation sans référence, même culte
```

`PLAYWRIGHT_CORE` et `CHROMIUM` sont obligatoires pour la vidéo et les tests navigateur. Aucun téléchargement ni connexion au cloud n’est nécessaire au rejeu. Les résultats et limites chiffrés sont livrés avec les preuves dans `artifacts/verset/`.

## Installer seulement après validation de Math

**Rien n’a été installé à distance ni publié.** Le paquet est une mise à jour de la version du 01/11 (`9a0df90`) ou de la branche canonique Écoute banc 2 (`0d70401`), pas une installation neuve.

Prérequis : dossier VerseObs existant, Node/dépendances déjà en place, environnement Python d’Écoute déjà fonctionnel, fichiers `data/bibles` et `data/books`. Aucune nouvelle dépendance Python. Le script ne touche ni aux clés, ni aux modèles, ni aux journaux, ni au stockage local du navigateur. Il **refuse une modification locale inconnue** plutôt que de l’écraser.

1. Vérifier le SHA-256 du ZIP fourni, décompresser **hors du dossier utilisé**.
2. Après accord de Math, arrêter manuellement le serveur VerseObs et le service Python **sur le PC de la régie**. Le service de prévisualisation du VPS sur 8080 ne doit jamais être touché.
3. Avec le Python existant, lancer l’inspection (aucun changement) :

```text
python installer-versets.py --cible "C:\chemin\VerseObs"
```

4. Vérifier le chemin affiché. Puis seulement :

```text
python installer-versets.py --cible "C:\chemin\VerseObs" --appliquer --accord-math
```

Le script sauvegarde chaque ancien fichier dans un dossier voisin `VerseObs-retour-versets-…`, applique le manifeste, puis relit les sommes de contrôle. En cas d’échec d’écriture, il restaure et relit les fichiers concernés, tentative courante comprise. Les écritures se font dans un temporaire voisin puis par remplacement atomique. Conserver le dossier du paquet et le chemin de sauvegarde affiché.

5. Relancer manuellement les lanceurs existants. La préparation de l’index se fait en arrière-plan : Écoute peut déjà sous-titrer, mais aucune proposition biblique avant l’index prêt (voir Connexions). Dans OBS, recharger **le dock et la source navigateur, hors antenne**, pour recevoir le build 2.91 ; confirmer le retour de l’overlay avant toute diffusion. Un ancien overlay doit être actualisé explicitement.
6. **Avant dimanche** : essai de 75 s avec la vraie entrée audio, vérification parole → proposition, aperçu sans antenne, diffusion manuelle, arrêt/reprise et arrêt du service. Mesurer sur ce PC la latence réelle et vérifier les clés absentes du journal. Ce test n’est pas remplacé par le rejeu fourni.

## Retour arrière préparé

Arrêter manuellement les deux programmes, puis inspecter et appliquer :

```text
python installer-versets.py --retour "C:\chemin\VerseObs-retour-versets-…"
python installer-versets.py --retour "C:\chemin\VerseObs-retour-versets-…" --appliquer --accord-math
```

Le retour restaure les octets d’origine et retire uniquement les nouveaux fichiers installés par ce paquet. Il refuse d’écraser un fichier modifié depuis l’installation. Relancer les anciens lanceurs et recharger le dock. Le test automatique `python tools/test-installer-versets.py` vérifie inspection, application, relecture, retour exact et refus d’une modification locale.

## Vérification de développement

```sh
npm run check
npm test
python -m unittest discover -s tools/ecoute -p 'test_*.py'
node tests/browser-heard.mjs
```

`test_versets_service.py` exerce aussi le Service complet, un fichier WAV synthétique, des API HTTP locales simulées, le vrai index et le vrai relais Node : proposition avant traduction, arrêt/effacement et aucune commande antenne. Ce test de câblage n’est pas une mesure ASR ou microphone.

Le nouveau test navigateur utilise un relais réel et un contexte OBS séparé : aucune commande SHOW à la réception ou au chargement, programme déjà occupé inchangé, seuil, chapitre seul, arrêt, déconnexion et largeurs 920/600/360/320. `tools/verify-heard.py` lance les suites navigateur complètes puis les sections paired, habillages et onglet avec leur vrai lanceur, même si une étape précédente échoue. Il consigne les codes retour et vérifie que les sources sont restées immuables. Sur le VPS, toute exécution lourde doit être précédée de `flock /tmp/brainmood-heavy.lock`.
