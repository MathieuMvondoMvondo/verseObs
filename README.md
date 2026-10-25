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

1. **Sources → + → Navigateur** : collez l’adresse de la source, largeur `1920`, hauteur `1080`. Décochez « Arrêter la source quand elle n’est pas visible ». La sortie compose toujours le même cadre de 1080 lignes, mis à l’échelle de la source : en `1280 × 720` ou en `3840 × 2160`, elle montre exactement ce que montrent les moniteurs du Studio (mêmes versets, même ajustement).
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

Une couleur par état, partout (Studio, conducteur, téléphone) : **rouge** = ce que voit le public, **ambre** = commande envoyée mais pas encore confirmée par la sortie (ou action à faire), **vert** = l’aperçu, **bleu** = ce que vous sélectionnez, **ivoire** = le bouton qui met à l’antenne. Le bandeau **Antenne** reste toujours à sa place : « Rien n’est diffusé », « Commande de diffusion », « Sortie confirmée » ou « Sortie partielle », avec la référence et **Masquer**. Dans le conducteur, l’élément diffusé porte l’étiquette « À l’antenne », distincte de la sélection : la sortie renvoie l’identifiant de l’élément qu’elle montre, si bien qu’un même verset présent deux fois ou deux textes sans titre ne s’allument jamais ensemble.

En tête de la régie, comme le Studio Mode d’OBS : **Aperçu** à gauche (votre prochain passage, ou la sélection du conducteur), **Antenne** à droite (les dernières commandes de diffusion reçues, cadre rouge), à partir de 1280 px de large. Chaque moniteur montre le cadre 16:9 complet, avec le même ajustement que la vraie sortie. Ce moniteur ne capture pas la composition OBS. Plus étroit, un sélecteur montre l’un ou l’autre ; le bandeau Antenne reste visible. Si un passage doit être réduit, le pied du moniteur l’indique. Si l’ordinateur OBS demande moins d’animations (réglage du système), le Studio l’indique sous le moniteur Antenne.

### Longs passages
Un tiers inférieur ou supérieur se lit comme des sous-titres : le bandeau couvre au plus 40 % du cadre, avec 4 lignes de lecture au plus ; le texte est réduit pour tenir, jamais sous 32 px en 1080p. Un passage plus long n’est jamais transformé en mur de texte : la sortie montre ses premiers versets entiers et la référence à l’antenne les nomme (« Psaumes 23:1-3 »), le Studio l’annonce (« Sortie partielle ») et l’aperçu propose **Découper en N plans**. Les plans sont calculés par la sortie, avec ses polices : chacun tient dans le bandeau. Un clic remplace l’élément du conducteur par ses plans (ou, depuis la Bible, les ajoute au conducteur) ; **Regrouper**, sur un plan sélectionné, rétablit le passage. Les plans sont des éléments ordinaires : Suivant/Précédent, au Studio comme sur le téléphone, les parcourent. Rien n’est jamais découpé automatiquement.

Les réglages d’habillage s’appliquent au contenu diffusé du même type. Les textes et chants ont leur propre habillage, accessible dans leur onglet, avec les styles Chant, Annonce, Prière et Citation. Ajuster le style biblique ne modifie pas un chant à l’antenne.

## Deux traductions en même temps

Dans Bible, activez **Deux versions**, puis choisissez la seconde traduction. La première version apparaît au-dessus, la seconde en dessous, chacune identifiée. Louis Segond + King James est le choix initial ; toutes les combinaisons de versions locales sont possibles.

Les deux textes suivent le même livre, chapitre et numéro de verset, y compris les plages. Le deuxième texte reste modifiable avant diffusion. Le conducteur, son export, l’historique et la copie conservent les deux traductions. Changer une version ou désactiver le mode prépare le prochain rendu sans remplacer le direct. Si un passage manque dans la deuxième version, la diffusion est bloquée jusqu’à correction du choix. Les différences de numérotation entre traductions ne font pas l’objet d’une correspondance automatique. À l’antenne, dans un bandeau, les deux traductions sont côte à côte, chaque version nommée, au même corps (4 lignes au plus chacune) ; au centre ou en plein écran, la seconde est en italique sous un filet.

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

