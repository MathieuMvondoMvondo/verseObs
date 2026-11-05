# Exécution des garde-fous Windows sur le VPS, hors WinForms.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../tools/distribution/integrite.ps1')
$Folder=Join-Path $env:TMPDIR ('verseobs-windows-'+[Guid]::NewGuid().ToString())
[void][IO.Directory]::CreateDirectory($Folder)
try {
    $Source=Join-Path $Folder 'source-factice';$Download=Join-Path $Folder 'telechargement-factice'
    [IO.File]::WriteAllText($Source,'fixture de téléchargement, pas un exécutable')
    $Hash=(Get-FileHash $Source -Algorithm SHA256).Hash.ToLowerInvariant()
    Copy-Item $Source $Download
    Confirm-RuntimeArchive $Download $Hash
    [IO.File]::AppendAllText($Download,'ALTÉRÉ')
    $Refused=$false
    try { Confirm-RuntimeArchive $Download $Hash } catch { $Refused=$true }
    if (!$Refused) { throw 'Le fichier altéré a été accepté.' }
    $Tokens=$null;$Errors=$null
    [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../tools/distribution/windows.ps1'),[ref]$Tokens,[ref]$Errors) > $null
    if ($Errors.Count) { throw ($Errors | Out-String) }
    Write-Output 'ok   Windows : téléchargement factice accepté, archive altérée refusée, analyse syntaxique de la fenêtre valide'
} finally { Remove-Item $Folder -Recurse -Force }
