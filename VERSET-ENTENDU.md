# Verset entendu — candidat de démonstration

## Ce que l’opérateur fait

Pour le rappel accru mesuré ci-dessous, double-cliquer **`tools\ecoute\lancer-ecoute-versets-payant.cmd`** (ou lancer `lancer-ecoute.cmd --departage-versets`) (clé OpenAI existante). Sans cette option, seule la recherche locale conservatrice fonctionne. Le lanceur est nommé **payant** et annonce ces appels avant démarrage ; le lanceur habituel reste inchangé. Le départage est désactivé si un plafond euros est configuré, avec avertissement visible dans la carte. Aucun changement de clé ni nouvelle dépendance.

1. Dans **Connexions → Écoute**, choisir l’entrée audio et démarrer comme auparavant.
2. Revenir dans **Bible**. La carte **Verset entendu** propose une référence et le texte local correspondant.
3. Lire les deux premières lignes et le type de reconnaissance affichés, puis ouvrir **Lire et vérifier** pour le texte complet, la parole reconnue et le score, puis **Charger l’aperçu**. La version retrouvée est conservée, pour ne pas changer implicitement sa numérotation. Si elle diffère de votre version de travail, la carte annonce ce remplacement avant le clic ; le sélecteur de version du Studio change avec le passage. Rechoisir votre version si vous souhaitez y revenir.
4. Utiliser ensuite **Diffuser**, explicitement. Réception et chargement ne diffusent rien, même avec **Enchaîner à l’antenne** coché. **Écarter** ne touche pas à l’antenne.

Un chapitre seul est annoncé comme tel : **Ouvrir le chapitre** prépare le verset 1, à choisir ensuite. Une carte expire après une minute ; arrêt ou déconnexion la retirent immédiatement. Une nouvelle proposition ne remplace pas un bouton ayant le focus. Rien n’est mémorisé pour être reproposé au redémarrage.

## Reconnaissance et limites

- Références françaises : noms complets/abrégés, ordinaux, nombres en lettres jusqu’à 176, chapitre avant le livre, verset et plage. Exemples : « au chapitre trois de Jean, verset seize », « Jean chapitre numéro trois, au seizième verset ». Une plage scindée « Matthieu 7, 15. / À vingt. » est reprise seulement dans les 8 s, sans autre prose.
- Citations : mots locaux normalisés (accents, pluriels), index inversé et ordre des mots ; abstention sur les fragments trop courts ou les candidats proches. Deux phrases contiguës peuvent se compléter, jamais un contexte ancien indéfini.
- L’**indice /100 est un score de correspondance, pas une probabilité**. « Référence dite » signifie que la référence prononcée est reconnue, pas que le prédicateur ne peut pas se tromper.
- Les 12 fichiers sont chargés et contrôlés. **Crampon est en quarantaine** : son fichier attribue des textes aux mauvais livres (notamment Jean 3:16 à l’identifiant Philippiens). Les **11 autres versions** sont admissibles. Les fichiers bibliques originaux n’ont pas été modifiés. Évitez aussi Crampon dans le sélecteur manuel : son corpus préexistant demeure incohérent ; cette livraison ne le répare pas arbitrairement.
- **Des paraphrases et citations courtes restent manquées.** Le modèle peut confirmer un candidat local au seuil 0,98 ; il ne crée pas le texte proposé. Le contexte de départage est limité à la phrase précédente récente, jamais à un suivi long de chapitre. Ce candidat privilégie l’abstention plutôt que l’augmentation du rappel à tout prix. Il ne remplace ni la recherche manuelle ni la vigilance de l’opérateur.
- La transcription et la traduction déjà choisies restent **gpt-transcribe / GPT-6.1 Terra**, avec leurs replis existants. La recherche commence après transcription, sans attendre la traduction.
- Option `--departage-versets` : GPT-6.1 Terra confirme ou départage une liste privée de candidats lexicaux, incluant des paraphrases et fragments distinctifs. Il ne peut produire ni référence ni texte libres ; erreur/délai/schema invalide → abstention. L’option est **désactivée par défaut**, transport simulé testé et vrais appels mesurés sur les transcriptions ci-dessous, mais pas encore en direct microphone. Appel limité à un toutes les 3 s, délai socket 3 s, coût estimé majoré 0,008 $ par tentative. Si `--plafond-euros` est configuré, ce départage facultatif reste désactivé pour ne pas concurrencer la transcription/traduction dans le plafond. Les appels déjà partis ne sont pas annulables côté fournisseur ; une réponse tardive est ignorée.
- `--sans-versets` garde Écoute et ses sous-titres sans recherche biblique.

## Mesures et démonstration

Le banc local `tools/ecoute/banc_versets.py` reprend **344 phrases réellement transcrites** lors du banc du 02/11, quatre prédications, dont le culte du 11/10. Les annotations sont dans `tests/fixtures/heard-gold.json`. Une abstention sur une phrase annotée est comptée comme un faux négatif. Les répétitions sont des occasions distinctes ; le score par phrase est calculé avant l’anti-doublon de la carte. Le corpus principal est un **banc de développement non aveugle**.

