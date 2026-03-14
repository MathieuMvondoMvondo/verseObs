# VerseObs

Extension OBS pour afficher des versets bibliques en overlay (lower-third) pendant vos streams et enregistrements.

![Lower Third Preview](https://img.shields.io/badge/OBS-Compatible-green?style=flat-square) ![Offline](https://img.shields.io/badge/100%25-Hors--ligne-blue?style=flat-square) ![Bibles](https://img.shields.io/badge/12-Bibles-orange?style=flat-square)

## Fonctionnalités

- **12 versions de la Bible** incluses (9 FR + 3 EN), fonctionnement 100% local
- **Lower-third élégant** : pilule de référence + card translucide avec numéro de verset en exposant
- **Recherche intelligente** : tapez `Jean 3:16`, `Jn 3:16-18` ou recherchez par texte
- **Navigation** : parcourez livre → chapitre → verset avec les dropdowns ou les raccourcis clavier
- **Mode texte libre** : affichez des paroles de chants, annonces, prières
- **Personnalisation complète** : position, animation, police, couleurs, opacité, taille...
- **Historique** : retrouvez les 50 derniers versets affichés
- **Communication temps réel** entre le dock de contrôle et l'overlay via BroadcastChannel

## Bibles incluses

### Français (9 versions)
| Version | Abréviation |
|---------|-------------|
| Louis Segond 1910 | LSG |
| Bible du Semeur | SEM |
| Nouvelle Bible Segond | NBS |
| Martin 1744 | MAR |
| Darby Français | DRB |
| Crampon 1923 | CRA |
| Perret-Gentil et Rilliet | PGR |
| Oltramare 1874 | OLT |
| Genève 1669 | GEN |

### Anglais (3 versions)
| Version | Abréviation |
|---------|-------------|
| King James Version | KJV |
| Darby English | DBY |
| Amplified Bible | AMP |

## Installation (2 minutes)

### Prérequis

- [OBS Studio](https://obsproject.com/) (25.0+)
- C'est tout ! Aucune installation supplémentaire nécessaire.

### Étape 1 : Ajouter l'overlay (ce que vos spectateurs voient)

1. Dans OBS, allez dans **Sources** → **+** → **Navigateur** (Browser Source)
2. Nommez-le `VerseObs`
3. URL :
   ```
   https://mathieumvondomvondo.github.io/verseObs/browser_source.html
   ```
4. Largeur : `1920` / Hauteur : `1080` (ou votre résolution de stream)
5. **Décochez** "Arrêter la source quand elle n'est pas visible"
6. Cliquez OK

### Étape 2 : Ajouter le panneau de contrôle (votre interface)

1. Menu **Docks** → **Docks de navigateur personnalisés** (Custom Browser Docks)
2. Ajoutez une entrée :
   - Nom du dock : `VerseObs`
   - URL :
     ```
     https://mathieumvondomvondo.github.io/verseObs/control_panel.html
     ```
3. Cliquez OK
4. Le dock apparaît — glissez-le où vous voulez dans l'interface OBS

> **C'est prêt !** Vous pouvez utiliser ces mêmes URLs sur n'importe quel ordinateur avec OBS. Aucun serveur local nécessaire.

---

<details>
<summary><strong>Alternative : installation locale (optionnel)</strong></summary>

Si vous préférez héberger VerseObs localement (sans connexion internet) :

1. Installez [Node.js](https://nodejs.org/) (16+)
2. Clonez le projet :
   ```bash
   git clone https://github.com/MathieuMvondoMvondo/verseObs.git
   cd verseObs
   ```
3. Lancez le serveur local :
   ```bash
   npm run serve
   ```
4. Utilisez ces URLs dans OBS à la place :
   - Overlay : `http://localhost:8080/browser_source.html`
   - Panneau de contrôle : `http://localhost:8080/control_panel.html`

> Laissez le serveur tourner pendant toute votre session OBS.

</details>

## Utilisation

### Afficher un verset

1. Sélectionnez une **version** (LSG, Semeur, etc.)
2. Tapez une référence dans la barre de recherche (`Jean 3:16`, `Ps 23:1`, `Rom 8:28`)
3. Ou naviguez avec les dropdowns Livre → Chapitre → Verset
4. Cliquez **Afficher** ou appuyez sur `Ctrl+Enter`

### Masquer le verset

- Cliquez **Masquer** ou appuyez sur `Échap`

### Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+Enter` | Afficher le verset / texte libre |
| `Échap` | Masquer |
| `Ctrl+←` | Verset précédent |
| `Ctrl+→` | Verset suivant |
| `Ctrl+F` | Focus sur la recherche |

### Mode texte libre

Passez à l'onglet **Texte libre** pour afficher n'importe quel texte : paroles de chants, annonces, prières, etc.

### Paramètres

L'onglet **Paramètres** permet de personnaliser :

- **Position** : Lower-third, Upper-third, Centre, Plein écran
- **Animation** : Fade, Slide, Typewriter, Aucune
- **Typographie** : police, taille, couleur du texte et de la référence
- **Arrière-plan** : couleur, opacité, ombre, rayon de bordure
- **Auto-masquer** : timer configurable (5s à 60s)

Les paramètres sont sauvegardés automatiquement dans le navigateur.

## Structure du projet

```
verseObs/
├── control_panel.html          # Interface de contrôle (dock OBS)
├── browser_source.html         # Overlay transparent (source navigateur OBS)
├── assets/
│   ├── css/
│   │   ├── control.css         # Thème sombre pour le dock
│   │   └── display.css         # Styles de l'overlay
│   └── js/
│       ├── shared/             # Code partagé (constantes, livres, communication)
│       ├── control/            # Modules du panneau de contrôle
│       └── display/            # Modules de l'overlay
├── data/
│   ├── bibles/                 # Fichiers JSON des Bibles (générés)
│   │   └── index.json          # Registre des versions
│   └── books/                  # Noms des livres FR/EN
├── tools/                      # Scripts de téléchargement et conversion
└── package.json
```

## Architecture technique

- **HTML/CSS/JS pur** — zéro dépendance runtime, pas de framework
- **Pas de modules ES** — compatible `file://`, scripts classiques avec namespace `window.VerseObs`
- **Communication** : BroadcastChannel API avec fallback localStorage pour la communication entre le dock et l'overlay
- **Données** : fichiers JSON locaux (~5 MB par Bible), chargés avec fetch + fallback XMLHttpRequest

## Sécurité

- **100% statique** : aucun serveur backend, aucune base de données
- **Aucune donnée personnelle** collectée — pas de cookies, pas de tracking, pas d'analytics
- **Hébergé sur GitHub Pages** : HTTPS par défaut, code source ouvert et vérifiable
- **BroadcastChannel** : la communication entre le dock et l'overlay est limitée au même domaine — personne d'autre ne peut envoyer de commandes à votre overlay

## Licence

Les textes bibliques inclus proviennent de sources dans le domaine public ou sous licence libre :
- [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) (domaine public)
- [getbible.net](https://getbible.net/) (API publique)
- [bolls.life](https://bolls.life/) (API publique)

Le code source de VerseObs est sous licence MIT.
