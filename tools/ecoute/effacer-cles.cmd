@echo off
rem VerseObs Ecoute : retirer les cles d'API de ce PC. L'ecoute repasse tout en local.
chcp 65001 >nul
powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('VERSEOBS_ECOUTE_ANTHROPIC_CLE', $null, 'User'); [Environment]::SetEnvironmentVariable('VERSEOBS_ECOUTE_OPENAI_CLE', $null, 'User')"
echo clés effacées : l'écoute est de nouveau tout en local, après relance de lancer-ecoute.cmd.
pause
