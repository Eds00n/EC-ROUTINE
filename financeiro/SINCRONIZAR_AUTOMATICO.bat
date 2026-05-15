@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo Sincronizando Nubank + painel...
call npm run planilha:sync
pause
