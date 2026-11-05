# Fenêtre Windows : aucune installation de Python, Node, Git ou compilateur système.
param([ValidateSet('installer','lancer')][string]$Mode='lancer')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'integrite.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Runtime=Join-Path $Root '.runtime'
$Bundle=Split-Path $Root
if ((Split-Path $Root -Leaf) -ne 'Application') { $Bundle=$Root }
$Form=New-Object Windows.Forms.Form
$Form.Text='VerseObs';$Form.Size=New-Object Drawing.Size(540,260);$Form.StartPosition='CenterScreen'
$Form.FormBorderStyle='FixedDialog';$Form.MaximizeBox=$false
$Label=New-Object Windows.Forms.Label
$Label.Location=New-Object Drawing.Point(24,25);$Label.Size=New-Object Drawing.Size(475,95)
$Label.Font=New-Object Drawing.Font('Segoe UI',12)
$Label.Text='Préparation de VerseObs… Aucune commande à saisir.'
$Bar=New-Object Windows.Forms.ProgressBar
$Bar.Location=New-Object Drawing.Point(24,130);$Bar.Size=New-Object Drawing.Size(475,20);$Bar.Style='Marquee'
$Button=New-Object Windows.Forms.Button
$Button.Location=New-Object Drawing.Point(354,170);$Button.Size=New-Object Drawing.Size(145,32)
$Button.Text='Fermer';$Button.Add_Click({$Form.Close()})
$Form.Controls.AddRange(@($Label,$Bar,$Button));$Form.Show()
$Child=$null;$Lock=$false
function Pump { [Windows.Forms.Application]::DoEvents();if ($Form.IsDisposed) { throw 'Fenêtre fermée.' } }
function Status([string]$Text) { $Label.Text=$Text;$Label.Refresh();Pump }
function Start-Hidden([string]$File,[string]$Arguments) {
    $Info=New-Object Diagnostics.ProcessStartInfo
    $Info.FileName=$File;$Info.Arguments=$Arguments;$Info.WorkingDirectory=$Root
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $P=New-Object Diagnostics.Process;$P.StartInfo=$Info;[void]$P.Start()
    # Lire de manière asynchrone évite de bloquer un processus sur un journal plein.
    $script:OutputTask=$P.StandardOutput.ReadToEndAsync();$script:ErrorTask=$P.StandardError.ReadToEndAsync()
    return $P
}
try {
    [void][IO.Directory]::CreateDirectory($Runtime)
    if ($Mode -eq 'installer') {
        if (Test-Path (Join-Path $Runtime 'session.lock')) { throw 'Fermez VerseObs avant de réinstaller.' }
        # CreateNew est exclusif, contrairement à CreateDirectory.
        $LockPath=Join-Path $Runtime 'installation.windows.lock'
        $Lock=[IO.File]::Open($LockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        if (Test-Path (Join-Path $Runtime 'session.lock')) { throw 'Fermez VerseObs avant de réinstaller.' }
        if ($env:PROCESSOR_ARCHITECTURE -notin @('AMD64','x86')) { throw 'Ce paquet est prévu pour Windows x64.' }
        if (![Environment]::Is64BitOperatingSystem) { throw 'Ce paquet est prévu pour Windows x64.' }
        $Row=Import-Csv (Join-Path $PSScriptRoot 'runtimes.tsv') -Delimiter '|' | Where-Object { $_.kind -eq 'python' -and $_.target -eq 'win32-x64' }
        if ($Row.sha256 -notmatch '^[a-f0-9]{64}$' -or $Row.url -notlike 'https://github.com/astral-sh/python-build-standalone/releases/download/*') { throw 'Manifest invalide.' }
        Status "1/6 — Téléchargement de l’écoute autonome…"
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
        $Archive=Join-Path $Runtime 'python.archive'
        $Web=New-Object Net.WebClient
        try {
            $Task=$Web.DownloadFileTaskAsync([Uri]$Row.url,$Archive)
            while (!$Task.IsCompleted) { Pump;Start-Sleep -Milliseconds 100 }
            $Task.GetAwaiter().GetResult()
        } finally { $Web.CancelAsync();$Web.Dispose() }
        Confirm-RuntimeArchive $Archive $Row.sha256
        $Stage=Join-Path $Runtime 'python-nouveau'
        if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
        [void][IO.Directory]::CreateDirectory($Stage)
        & tar.exe -xzf $Archive -C $Stage
        if ($LASTEXITCODE -ne 0 -or !(Test-Path (Join-Path $Stage 'python/python.exe'))) { throw 'Archive incomplète ou Windows trop ancien. Windows 10/11 x64 est nécessaire.' }
        $PythonHome=Join-Path $Runtime 'python'
        if (Test-Path $PythonHome) { Remove-Item $PythonHome -Recurse -Force }
        Move-Item (Join-Path $Stage 'python') $PythonHome
        Remove-Item $Stage -Recurse -Force;Remove-Item $Archive
        $Child=Start-Hidden (Join-Path $PythonHome 'python.exe') ('"'+(Join-Path $PSScriptRoot 'installer.py')+'" --root "'+$Root+'" --target win32-x64')
        while (!$Child.HasExited) {
            Pump
            $ProgressFile=Join-Path $Runtime 'progression.json'
            if (Test-Path $ProgressFile) {
                try { $State=Get-Content $ProgressFile -Raw -Encoding UTF8 | ConvertFrom-Json;$Label.Text=$State.text;$Bar.Style='Continuous';$Bar.Value=[int](100*$State.step/$State.total) } catch { }
            }
            Start-Sleep -Milliseconds 150
        }
        if ($Child.ExitCode -ne 0) { throw 'Installation interrompue. Vérifiez Internet et relancez Installer VerseObs. Détails dans Application\.runtime\installation.log.' }
        $Shell=New-Object -ComObject WScript.Shell
        $Shortcut=$Shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'VerseObs.lnk'))
        $Shortcut.TargetPath=Join-Path $Bundle 'Lancer VerseObs.cmd';$Shortcut.WorkingDirectory=$Bundle;$Shortcut.WindowStyle=7;$Shortcut.Save()
        Status 'VerseObs est prêt ! Fermez cette fenêtre, puis double-cliquez sur VerseObs sur le Bureau.'
        $Bar.Value=100
    } else {
        $Node=Join-Path $Runtime 'node/node.exe'
        if (!(Test-Path (Join-Path $Runtime 'pret.json')) -or !(Test-Path $Node)) { throw "Double-cliquez d’abord sur Installer VerseObs." }
        $Child=Start-Hidden $Node ('"'+(Join-Path $PSScriptRoot 'lancer.cjs')+'" --stdin')
        Status "Le Studio s’ouvre dans votre navigateur. Gardez cette fenêtre ouverte pendant la séance."
        $Button.Text='Arrêter VerseObs';$Bar.Style='Continuous';$Bar.Value=100
        while (!$Child.HasExited) { Pump;Start-Sleep -Milliseconds 200 }
        if ($Child.ExitCode -ne 0) { throw "VerseObs s’est arrêté. Fermez les autres fenêtres VerseObs et relancez. Si nécessaire, relancez Installer VerseObs." }
        Status 'VerseObs est arrêté.'
    }
    while (!$Form.IsDisposed) { [Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 150 }
} catch {
    if (!$Form.IsDisposed) { [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'VerseObs',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Information) }
} finally {
    if ($Child -and !$Child.HasExited) {
        if ($Mode -eq 'lancer') { try { $Child.StandardInput.WriteLine('ARRETER');$Child.StandardInput.Close() } catch { } }
        if (!$Child.WaitForExit(10000)) { & taskkill.exe /PID $Child.Id /T /F 2>$null | Out-Null }
    }
    if ($Lock) { $Lock.Dispose();Remove-Item $LockPath -Force }
    $Form.Dispose()
}
