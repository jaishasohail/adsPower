#!/bin/bash

# AdsPower RPA Launcher Installation Script
# This script helps set up the AdsPower RPA Launcher on your system

echo "======================================"
echo "AdsPower RPA Launcher Setup"
echo "======================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16.x or higher first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check if AdsPower is accessible
echo ""
echo "🔍 Checking AdsPower connection..."
curl -s http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=1 > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ AdsPower is accessible"
else
    echo "⚠️  AdsPower is not accessible. Please ensure:"
    echo "   1. AdsPower is installed and running"
    echo "   2. API is enabled in AdsPower settings"
    echo "   3. Default port 50325 is not blocked"
fi

# Create startup scripts
echo ""
echo "📝 Creating startup scripts..."

# Windows batch file
cat > start-windows.bat << 'EOF'
@echo off
echo Starting AdsPower RPA Launcher...
echo.
echo Please ensure AdsPower is running before starting this application.
echo.
timeout /t 3 /nobreak >nul
npm start
pause
EOF

# Linux/Mac shell script
cat > start-unix.sh << 'EOF'
#!/bin/bash
echo "Starting AdsPower RPA Launcher..."
echo ""
echo "Please ensure AdsPower is running before starting this application."
echo ""
sleep 3
npm start
EOF

chmod +x start-unix.sh

echo "✅ Startup scripts created"

# Success message
echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Ensure AdsPower is running"
echo "2. Run the application:"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "   - Double-click start-windows.bat, or"
fi
echo "   - Run: npm start"
echo ""
echo "3. Open your browser to: http://localhost:3000"
echo "4. Configure your settings and import proxies"
echo "5. Start creating profiles and automation!"
echo ""
echo "For detailed documentation, see README.md"