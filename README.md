# VerseObs Studio

Une régie biblique pour OBS : préparez un passage, organisez votre conducteur et diffusez au moment choisi. Interface en français, douze traductions locales, aucun compte requis.

## Démarrer en local

Avec Node.js 18 ou plus récent :

```sh
npm install
npm start
```

Ouvrez [le studio](http://127.0.0.1:8080/control_panel.html).

Le serveur écoute uniquement sur cet ordinateur. Son relais WebSocket relie le navigateur, le dock OBS et la source, même lorsque leurs espaces de stockage sont séparés. Laissez le serveur ouvert pendant la session.

## Connecter OBS

Dans l’onglet **Connexions**, copiez les adresses générées pour votre installation.

1. **Sources → + → Navigateur** : collez l’adresse de la source, largeur `1920`, hauteur `1080`. Décochez « Arrêter la source quand elle n’est pas visible ».
2. **Docks → Docks de navigateur personnalisés** : ajoutez l’adresse du panneau.
3. Diffusez un passage pour vérifier le résultat dans OBS.

Adresses locales par défaut :

- Studio : `http://127.0.0.1:8080/control_panel.html`
- Source transparente : `http://127.0.0.1:8080/browser_source.html`
- Projection avec fond sombre et bouton plein écran : `http://127.0.0.1:8080/browser_source.html?projector=1`

**Sortie connectée** signifie qu’une page de sortie répond. **Sortie confirmée** signifie que cette page a terminé son affichage. Ces indications ne confirment pas que la scène OBS est active ou que le stream est démarré. Une sortie de test compte comme une sortie.

Référence officielle : [source Navigateur d’OBS](https://obsproject.com/kb/browser-source).

## Préparer et diffuser

- Cherchez `Jean 3:16`, `Jn 3:16-18`, un mot-clé ou une `"phrase exacte"`. La recherche ignore la casse et les accents et tolère certaines fautes.
- Explorez le chapitre avec la liste de versets ou les sélecteurs.
- Modifiez le texte préparé et sa mise en forme. **Diffuser le passage** envoie exactement cette préparation.
- Changer de sélection, de version, utiliser les favoris ou la recherche rapide prépare le passage sans le diffuser.
- **Masquer**, ou `Échap`, retire le contenu de la sortie. Une commande de masquage reste prioritaire pendant une animation.

Le moniteur **Préparation** représente votre prochain passage ; **Sortie** représente les dernières commandes de diffusion reçues. Ce moniteur ne capture pas la composition OBS. L’aperçu est recentré sur le bandeau ; **Voir le cadre complet** affiche le format 16:9. Dans un petit dock, l’aperçu s’ouvre à la demande et les commandes de diffusion restent en bas de l’écran.

Les réglages d’habillage s’appliquent au contenu diffusé du même type. Les textes et chants ont leur propre habillage, accessible dans leur onglet, avec les styles Chant, Annonce, Prière et Citation. Ajuster le style biblique ne modifie pas un chant à l’antenne.

## Deux traductions en même temps

Dans Bible, activez **Deux versions**, puis choisissez la seconde traduction. La première version apparaît au-dessus, la seconde en dessous, chacune identifiée. Louis Segond + King James est le choix initial ; toutes les combinaisons de versions locales sont possibles.

Les deux textes suivent le même livre, chapitre et numéro de verset, y compris les plages. Le deuxième texte reste modifiable avant diffusion. Le conducteur, son export, l’historique et la copie conservent les deux traductions. Changer une version ou désactiver le mode prépare le prochain rendu sans remplacer le direct. Si un passage manque dans la deuxième version, la diffusion est bloquée jusqu’à correction du choix. Les différences de numérotation entre traductions ne font pas l’objet d’une correspondance automatique. En mode bilingue, l’effet machine à écrire est remplacé par un fondu commun.

## Un conducteur pour l’équipe

Ajoutez vos passages et textes avec **Ajouter au conducteur**. Sur grand écran, le conducteur reste visible à côté de votre préparation.

- Sélectionnez un élément, puis cliquez **Diffuser la sélection**.
- Les flèches précédent/suivant changent la sélection ; les petites flèches de chaque ligne changent l’ordre.
- Nommez votre session : le nom, les textes, leur ordre et la sélection sont conservés localement.
- **Exporter** produit un fichier `.verseobs.json` avec les textes et leur mise en forme. Votre équipier peut l’importer sur un autre ordinateur.
- **Importer** ajoute les éléments aux préparations existantes ; les contenus du fichier sont validés avant application.
- **Imprimer** propose un conducteur lisible avec les textes complets.
- **Vider le conducteur** peut être annulé tant que le studio reste ouvert.

Le conducteur est limité à 500 éléments. Le transfert par fichier est explicite ; il n’existe pas de synchronisation collaborative dans le cloud.

### Coller un plan

Dans le conducteur, **Coller un plan** ouvre une fenêtre où vous collez votre message, votre plan de prédication ou votre déroulé. Pendant la frappe, VerseObs liste les références trouvées dans l’ordre du texte, avec leur passage dans la version active et la ligne d’origine. Décochez ce que vous ne voulez pas, puis **Ajouter N passages au conducteur** (ou `Ctrl/⌘ + Entrée`).

- Écritures reconnues : `Jean 3:16`, `Jean 3.16`, `Jean 3 v 16`, `Jean 3 verset 16`, `Jn 3,16`, `Rm 8.28-30`, `Ps 23` (chapitre entier, un seul élément), `1 Co 13:4-7`, `II Corinthiens 5:17`, `Jean 3:16 ; 5:24`, `Jean 3:16, 18`, `Jean 3 versets 16 à 18`, `Jude 24`. Les livres s’écrivent avec ou sans accents, en entier ou abrégés (`Ésaïe`, `Esaie`, `Es`, `Is`).
- Les heures (`à 10:30`, `10h30`, `10:30-11:00`), les dates (`25.10`), les nombres seuls, un prénom suivi d’une quantité (`Marc 2 chants`) et un nom de livre sans chiffre ne sont pas pris pour des références.
- `3:16` sans livre n’est rattaché qu’à une référence de la même phrase (`Jean 3:16 et plus loin 5:24`). Sinon, comme une plage sur deux chapitres, un livre en minuscules sans verset ou un chapitre/verset absent de la version active, la ligne apparaît dans **À vérifier** et n’est pas ajoutée.
- Si **Deux versions** est actif, chaque passage reçoit la deuxième traduction, exactement comme un ajout manuel ; un passage absent de la deuxième version n’est pas ajouté.
- Au plus 200 passages et 20 000 caractères par collage. L’ajout est complet ou n’a pas lieu (limite de 500 éléments du conducteur).

## Textes et chants

Préparez des paroles, une annonce ou une prière. Votre brouillon est conservé lorsque vous rechargez le studio. Les textes nommés restent disponibles dans votre bibliothèque.

Séparez les couplets par une ligne vide, puis cliquez **Créer une diapositive par couplet** pour ajouter les diapositives numérotées au conducteur.

## Habillage intuitif

Trois bases visuelles : **Studio**, **Papier**, **Cinéma**. Les styles historiques restent accessibles dans les détails.

- **L’essentiel** : position, largeur, police, taille, couleur, opacité, apparition et délai de masquage.
- **Les détails** : référence, bordure, interligne, couleurs, image de fond et durée de transition.
- **Sauvegarde** : exporter/restaurer les données durables du studio ou réinitialiser l’habillage.

L’aperçu des paramètres reste compact. Les sauvegardes n’incluent jamais les commandes temporaires de diffusion. L’import est validé avant modification et restaure les anciennes valeurs si une écriture échoue.

## Raccourcis

`Ctrl` sur Windows/Linux, `⌘` sur Mac.

| Raccourci | Action |
| --- | --- |
| `Ctrl/⌘ + Entrée` | Diffuser la préparation ou la sélection du conducteur ; ajouter les passages dans « Coller un plan » |
| `Échap` | Masquer la sortie ; fermer d’abord une aide/recherche ouverte |
| `Ctrl/⌘ + K` | Recherche rapide ; Entrée prépare le résultat |
| `Ctrl/⌘ + F` | Rechercher dans la Bible |
| `Ctrl/⌘ + ← / →` | Préparer le passage ou l’élément précédent/suivant |
| `?` | Aide |

Les onglets se parcourent aussi avec les flèches du clavier. Les transitions respectent la préférence de réduction des animations.

## Traductions

Les douze jeux de données du dépôt sont conservés : LSG, NBS, SEM, MAR, DRB, CRA, PGR, OLT, GEN, KJV, DBY et AMP. Les fichiers locaux sont chargés à la demande. Aucune API distante n’est nécessaire pour les versions incluses avec le serveur local.

Les outils de téléchargement/conversion se trouvent dans `tools/`. Leurs fournisseurs et les droits de redistribution propres à chaque traduction doivent être vérifiés avant de redistribuer les données ; l’accès public à une API ne constitue pas une licence de redistribution.

## Hébergement statique

Le studio reste compatible avec GitHub Pages et d’autres serveurs statiques. Les routes historiques `control_panel.html` et `browser_source.html` sont conservées ; la racine ouvre le studio.

En hébergement statique, la communication utilise BroadcastChannel et localStorage. Le panneau et la sortie doivent partager la même origine et un espace navigateur compatible. Un navigateur externe et OBS peuvent être isolés : utilisez alors `npm start` avec les adresses locales. Le relais ne fonctionne pas sur GitHub Pages.

## Développement et vérification

```sh
npm run check
npm test
```

- `check` vérifie la syntaxe JavaScript, les identifiants HTML et la présence des assets.
- Les tests couvrent recherche, plages de versets, repérage des références d’un plan (faux positifs compris), préparation distincte du direct, conducteur, import, animations concurrentes, déduplication et relais local.
- Aucun framework ni dépendance JavaScript tiers n’est chargé par le frontend. `ws` est utilisé uniquement par le serveur local ; `jsdom` sert uniquement aux tests.
- Les icônes Lucide sont incluses dans `assets/icons/`, avec leur licence.

Le serveur local n’expose que les pages et assets du produit, refuse les origines WebSocket externes et ne conserve pas les commandes en mémoire après redémarrage. Aucun service d’analyse ni collecte de données n’est ajouté.
