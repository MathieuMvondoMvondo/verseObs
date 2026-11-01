@echo off
rem VerseObs Ecoute : enregistrer SES cles d'API sur ce PC (facultatif).
rem Chaque cle est saisie masquee puis rangee dans les variables d'environnement
rem de l'utilisateur Windows (comme setx, mais sans passer la cle en argument d'un programme :
rem elle n'apparait dans aucune ligne de commande). Jamais affichee, ni ecrite dans un fichier.
rem Sans cle, l'ecoute reste tout en local (Whisper + OPUS-MT), gratuite.
chcp 65001 >nul
setlocal
echo.
echo 1/2 - Cle Anthropic : traduction par Claude. Collez-la puis Entree ; rien ne s'affiche.
powershell -NoProfile -Command "$s = Read-Host 'Cle API Anthropic (saisie masquee)' -AsSecureString; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { $p = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }; $p = $p.Trim(); if (-not $p) { exit 2 }; if (-not $p.StartsWith('sk-ant-')) { exit 3 }; $c = 0; try { [Environment]::SetEnvironmentVariable('VERSEOBS_ECOUTE_ANTHROPIC_CLE', $p, 'User') } catch { $c = 4 }; $p = $null; $s = $null; exit $c"
set R=%ERRORLEVEL%
if %R%==0 echo clé enregistrée
if %R%==2 echo Aucune clé saisie : rien n'est changé.
if %R%==3 echo Ce n'est pas une clé Anthropic, elle commence par sk-ant- : rien n'est enregistré.
if not %R%==0 if not %R%==2 if not %R%==3 echo Enregistrement impossible : rien n'est changé.
echo.
echo 2/2 - Cle OpenAI, facultative : transcription par OpenAI. Entree seule pour garder Whisper en local.
powershell -NoProfile -Command "$s = Read-Host 'Cle API OpenAI, facultative : Entree pour passer (saisie masquee)' -AsSecureString; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { $p = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }; $p = $p.Trim(); if (-not $p) { exit 2 }; if (-not $p.StartsWith('sk-') -or $p.StartsWith('sk-ant-')) { exit 3 }; $c = 0; try { [Environment]::SetEnvironmentVariable('VERSEOBS_ECOUTE_OPENAI_CLE', $p, 'User') } catch { $c = 4 }; $p = $null; $s = $null; exit $c"
set R=%ERRORLEVEL%
if %R%==0 echo clé enregistrée
if %R%==2 echo Pas de clé OpenAI : la transcription reste locale.
if %R%==3 echo Ce n'est pas une clé OpenAI, elle commence par sk- : rien n'est enregistré.
if not %R%==0 if not %R%==2 if not %R%==3 echo Enregistrement impossible : rien n'est changé.
echo.
echo Fermez puis relancez lancer-ecoute.cmd pour utiliser les clés.
echo Tout en local : lancer-ecoute.cmd --tout-local, ou effacer-cles.cmd pour retirer les clés.
endlocal
pause