| Banc, avec `--departage-versets` | Phrases / positives | Bonnes / fausses propositions | Rappel | Précision observée |
|---|---:|---:|---:|---:|
| Développement final, réponses HTTP enregistrées rejouées | 344 / 110 | 66 / 0 | 60 % | 100 % |
| Première mesure réservée, après gel initial | 50 / 30 | 18 / 0 | 60 % | 100 % |
| Même extrait, revalidation finale (déjà vu) | 50 / 30 | 17 / 0 | 56,67 % | 100 % |

Le départ conservateur était à 42/110 (38,18 %). Les 68 manquées ont été classées avant correction : 34 paraphrases/variations, 20 fragments très courts, 9 citations noyées/courtes, 4 références de suite sans contexte court, 1 parallèle ambigu. Le premier banc augmenté obtenait 68/110 avec 193 appels réels, dont 1 délai dépassé (abstention). Les 4 extraits durent **1 584,39 s (26,41 min)**. Le dernier passage réseau (`rappel-dev6`) a obtenu 67 bonnes et 1 fausse proposition selon le gold : une simple mention de deux noms, sans citation annotée. Un garde-fou générique des mentions nominales la refuse désormais, y compris si le modèle affirme 0,99.

La mesure **finale après convergence** rejoue les 193 réponses HTTP authentiques du dernier passage, sans refaire d’appel : chaque corps de requête doit être identique. Le premier contrôle reproduisait exactement les 344 décisions réseau avant le filtre nominal (67 bonnes, 1 fausse), puis ce filtre supprimait la seule fausse sans perdre de bonne. Le contrôle suivant reprend le moteur archivé `6270a03` et reproduit toutes ses décisions ; les correctifs de sécurité finaux conservent **66 bonnes sur 110**, zéro fausse. Une paraphrase correcte de Genèse 4:7 est désormais refusée par prudence. Les régressions sur « ne croyez pas que » et la réfutation « Pas du tout ! » ont été corrigées avec des témoins affirmatifs et contradictoires, sans changer recherche, prompt ou seuil.

Les 30 réponses du dernier passage réservé sont vérifiées de la même façon : **17/30**, sans changement de décision. Preuves : `rejeu-convergence-finale-verifie.json`, `rappel-convergence-finale/banc.json` et `rappel-aveugle-convergence-finale/banc.json` ; contrôles antérieurs conservés. Ce protocole mesure l’effet exact des corrections sans sélectionner un nouveau tirage favorable du modèle ; ce n’est pas une nouvelle campagne API ni une nouvelle mesure aveugle. **Zéro fausse proposition observée n’est pas une garantie d’infaillibilité.**

L’extrait réservé est V1jrg_sS2tQ, 5320–5720 s, hors de la fenêtre de développement 4496,16–4912,98 s. Fenêtres fixes de 8 s ; sous-titres automatiques YouTube, **pas la même ASR**. Texte ouvert seulement après gel `f6a9c0e`, annotations écrites avant la première exécution, aucun réglage de poids, seuil, synonymes ou prompt sur ces résultats. Les correctifs suivants proviennent exclusivement de contre-exemples adversariaux des relecteurs ; les deux manquées de cet extrait suggérées par Fable n’ont pas servi à élargir la recherche. La première mesure comportait 30 appels réels, aucune erreur API. La revalidation finale est à 17/30, après correctifs et un autre passage réseau ; le seuil de 60 % n’est donc pas stabilisé sur cet extrait. Ce petit banc d’un même orateur mesure un transfert limité, pas une validation générale indépendante. À titre indicatif, sous l’hypothèse de fenêtres indépendantes, pour la **première mesure** : rappel 18/30, intervalle de Wilson à 95 % **42,3–75,4 %** ; zéro fausse sur 18 propositions donne une borne supérieure exacte unilatérale à 95 % de **15,3 %** pour le taux de fausses, pas 0 %. Pour la revalidation 17/30, l’intervalle de rappel est **39,2–72,6 %** et la borne supérieure du taux de fausses est **16,2 %**. Les fenêtres sont corrélées : ces chiffres ne remplacent pas un essai de culte indépendant.

Délais issus du **dernier passage réseau enregistré**, pour les propositions conservées : recherche des propositions modèle médiane **1,626 s** ; somme ASR historique + pause supposée 0,5 s + recherche médiane **1,254 s** pour toutes les propositions et **2,820 s** pour les seules propositions modèle (p95 toutes propositions **2,963 s**). Extrait réservé : recherche des propositions modèle médiane **1,536 s**, aucune mesure ASR disponible. Ces délais historiques ne sont pas les temps CPU du rejeu déterministe. Rejeu hors temps réel, débit modèle limité sur les horodatages enregistrés ; les pertes de file et l’anti-doublon du direct ne sont pas inclus dans ces rappels.

