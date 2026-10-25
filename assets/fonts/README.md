# Polices de l'habillage antenne

Sous-ensembles WOFF2 (latin, latin-1, œ/Œ, ponctuation française) des polices variables
publiées par Google Fonts, sous licence SIL Open Font License 1.1 (textes joints) :

- `Lora-wght.woff2`, `Lora-Italic-wght.woff2` — Lora (lecture), graisses 400 à 700.
- `ArchivoNarrow-wght.woff2` — Archivo Narrow (références, chiffres, étiquettes), 400 à 700.

Elles sont servies localement : aucune requête vers un service de polices.
Régénération : `pyftsubset <police>.ttf --flavor=woff2 --unicodes=U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2009-200B,U+2010-2014,U+2018-201E,U+2022,U+2026,U+202F,U+2039-203A,U+20AC,U+2122 --layout-features=kern,liga,clig,calt,ccmp,locl,mark,mkmk,tnum,lnum,pnum,onum,case,frac,sups --no-hinting --desubroutinize`
