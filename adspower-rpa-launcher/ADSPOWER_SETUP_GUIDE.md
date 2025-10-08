# 🚀 Complete Guide: Starting AdsPower and Connecting to Your Server

## Prerequisites

- AdsPower desktop application installed
- Your RPA Launcher server running (http://localhost:3001)
- Administrator privileges (recommended)

---

## Step 1: Launch AdsPower Desktop Application

### 1.1 Start the Application

1. **Find AdsPower**: Look for AdsPower icon on your desktop or in Start Menu
2. **Run as Administrator**: Right-click → "Run as administrator" (recommended)
3. **Wait for Loading**: Let the application fully load (may take 30-60 seconds)
4. **Check Status**: Ensure the main AdsPower window is open and responsive

### 1.2 Verify Installation

- If AdsPower is not installed, download from: https://www.adspower.net/
- Install with default settings
- Restart your computer after installation if prompted

---

## Step 2: Enable Local API in AdsPower

### 2.1 Access Settings

1. **Open AdsPower** main window
2. **Find Settings**: Look for ⚙️ Settings icon (usually top-right corner)
3. **Click Settings** to open the settings menu

### 2.2 Enable API Access

1. **Navigate to API Settings**:
   - Look for "API" or "Local API" section
   - May be under "Advanced Settings" or "Developer Settings"
2. **Enable Local API**:

   - ✅ Check "Enable Local API" or "Enable API Server"
   - ✅ Verify port is set to **50325** (default)
   - ✅ Save/Apply settings

3. **Restart AdsPower**:
   - Close AdsPower completely
   - Reopen as administrator
   - Wait for full startup

### 2.3 API Settings Location Guide

Different AdsPower versions have API settings in different locations:

**Version 3.x+**:

- Settings → Advanced → Local API
- Settings → Developer → API Configuration

**Version 2.x**:

- Settings → API → Local API Server

**If you can't find API settings**:

- Check AdsPower documentation for your version
- Look for "Local API", "Developer Mode", or "API Server"
- Contact AdsPower support if needed

---

## Step 3: Test AdsPower Connection

### 3.1 Using Our Diagnostic Tool

```bash
# Navigate to your project folder
cd "c:\Users\LAptopa\OneDrive\Desktop\adsPower project\adspower-rpa-launcher"

# Run diagnostic
node diagnose-adspower.js
```

**Expected Output When Working**:

```
🔍 AdsPower Connection Diagnostic Tool

1. Testing basic connectivity...
   ✅ AdsPower API is accessible
   📊 Response code: 0
   📄 Response message: success
   🎉 AdsPower is working correctly!
```

### 3.2 Manual Browser Test

1. **Open web browser**
2. **Navigate to**: `http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=1`
3. **Expected response**:
   ```json
   {
     "code": 0,
     "msg": "success",
     "data": {...}
   }
   ```

### 3.3 Using curl (PowerShell)

```powershell
# Test AdsPower API directly
curl "http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=1"

# Test your server's AdsPower status
curl http://localhost:3001/api/profiles/adspower/status
```

---

## Step 4: Verify Server Connection

### 4.1 Check Server Status

```bash
# Test if your server detects AdsPower
curl http://localhost:3001/api/profiles/adspower/status
```

**Expected Response When Connected**:

```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "demoMode": false,
    "lastConnectionCheck": "2025-10-03T...",
    "baseURL": "http://local.adspower.net:50325"
  }
}
```

### 4.2 Test Profile Creation

```bash
# Create a test profile
curl -X POST http://localhost:3001/api/profiles \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Profile\",\"target_url\":\"https://google.com\"}"
```

---

## Step 5: Troubleshooting Common Issues

### 5.1 AdsPower Not Starting

**Symptoms**: Application won't open or crashes
**Solutions**:

1. **Run as Administrator**
2. **Check antivirus**: Whitelist AdsPower
3. **Update AdsPower**: Download latest version
4. **Restart computer**: Sometimes helps with driver issues
5. **Check system requirements**: RAM, disk space

### 5.2 API Not Accessible

**Symptoms**: Connection refused, port not accessible
**Solutions**:

1. **Verify API is enabled**:

   - Double-check settings
   - Look for "Local API Server" toggle
   - Ensure it's ON/Enabled

2. **Check port conflicts**:

   ```bash
   # Check what's using port 50325
   netstat -ano | findstr :50325
   ```

3. **Firewall issues**:

   - Temporarily disable Windows Firewall
   - Test connection
   - If it works, add AdsPower to firewall exceptions

4. **Antivirus blocking**:
   - Add AdsPower to antivirus whitelist
   - Temporarily disable real-time protection
   - Test connection

### 5.3 Wrong API Response

**Symptoms**: API accessible but returns errors
**Solutions**:

1. **Update AdsPower**: Newer versions have better API support
2. **Check account status**: Ensure AdsPower account is active
3. **Restart both**: AdsPower and your server

---

## Step 6: Complete Integration Test

### 6.1 Run Full Test Suite

```bash
# Run our integration test
node test-adspower-integration.js
```

**Expected Output**:

```
🚀 Starting AdsPower Integration Test...

1. Checking AdsPower connection...
   Connection: ✅ Connected
   Base URL: http://local.adspower.net:50325
   Demo Mode: false

2. Checking available profile slots...
   Available slots: 40
   Active profiles: 0

3. Creating test profile...
   Profile created: ID 1
   AdsPower ID: ads123456789

4. Getting profile status...
   Status: created
   Active: false

5. Launching profile...
   ✅ Profile launched successfully!
   WebSocket: ws://local.adspower.net:50325/...
   Debug Port: 9222

🎉 Integration test completed successfully!
```

### 6.2 Test Individual Features

```bash
# Test profile creation
curl -X POST http://localhost:3001/api/profiles \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"My Profile\",\"target_url\":\"https://example.com\"}"

# Test profile launch
curl -X POST http://localhost:3001/api/profiles/1/launch

# Test profile status
curl http://localhost:3001/api/profiles/1/status

# Test profile stop
curl -X POST http://localhost:3001/api/profiles/1/stop
```

---

## Step 7: Production Setup (Optional)

### 7.1 Configure for Production Use

1. **Set startup preferences**:

   - Make AdsPower start with Windows
   - Enable auto-login
   - Configure default settings

2. **Optimize performance**:
   - Adjust profile limits based on your system
   - Configure proxy settings if needed
   - Set up profile templates

### 7.2 Monitor Connection

```bash
# Set up monitoring (run in background)
while ($true) {
  $status = curl -s http://localhost:3001/api/profiles/adspower/status | ConvertFrom-Json
  Write-Host "AdsPower Status: $($status.data.isConnected)" -ForegroundColor $(if($status.data.isConnected) { 'Green' } else { 'Red' })
  Start-Sleep 30
}
```

---

## 🎯 Quick Start Checklist

- [ ] AdsPower installed and running
- [ ] Run AdsPower as Administrator
- [ ] Local API enabled in AdsPower settings
- [ ] Port 50325 accessible
- [ ] Firewall/antivirus configured
- [ ] Your server running on http://localhost:3001
- [ ] Test connection with: `curl http://localhost:3001/api/profiles/adspower/status`
- [ ] Run integration test: `node test-adspower-integration.js`

---

## 🆘 Need Help?

### If Still Not Working:

1. **Check AdsPower logs**:

   - Look in AdsPower installation folder for log files
   - Check for error messages

2. **Contact Support**:

   - AdsPower support for application issues
   - Check AdsPower documentation for your version

3. **Use Demo Mode**:

   - Your server works perfectly in demo mode
   - Continue development while troubleshooting AdsPower

4. **Run Diagnostic Again**:
   ```bash
   node diagnose-adspower.js
   ```

### Success Indicators:

- ✅ AdsPower desktop app running
- ✅ API enabled and accessible on port 50325
- ✅ Your server shows `"isConnected": true`
- ✅ Can create and launch profiles
- ✅ No more "switching to demo mode" messages
