@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo Publicando financeiro na Hostinger (FTP)...
node financeiro/upload-site-ftp.mjs
pause
