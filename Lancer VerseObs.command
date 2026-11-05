#!/bin/bash
# Ouvrir la régie et l’écoute ; fermer cette fenêtre arrête les deux.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$HERE"
[[ ! -d "$HERE/Application" ]] || ROOT="$HERE/Application"
if [[ ! -f "$ROOT/.runtime/pret.json" || ! -x "$ROOT/.runtime/node/bin/node" ]]; then
  printf '%s\n' "Double-cliquez d’abord sur Installer VerseObs, puis revenez ici."; exit 1
fi
cd -- "$ROOT"
export HF_HOME="$ROOT/.runtime/modeles"
exec "$ROOT/.runtime/node/bin/node" tools/distribution/lancer.cjs
