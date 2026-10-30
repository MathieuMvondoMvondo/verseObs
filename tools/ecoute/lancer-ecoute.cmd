@echo off
rem VerseObs Ecoute : a lancer avant le culte, VerseObs deja ouvert avec npm start.
rem Le reglage se fait ensuite dans le Studio : Connexions > Sous-titres anglais en direct.
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Lancez d'abord installer.cmd.
  pause
  exit /b 1
)
.venv\Scripts\python.exe ecoute.py --priorite-basse %*
pause
