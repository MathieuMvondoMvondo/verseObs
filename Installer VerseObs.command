#!/bin/bash
# Une installation autonome, sans Python ou Node système.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$HERE"
[[ ! -d "$HERE/Application" ]] || ROOT="$HERE/Application"
if bash "$ROOT/tools/distribution/installer-mac.sh" "$ROOT"; then
  printf '\n%s\n' 'Vous pouvez fermer cette fenêtre et double-cliquer sur Lancer VerseObs.'
else
  printf '\n%s\n' 'Installation interrompue. Vérifiez Internet et relancez Installer VerseObs.'
  exit 1
fi
