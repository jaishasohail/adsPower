@echo off
echo.
echo ======================================
echo     AdsPower Quick Setup Guide
echo ======================================
echo.

echo Step 1: Check if AdsPower is installed
echo =====================================
echo Please check if AdsPower desktop application is installed on your system.
echo If not, download it from: https://www.adspower.net/
echo.
pause

echo.
echo Step 2: Launch AdsPower
echo =======================
echo 1. Find AdsPower icon on desktop or Start Menu
echo 2. RIGHT-CLICK and select "Run as administrator"
echo 3. Wait for the application to fully load
echo.
pause

echo.
echo Step 3: Enable Local API
echo ========================
echo In AdsPower:
echo 1. Click the Settings icon (gear icon, usually top-right)
echo 2. Look for "API", "Local API", or "Advanced" section
echo 3. Enable "Local API Server" or "Enable API"
echo 4. Make sure port is set to 50325
echo 5. Save/Apply settings
echo 6. RESTART AdsPower completely
echo.
pause

echo.
echo Step 4: Test Connection
echo ======================
echo Now testing if AdsPower is accessible...
echo.

cd /d "%~dp0"
node diagnose-adspower.js

echo.
echo Step 5: Verify Integration
echo ==========================
echo Running setup verification...
echo.

node verify-setup.js

echo.
echo ======================================
echo           Setup Complete!
echo ======================================
echo.
echo If all tests passed, your AdsPower is connected!
echo If not, check ADSPOWER_SETUP_GUIDE.md for detailed instructions.
echo.
pause