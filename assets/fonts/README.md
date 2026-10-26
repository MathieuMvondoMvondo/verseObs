# Polices de l'habillage antenne

Sous-ensembles WOFF2 (latin, latin-1, œ/Œ, ponctuation française) des polices variables
publiées par Google Fonts, sous licence SIL Open Font License 1.1 (textes joints) :

- `Lora-wght.woff2`, `Lora-Italic-wght.woff2` — Lora (lecture), graisses 400 à 700.
- `ArchivoNarrow-wght.woff2` — Archivo Narrow (références, chiffres, étiquettes), 400 à 700.
- `Inter-Regular.woff2`, `Inter-SemiBold.woff2` — Inter 4.0 (style « Onglet » : texte, onglet,
  étiquettes), graisses 400 et 600, licence dans `OFL-Inter.txt`. Choisie pour l'onglet parce
  qu'aucune des deux polices déjà fournies n'est une sans-sérif de lecture : Lora est une
  sérif, Archivo Narrow est condensée et fatigue sur quatre lignes. Inter a un grand œil
  (hauteur d'x 0,55) et des formes ouvertes qui restent nettes dans un flux compressé.

Elles sont servies localement : aucune requête vers un service de polices.
Inter vient des fichiers OTF statiques du paquet Debian `fonts-inter` (4.0), sous-ensemble
`U+0020-007E,U+00A0-00FF,U+0100-017F,U+0152-0153,U+0178,U+02BC,U+02C6,U+02DA,U+02DC,U+2000-200F,U+2010-2027,U+202F,U+2030-203A,U+2044,U+205F,U+20AC,U+2122,U+2212,U+2215`,
mêmes options `pyftsubset` (fonctionnalités `kern,liga,calt,ccmp,locl,mark,mkmk,tnum,lnum,pnum,case,sups`).
Régénération : `pyftsubset <police>.ttf --flavor=woff2 --unicodes=U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2009-200B,U+2010-2014,U+2018-201E,U+2022,U+2026,U+202F,U+2039-203A,U+20AC,U+2122 --layout-features=kern,liga,clig,calt,ccmp,locl,mark,mkmk,tnum,lnum,pnum,onum,case,frac,sups --no-hinting --desubroutinize`
