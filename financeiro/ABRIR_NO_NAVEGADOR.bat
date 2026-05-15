@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "Planilha_Orcamento.html" (
  echo HTML nao encontrado. Na pasta do projeto rode: npm run planilha:orcamento
  pause
  exit /b 1
)
start "" "Planilha_Orcamento.html"
exit /b 0