La recherche locale est chronométrée. Le délai ASR historique du PC et la pause VAD hypothétique de 0,5 s sont séparés : leur somme **n’est pas une nouvelle mesure microphone en régie**. Le rejeu vidéo utilise l’audio d’origine et la transcription enregistrée aux instants correspondants, avec la recherche actuelle et le vrai Studio. Aucun résultat biblique n’est préfabriqué pour la vidéo. La sortie OBS y est explicitement non connectée : les MP4 ne prouvent donc pas visuellement l’absence de diffusion vers OBS. Cette protection est éprouvée séparément par le test navigateur avec relais et contexte OBS distinct.

Reproduction **locale uniquement** (sans modèle, 43/110, 39,09 %, zéro fausse ; score préservé après correctifs), puis vidéos ; depuis la racine du projet, chemins des dépendances à adapter :

```sh
python tools/ecoute/banc_versets.py --source /chemin/vers/asr2.json --sortie artifacts/verset/banc
# DEMO_AUDIO_ROOT contient extrait-V1jrg_sS2tQ.wav et extrait-jwY55s-CoWU.wav du banc original.
DEMO_SCENE=0 node tools/demo-verset.mjs  # référence explicite, culte du 11/10
DEMO_SCENE=2 node tools/demo-verset.mjs  # citation sans référence, même culte
```

Le banc augmenté réellement utilisé est le lanceur de laboratoire `artifacts/verset/banc-rappel.py`, avec son transport `pc-api.py`, conservés dans le worktree de preuve et **hors du paquet opérateur** :

```sh
python artifacts/verset/banc-rappel.py --source /chemin/vers/asr2.json --sortie artifacts/verset/mesure-neuve
python artifacts/verset/banc-rappel.py --source artifacts/verset/aveugle-source.json --gold artifacts/verset/aveugle-gold.json --sortie artifacts/verset/aveugle-neuf
```

Ce lanceur de laboratoire exige le PC joignable par SSH et OBS fermé ; il utilise la clé existante dans le registre sans la copier, ne fait aucune installation et mesure de vrais appels payants. Ne pas l’exécuter pendant un culte. La première commande locale ne reproduit **pas** le rappel augmenté. Le contrôle déterministe final se reproduit avec `python artifacts/verset/rejouer-convergence.py` dans une copie de preuve dont les dossiers de sortie n’existent pas encore ; il n’émet aucune requête réseau.

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

5. Relancer manuellement les lanceurs existants. La préparation de l’index se fait en arrière-plan : Écoute peut déjà sous-titrer, mais aucune proposition biblique avant l’index prêt (voir Connexions). Dans OBS, recharger **le dock et la source navigateur, hors antenne**, pour recevoir le build 2.92 ; confirmer le retour de l’overlay avant toute diffusion. Un ancien overlay doit être actualisé explicitement.
6. **Après accord explicite de Math, avant dimanche** : essai de 75 s avec la vraie entrée audio, vérification parole → proposition, aperçu sans antenne, diffusion manuelle, arrêt/reprise et arrêt du service. Mesurer sur ce PC la latence réelle et vérifier les clés absentes du journal. Ce test n’est pas remplacé par le rejeu fourni.

## Retour arrière préparé

Arrêter manuellement les deux programmes, puis inspecter et appliquer :

```text
python installer-versets.py --retour "C:\chemin\VerseObs-retour-versets-…"
python installer-versets.py --retour "C:\chemin\VerseObs-retour-versets-…" --appliquer --accord-math
```

Le retour restaure les octets d’origine et retire uniquement les nouveaux fichiers installés par ce paquet. Il refuse d’écraser une modification inconnue. Après une erreur partielle, la même commande de retour est reprenable : les fichiers déjà revenus à leur empreinte initiale et les nouveaux fichiers déjà retirés sont reconnus. Toute autre empreinte reste refusée. Relancer les anciens lanceurs et recharger le dock. Le test automatique `python tools/test-installer-versets.py` vérifie inspection, application, relecture, retour exact et refus d’une modification locale.

## Vérification de développement

```sh
npm run check
npm test
python -m unittest discover -s tools/ecoute -p 'test_*.py'
node tests/browser-heard.mjs
```

`test_versets_service.py` exerce aussi le Service complet, un fichier WAV synthétique, des API HTTP locales simulées, le vrai index et le vrai relais Node : proposition avant traduction, arrêt/effacement et aucune commande antenne. Ce test de câblage n’est pas une mesure ASR ou microphone.

Le nouveau test navigateur utilise un relais réel et un contexte OBS séparé : aucune commande SHOW à la réception ou au chargement, programme déjà occupé inchangé, seuil, chapitre seul, arrêt, déconnexion et largeurs 920/600/360/320. `tools/verify-heard.py` lance les suites navigateur complètes puis les sections paired, habillages et onglet avec leur vrai lanceur, même si une étape précédente échoue. Il consigne les codes retour et vérifie que les sources sont restées immuables. Sur le VPS, toute exécution lourde doit être précédée de `flock /tmp/brainmood-heavy.lock`.
