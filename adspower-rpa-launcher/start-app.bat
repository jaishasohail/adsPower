@echo off
cd /d "C:\Users\LAptopa\OneDrive\Desktop\adsPower project\adspower-rpa-launcher"
echo Starting AdsPower RPA Launcher...
echo Current Directory: %CD%
echo.
echo Starting backend server...
start /B node src\backend\server.js
timeout /t 3 /nobreak >nul
echo.
echo Starting React development server...
npm run react-dev