@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "Planilha_Orcamento_Pessoal.xlsx" (
  echo Arquivo XLSX nao encontrado. Na pasta do projeto rode: npm run planilha:orcamento
  pause
  exit /b 1
)
echo Abrindo planilha com o programa padrao do Windows (Excel ou similar)...
start "" "Planilha_Orcamento_Pessoal.xlsx"
exit /b 0
