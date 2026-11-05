# Fonction sans interface, commune à l’installateur Windows et à ses tests VPS.
function Confirm-RuntimeArchive([string]$Archive,[string]$Expected) {
    if ($Expected -notmatch '^[a-f0-9]{64}$') { throw 'Empreinte attendue invalide.' }
    $Actual=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Actual -cne $Expected) { throw 'Mauvaise empreinte : téléchargement refusé, aucun programme téléchargé lancé.' }
}
