@echo off
rem Choix explicite : Ecoute + departage des versets par API payante.
chcp 65001 >nul
echo Ecoute + versets : appels OpenAI payants avec votre cle existante.
echo Le cout estime est affiche dans le Studio. Un plafond desactive le departage.
call "%~dp0lancer-ecoute.cmd" --departage-versets %*
