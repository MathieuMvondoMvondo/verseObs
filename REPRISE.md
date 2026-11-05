# Reprise — Verset entendu

## Garde-fous
- Worktree : `/home/ubuntu/work/verseobs-verset-entendu-20261104`, branche `feat/verset-entendu-20261104`.
- Base canonique prouvée par ascendance : `0d70401` (`ecoute-banc2-20261102`) contient `origin/main` (`9a0df90`), toute Écoute et GPT-6.1 Terra. Aucune copie concurrente d’Écoute.
- Source `/home/ubuntu/work/projects-20260906/sources/verseobs` inchangée ; service `project-verseobs-preview`, PID initial 1191, port 8080, intouchable.
- Aucun push, déploiement ni installation sur le PC sans validation de Math. Commits auteur ET committer MathieuMvondoMvondo <mathieu.mvondo-mvondo@supinfo.com> par variables d’environnement.
- Exécutions lourdes sous `flock /tmp/brainmood-heavy.lock`.

## Conception en cours
- Analyse déterministe des références françaises et recherche lexicale dans les 12 fichiers locaux, côté Python, avant la traduction pour ne pas ajouter son délai.
- Référence et texte issus des données locales ; abstention en cas d’incertitude ; départage optionnel limité aux candidats lexicaux.
- Carte Studio : préparer dans l’aperçu uniquement ; aucune commande SHOW à la réception ni au chargement.
- Tests RED/GREEN, navigateur réel, démo à partir des bancs déjà enregistrés (distinguer rejeu des transcriptions mesurées et nouvelle transcription audio).

## Sources du banc retrouvées
`/home/ubuntu/work/verseobs-ecoute-choix-20261102/artifacts/banc/` et `.../banc2/` : audio WAV, asr.json/asr2.json, bornes et transcriptions. Ne pas les modifier.

## État intermédiaire — avant revue finale
- Analyseur, concordance, service Python et carte Studio écrits ; intégration avant traduction, travailleur isolé, arrêt et génération protégés.
- Index : 377289 entrées dans les 12 fichiers ; Crampon `cra.json` incohérent (livres décalés), mis en quarantaine. Les données source ne sont pas corrigées arbitrairement. 11 versions admissibles.
- Premiers 7 tests Python verts. Tests étendus (contexte, faux amis, API), npm et Chromium en cours. Build cache 2.91, y compris les `&v=` des iframes.
- Banc : 344 phrases réelles, annotations manuelles par phrase dans `tests/fixtures/heard-gold.json`. Première passe 41 vrais / 43 propositions ; correction d'un faux contexte « Jean 21 / Un peu plus vite » et de deux annotations oubliées du fragment littéral « mais le don gratuit de Dieu ». Ancien résultat conservé dans les journaux/probe. Nouveau passage nécessaire.
- Les métriques de délai seront distinguées : recherche locale mesurée ; ASR historique du PC ; pause VAD de 0,5 s hypothétique. Ne pas présenter la somme comme une nouvelle mesure microphone.
- Revues indépendantes 1 : Fable et Astra demandent des corrections (conservées sous artifacts/verset/revue1). Corrigés : faux noms propres, ponctuation, ordinal ambigu, nombre hors limites, plage complète dans aperçu, annulation de chargement après sélection manuelle, génération Écoute acquittée sur le fil, invalidation du contexte après une phrase sautée. Tests rouge/vert conservés ; 18 tests versets Python + régressions Studio verts.
- Le départage modèle reste désactivé par défaut, et toujours désactivé si un plafond euros est configuré. L’index se charge désormais sans bloquer les sous-titres. Carte plus discrète, boutons 14 px, hauteur stable pendant l’écoute, diagnostic déplacé vers Connexions.
- Commit initial `833b772`, revue 2 Fable+Astra : REQUEST_CHANGES. Nouveau blocage reproduit en rouge : enchaînement différé bilingue diffusant une plage entendue. Corrigé par annulation dès Charger et génération/cible complète des diffusions différées, scénario vert en JSDOM et Chromium réel.
- Corrections de revue 2 : carte compacte, chapitre/v.1 toujours visible à 320 px (test de hit-test), variante ASR en chiffres des noms propres refusée, plages incomplètes rejetées, écriture atomique et panne partielle testée, avertissement explicite avant changement de version. Aucun changement automatique de versification.
- Vérification figée 833b772 conservée dans artifacts/verset/verification-833b772 : check/npm/Python 77 tests/installer verts ; dock/captions/heard/paired/habillages/onglet verts ; motion rouge (15,5 px/image) et studio rouge (saisie 272 ms). Source inchangée prouvée. Comparer à la base et rejouer ; ne pas dire tout vert.
- Ancienne démo-0 accélérée découverte par Astra ; ancien scénario 2 tronqué avant la phrase décisive. Script refait avec horodatages réels et concat PTS, fixture 2 prolongée avec les phrases ASR originales non modifiées. Il faut régénérer, inspecter les images extraites du MP4 avant/après apparition, puis obtenir revue 3.
- Commit `2ca55d1` : 12 barrières finalement vertes, sources figées ; 77 tests Python, vraies suites Chromium y compris Studio complet. Vidéos synchronisées 23/29 s réellement validées, audio comparé aux WAV originaux (similarités >0,9996). Paquet de 30 fichiers essayé sur copies des deux bases, rollback exact par empreintes.
- Revue 3 : Fable APPROVE (8/10), Astra REQUEST_CHANGES (3 points réels : sélecteur verrouillé par chargement remplacé, avertissement de version périmé, corrections/plages orales incertaines). Corrigés avec ownership du chargement, annulation ciblée, annonce recalculée et garde au clic, résultat d'analyse incluant abstention forcée jusqu'à Finder. Contre-exemples voisins ajoutés (énumération après un chapitre, variantes chiffres/lettres, fallback lexical interdit après hésitation). Tests ciblés verts ; banc inchangé : 42/110, aucune fausse proposition.
- Test supplémentaire `test_versets_service.py` vert : vrai Service → API HTTP locale factice → index réel → vrai relais Node, proposition avant traduction, arrêt et aucune commande antenne. Le WAV est synthétique ; ce n’est pas un test micro.
- Prochaines obligations : barrière globale finale sur le dernier commit, deux vidéos régénérées avec commit inscrit dans leurs mesures, revue 4 ciblée Fable+Astra, paquet actualisé et testé. Aucun déploiement ni installation PC ; ne pas élargir en suivi long de chapitre ou conversion de version avant validation dédiée.