## Télécommande sur téléphone

Un téléphone connecté au même Wi-Fi peut piloter le conducteur : **Précédent**, **Suivant**, **Diffuser la sélection** et **Masquer**. La télécommande affiche le nom de la session, l’élément sélectionné, le suivant et l’état de la sortie (**Sortie confirmée** comme dans le Studio).

La télécommande demande le serveur local : elle ne fonctionne pas avec la version GitHub Pages ni avec un hébergement statique.

1. Lancez `npm start -- --lan`, ou lancez `npm start` puis, dans **Connexions**, cliquez **Activer le mode réseau local**. Le mode est désactivé par défaut et reste limité à cette exécution du serveur.
2. Scannez le QR code affiché dans **Connexions** avec l’appareil photo du téléphone. Gardez la page ouverte pendant le culte : elle se reconnecte seule et signale clairement une connexion perdue.
3. Après le culte, cliquez **Désactiver le mode réseau** (ou arrêtez le serveur).

Sécurité :

- Le serveur écoute alors sur les adresses privées de l’ordinateur (Wi-Fi/Ethernet), sur le même port que le Studio, ou un port libre s’il est pris. L’avertissement reste visible tant que le mode est actif. Sur Mac, autorisez Node.js dans la demande du pare-feu si elle apparaît.
- Le QR code contient un code d’appairage aléatoire (144 bits), différent à chaque activation et jamais écrit dans la console. **Révoquer et changer le code** coupe immédiatement les télécommandes connectées. Ne montrez pas le QR code à l’écran.
- Sans code valide, la connexion est refusée ; les échecs répétés sont bloqués temporairement. Une télécommande ne peut envoyer que les quatre commandes, avec une limite de débit ; elle ne peut ni modifier le texte ni l’habillage, ni ouvrir le Studio. Les adresses réseau ne servent que la page de télécommande.
- Le trafic du réseau local n’est pas chiffré (HTTP) : utilisez un Wi-Fi de confiance.
- Si plusieurs fenêtres du Studio sont ouvertes, la première reçoit les commandes ; **Piloter cette fenêtre** transfère la main.

Le QR code est généré localement (`assets/js/shared/qrcode.js`, adapté de la bibliothèque MIT de Project Nayuki, licence dans `assets/js/shared/qrcode.LICENSE.txt`), sans CDN ni appel réseau.

## Textes et chants

Préparez des paroles, une annonce ou une prière. Votre brouillon est conservé lorsque vous rechargez le studio. Les textes nommés restent disponibles dans votre bibliothèque.

Séparez les couplets par une ligne vide, puis cliquez **Créer une diapositive par couplet** pour ajouter les diapositives numérotées au conducteur.

## Habillage antenne

L’habillage par défaut, **Antenne**, est conçu pour la vidéo :

- un **bandeau** d’encre pleine largeur, dense derrière le texte et adouci vers l’image, dans la zone de sécurité titre (5 % des bords, EBU R 95) ;
- la **référence en marge** — livre, puis chapitre et versets en grands chiffres, puis la version — contre un **axe** safran ; la colonne de lecture en Lora (environ 60 signes par ligne), numéros de verset en safran ;
- les polices (Lora, Archivo Narrow, licence SIL OFL) sont livrées dans `assets/fonts/` : aucun service externe n’est appelé.

**Mouvement** (« Révélation », par défaut) : à l’entrée, le bandeau se pose, l’axe se trace, la référence monte de sa fente et le texte se révèle dans l’ordre de lecture. Au changement de passage, le bandeau et l’axe restent à l’antenne et s’adaptent à la nouvelle hauteur ; seuls les chiffres qui changent défilent quand on reste dans le même livre. La sortie est courte. Toute commande peut arriver pendant une animation : la dernière l’emporte et repart de ce qui est à l’écran, sans flash ni texte coupé. Aucun mouvement continu à l’antenne. Avec la préférence système de réduction des animations, seuls des fondus courts restent. « Fondu », « Glissement » et « Aucune » restent disponibles.

