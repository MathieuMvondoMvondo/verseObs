@echo off
rem VerseObs Ecoute : installation sur le PC de la regie (une seule fois).
rem Tout reste dans ce dossier (.venv et modeles) : rien n'est installe pour tout le systeme.
chcp 65001 >nul
cd /d "%~dp0"
where uv >nul 2>nul
if %ERRORLEVEL%==0 (
  uv venv .venv --python 3.12
  uv pip install --python .venv\Scripts\python.exe -r requirements.txt
) else (
  py -3 -m venv .venv
  .venv\Scripts\python.exe -m pip install --upgrade pip
  .venv\Scripts\python.exe -m pip install -r requirements.txt
)
if errorlevel 1 (
  echo.
  echo Installation impossible : verifiez la connexion Internet puis relancez installer.cmd.
  pause
  exit /b 1
)
echo.
echo Telechargement des modeles (une seule fois, environ 650 Mo)...
.venv\Scripts\python.exe ecoute.py --preparer
echo.
echo Entrees audio de cet ordinateur :
.venv\Scripts\python.exe ecoute.py --liste
echo.
echo Installation terminee. Lancez lancer-ecoute.cmd avant le culte.
pause
