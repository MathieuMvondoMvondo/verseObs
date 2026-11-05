#!/bin/bash
# Installer Écoute dans ce dossier uniquement (macOS, Python 3.10 à 3.13).
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'Ce lanceur est réservé à macOS.' >&2; exit 1
fi
if ! command -v python3 >/dev/null || ! python3 -c 'import sys; sys.exit(not ((3,10) <= sys.version_info[:2] < (3,14)))'; then
  printf '%s\n' 'Installez Python 3.10 à 3.13 (python.org), puis relancez ce fichier.' >&2; exit 1
fi
if [[ -d .venv && ! -x .venv/bin/python ]]; then
  printf '%s\n' 'Le dossier .venv vient peut-être de Windows. Renommez-le avant de relancer.' >&2; exit 1
fi
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
printf '%s\n' 'Téléchargement des modèles (environ 650 Mo, une seule fois)…'
.venv/bin/python ecoute.py --preparer
printf '%s\n' 'Entrées audio de ce Mac :'
.venv/bin/python ecoute.py --liste
printf '%s\n' 'Installation terminée. Lancez lancer-ecoute-mac.command, puis Studio › Connexions › Sous-titres anglais.'
