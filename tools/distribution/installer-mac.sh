#!/bin/bash
# Amorçage macOS avec seulement les outils déjà livrés par Apple.
set -euo pipefail
ROOT="${1:?Dossier de VerseObs manquant}"
cd -- "$ROOT"
[[ "$(uname -s)" == Darwin ]] || { printf '%s\n' 'Ce programme est prévu pour Mac.' >&2; exit 1; }
ARCH=x64
if [[ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" == 1 ]]; then ARCH=arm64; fi
TARGET="darwin-$ARCH"
[[ ! -L .runtime ]] || { printf '%s\n' 'Utilisez un dossier VerseObs normal, sans lien.' >&2; exit 1; }
mkdir -p .runtime
[[ ! -e .runtime/session.lock ]] || { printf '%s\n' 'Fermez VerseObs avant de réinstaller.' >&2; exit 1; }
mkdir .runtime/installation.lock 2>/dev/null || { printf '%s\n' 'Une installation est déjà en cours.' >&2; exit 1; }
cleanup() { rm -rf .runtime/python-nouveau; rm -f .runtime/python.archive; rmdir .runtime/installation.lock; }
trap cleanup EXIT
[[ ! -e .runtime/session.lock ]] || { printf '%s\n' 'Fermez VerseObs avant de réinstaller.' >&2; exit 1; }
printf '%s\n' 'VERSEOBS — installation automatique' 'Gardez cette fenêtre ouverte. Aucune commande à saisir.' "[#-----] Téléchargement de l’écoute autonome…"
URL='' SHA=''
while IFS='|' read -r kind target _folder url sha; do
  if [[ "$kind" == python && "$target" == "$TARGET" ]]; then URL="$url"; SHA="$sha"; fi
done < tools/distribution/runtimes.tsv
[[ "$SHA" =~ ^[a-f0-9]{64}$ && "$URL" == https://github.com/* ]] || { printf '%s\n' "Manifest d’installation invalide." >&2; exit 1; }
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 3 --connect-timeout 20 --max-time 900 --progress-bar --output .runtime/python.archive "$URL"
ACTUAL="$(shasum -a 256 .runtime/python.archive)"
[[ "${ACTUAL%% *}" == "$SHA" ]] || { printf '%s\n' "Mauvaise empreinte : téléchargement refusé. Aucun programme téléchargé n’a été lancé." >&2; exit 1; }
mkdir .runtime/python-nouveau
tar -xzf .runtime/python.archive -C .runtime/python-nouveau
[[ -x .runtime/python-nouveau/python/bin/python3 ]] || { printf '%s\n' 'Archive Python incomplète.' >&2; exit 1; }
rm -rf .runtime/python
mv .runtime/python-nouveau/python .runtime/python
# Ne jamais invoquer /usr/bin/python3 (qui peut déclencher Xcode sur un Mac neuf).
.runtime/python/bin/python3 tools/distribution/installer.py --root "$ROOT" --target "$TARGET"
