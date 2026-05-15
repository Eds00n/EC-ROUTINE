@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo Monitorando pasta import\ — salve nubank.csv para atualizar sozinho.
echo Feche esta janela com Ctrl+C para parar.
echo.
call npm run planilha:watch
