@rem Ouvrir VerseObs sans commande a saisir.
@echo off
set "ROOT=%~dp0"
if exist "%ROOT%Application\tools\distribution\windows.ps1" set "ROOT=%ROOT%Application\"
start "VerseObs" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ROOT%tools\distribution\windows.ps1" -Mode installer
