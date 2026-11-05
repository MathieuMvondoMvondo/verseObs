#!/bin/bash
# Saisie masquée ; secrets au trousseau uniquement, jamais en argument de processus.
set +x
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'Ce lanceur est réservé à macOS.' >&2; exit 1
fi
printf '%s\n' 'Clés facultatives. Entrée seule conserve la clé existante ; sans clé, tout reste local.'
printf '%s\n' 'Avec ces clés, le son/texte est transmis aux fournisseurs ; leurs API sont payantes.'
# Le mode interactif de security lit une commande sur stdin, pas dans argv.
# L’échappement empêche les guillemets ou antislashs de modifier cette commande.
escape() { local value="$1"; value="${value//\\/\\\\}"; value="${value//\"/\\\"}"; printf '%s' "$value"; }
trap 'unset key escaped saved' EXIT
for name in VERSEOBS_ECOUTE_ANTHROPIC_CLE VERSEOBS_ECOUTE_OPENAI_CLE VERSEOBS_ECOUTE_API_CLE; do
  key=''
  IFS= read -r -s -p "$name (Entrée pour ignorer) : " key || exit 1
  printf '\n'
  [[ -n "$key" ]] || continue
  service="org.verseobs.ecoute.$name"
  escaped="$(escape "$key")"
  printf 'add-generic-password -U -a "%s" -s "%s" -w "%s"\n' "$(escape "$USER")" "$service" "$escaped" | security -i >/dev/null 2>&1 || {
    printf '%s\n' 'Enregistrement impossible. Déverrouillez le trousseau et réessayez.' >&2; exit 1
  }
  # security -i peut quitter à zéro malgré un échec : lecture de contrôle obligatoire.
  saved="$(security find-generic-password -a "$USER" -s "$service" -w 2>/dev/null || true)"
  if [[ "$saved" != "$key" ]]; then
    printf '%s\n' 'La clé n’a pas été confirmée dans le trousseau. Réessayez.' >&2; exit 1
  fi
  unset key escaped saved
  printf '%s\n' 'Clé enregistrée dans le trousseau.'
done
printf '%s\n' 'Relancez lancer-ecoute-mac.command pour prendre en compte les clés.'