**Longs passages** : le texte (jamais la référence) est réduit juste assez pour tenir dans la moitié du cadre en tiers inférieur. S’il fallait descendre sous 72 % de sa taille, il occupe plutôt toute la zone de sécurité, puis seulement se réduit davantage. Un texte qui ne tient pas même ainsi est signalé dans le Studio avant diffusion.

Les bases **Studio**, **Papier**, **Cinéma** et les styles historiques gardent la **carte encadrée** (réglage **Mise en page**). Un habillage biblique resté sur l’ancienne base par défaut (Studio) prend le look Antenne (couleurs, polices, tailles, mise en page) mais garde vos réglages de diffusion : position, masquage automatique, animation, durée, largeur et alignement. « Machine à écrire » devient « Révélation », qui conserve la mise en forme et les numéros de verset. Les chants ne changent pas : la carte centrée reste leur style par défaut, et le style **Antenne** (paroles sur le bandeau) est proposé en option avec Chant, Annonce, Prière et Citation.

- **L’essentiel** : mise en page, position, largeur, police, taille, couleur, opacité, apparition et délai de masquage.
- **Les détails** : interligne, couleurs (l’accent colore l’axe et les numéros en mise en page Antenne), durée de transition ; avec la carte : référence, bordure et image de fond.
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

En hébergement statique, la communication utilise BroadcastChannel et localStorage. Le panneau et la sortie doivent partager la même origine et un espace navigateur compatible. Un navigateur externe et OBS peuvent être isolés : utilisez alors `npm start` avec les adresses locales. Le relais et la télécommande sur téléphone ne fonctionnent pas sur GitHub Pages.

## Développement et vérification

```sh
npm run check
npm test
# facultatif, dans un vrai Chromium (playwright-core fourni par vos soins) :
PLAYWRIGHT_CORE=/chemin/playwright-core/index.mjs CHROMIUM=/chemin/chrome npm run test:browser
```

- `check` vérifie la syntaxe JavaScript, les identifiants HTML et la présence des assets.
- Les tests couvrent recherche, plages de versets, repérage des références d’un plan (faux positifs compris), préparation distincte du direct, conducteur, import, animations concurrentes, déduplication, relais local, QR code et télécommande (refus sans code ou après révocation, liste blanche, limite de débit, parcours complet jusqu’à la source), états antenne/aperçu du Studio et du téléphone, migration des habillages enregistrés.
- `test:browser` échantillonne chaque image de la vraie source navigateur : entrée sans saut, bandeau qui ne quitte jamais l’antenne entre deux passages, défilement des chiffres, changements rapides, changement de position sans saut, masquage pendant une entrée, reprise pendant une sortie, chapitre long en versets entiers (bandeau ≤ 40 %, corps ≥ 32 px), double traduction, réduction des animations (opacité seule). Il vérifie aussi la régie dans Chromium : moniteurs côte à côte dès 1280 px et fidèles à la sortie, sorties 720p, 1080p et 4K identiques au moniteur (Psaumes 23, les plans de Psaumes 119:1-48, le bilingue), découpage de Psaumes 119:1-48 et de Romains 8:28-39 bilingue, chant centré par défaut, aucun texte sous 12 px (Bible, Conducteur, Habillage, téléphone), focus clavier visible, cibles tactiles ≥ 44 px sur le téléphone. Sans les deux variables, il est ignoré.
- Aucun framework ni dépendance JavaScript tiers n’est chargé par le frontend. `ws` est utilisé uniquement par le serveur local ; `jsdom` sert uniquement aux tests.
- Les icônes Lucide sont incluses dans `assets/icons/`, avec leur licence ; les polices Lora et Archivo Narrow dans `assets/fonts/`, avec leur licence SIL OFL.
- La sortie utilise la Web Animations API (moteur Chromium 84 ou plus récent) ; un moteur plus ancien affiche chaque état sans animation.

Le serveur local n’expose que les pages et assets du produit, refuse les origines WebSocket externes et ne conserve pas les commandes en mémoire après redémarrage. Hors mode réseau local, il n’écoute que sur `127.0.0.1`. Aucun service d’analyse ni collecte de données n’est ajouté.
