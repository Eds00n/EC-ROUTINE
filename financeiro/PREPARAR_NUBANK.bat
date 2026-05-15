@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "import" mkdir import
if exist "import\nubank.csv" (
  echo Ja existe: import\nubank.csv
  echo Substitua manualmente apos exportar do app Nubank.
) else if exist "import\exemplo-nubank.csv" (
  copy /Y "import\exemplo-nubank.csv" "import\nubank.csv" >nul
  echo Criado import\nubank.csv a partir do exemplo para teste.
) else (
  echo Coloque seu CSV do Nubank em: import\nubank.csv
)
echo.
echo Proximo passo: SINCRONIZAR_AUTOMATICO.bat  ou  MONITORAR_NUBANK.bat
pause
