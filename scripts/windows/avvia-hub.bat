@echo off
title Backrooms Hub
cd /d "%~dp0..\.."
echo Backrooms Hub in esecuzione su http://localhost:3000  (non chiudere questa finestra)
:loop
call npm start
echo L'hub si e' fermato, riavvio tra 10 secondi...
timeout /t 10 /nobreak >nul
goto loop
