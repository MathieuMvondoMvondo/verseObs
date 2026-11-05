#!/bin/bash
# Lancer Écoute avec les mêmes options que sous Windows, sans clé en fichier.
set +x
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'Ce lanceur est réservé à macOS.' >&2; exit 1
fi
if [[ ! -x .venv/bin/python ]]; then
  printf '%s\n' "Lancez d’abord installer-mac.command." >&2; exit 1
fi
local_only=false
for arg in "$@"; do [[ "$arg" != --tout-local ]] || local_only=true; done
if [[ "$local_only" == false ]]; then
  for name in VERSEOBS_ECOUTE_ANTHROPIC_CLE VERSEOBS_ECOUTE_OPENAI_CLE VERSEOBS_ECOUTE_API_CLE; do
    # Une variable dédiée déjà définie reste prioritaire. Jamais de variable API générique.
    if [[ -z "${!name:-}" ]]; then
      key="$(security find-generic-password -a "$USER" -s "org.verseobs.ecoute.$name" -w 2>/dev/null || true)"
      if [[ -n "$key" ]]; then export "$name=$key"; fi
      unset key
    fi
  done
else
  unset VERSEOBS_ECOUTE_ANTHROPIC_CLE VERSEOBS_ECOUTE_OPENAI_CLE VERSEOBS_ECOUTE_API_CLE
fi
exec .venv/bin/python ecoute.py --priorite-basse "$@"
