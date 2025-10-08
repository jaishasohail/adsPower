@echo off
REM AdsPower RPA Launcher Windows Setup Script

echo ======================================
echo AdsPower RPA Launcher Setup
echo ======================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 16.x or higher first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js version:
node --version

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo ✅ npm version:
npm --version

REM Install dependencies
echo.
echo 📦 Installing dependencies...
npm install

if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo ✅ Dependencies installed successfully

REM Check AdsPower connection (simplified for Windows)
echo.
echo 🔍 Checking if AdsPower might be running...
netstat -an | find "50325" >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Port 50325 is in use (AdsPower might be running)
) else (
    echo ⚠️  Port 50325 is not in use. Please ensure:
    echo    1. AdsPower is installed and running
    echo    2. API is enabled in AdsPower settings
    echo    3. Default port 50325 is not blocked
)

REM Create Windows startup script
echo.
echo 📝 Creating startup script...

echo @echo off > start.bat
echo echo Starting AdsPower RPA Launcher... >> start.bat
echo echo. >> start.bat
echo echo Please ensure AdsPower is running before starting this application. >> start.bat
echo echo. >> start.bat
echo timeout /t 3 /nobreak ^>nul >> start.bat
echo npm start >> start.bat
echo pause >> start.bat

echo ✅ Startup script created (start.bat)

REM Success message
echo.
echo 🎉 Setup completed successfully!
echo.
echo Next steps:
echo 1. Ensure AdsPower is running
echo 2. Run the application:
echo    - Double-click start.bat, or
echo    - Run: npm start
echo.
echo 3. Open your browser to: http://localhost:3000
echo 4. Configure your settings and import proxies
echo 5. Start creating profiles and automation!
echo.
echo For detailed documentation, see README.md
echo.
pause