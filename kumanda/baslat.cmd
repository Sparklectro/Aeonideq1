@echo off
rem Kumanda'yi Windows'ta baslatir. Ilk calistirmada bagimliliklari kurar.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js bulunamadi. https://nodejs.org adresinden LTS surumunu kur. & pause & exit /b 1)
if not exist node_modules (call npm install || (pause & exit /b 1))
node server\index.js
pause
