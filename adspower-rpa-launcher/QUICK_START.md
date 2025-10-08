# 🎯 Quick Start: Connect AdsPower to Your Server

## 📋 Prerequisites Checklist

- [ ] AdsPower desktop application installed
- [ ] Your server running (`npm start` in your project folder)
- [ ] Administrator privileges

---

## 🚀 Step-by-Step Instructions

### Step 1: Start AdsPower (IMPORTANT: Run as Administrator)

```
1. Find AdsPower on your desktop or Start Menu
2. RIGHT-CLICK → "Run as administrator"
3. Wait for full loading (30-60 seconds)
4. Verify the main window opens
```

### Step 2: Enable Local API

```
1. In AdsPower, look for ⚙️ Settings (usually top-right)
2. Find "API" or "Local API" or "Advanced" section
3. ✅ Enable "Local API Server"
4. ✅ Verify port = 50325
5. ✅ Save/Apply settings
6. ✅ RESTART AdsPower completely
```

### Step 3: Test Connection

Open PowerShell and run:

```powershell
# Test AdsPower directly
curl "http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=1"

# Test your server's connection
curl http://localhost:3001/api/profiles/adspower/status
```

**SUCCESS Response** (AdsPower working):

```json
{"code":0,"msg":"success","data":{...}}
```

**SUCCESS Response** (Your server):

```json
{ "success": true, "data": { "isConnected": true, "demoMode": false } }
```

---

## 🔧 Common Issues & Solutions

### Issue 1: "Connection Refused" Error

**Cause**: AdsPower not running or API not enabled
**Solution**:

1. Verify AdsPower is running
2. Check API is enabled in settings
3. Restart AdsPower as administrator

### Issue 2: AdsPower Running but API Not Working

**Cause**: API not properly enabled
**Solution**:

1. Double-check API settings
2. Look for "Local API Server" toggle
3. Restart AdsPower after enabling

### Issue 3: Firewall Blocking Connection

**Cause**: Windows Firewall or antivirus
**Solution**:

1. Temporarily disable Windows Firewall
2. Test connection
3. If it works, add AdsPower to firewall exceptions

### Issue 4: Wrong Port or URL

**Cause**: AdsPower using different settings
**Solution**:

1. Check AdsPower API settings for correct port
2. Try alternative: `http://127.0.0.1:50325` instead of `http://local.adspower.net:50325`

---

## ✅ Quick Verification Commands

### Test 1: AdsPower Direct

```powershell
curl "http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=1"
```

**Expected**: `{"code":0,"msg":"success",...}`

### Test 2: Your Server Health

```powershell
curl http://localhost:3001/api/health
```

**Expected**: `{"status":"healthy",...}`

### Test 3: Integration Status

```powershell
curl http://localhost:3001/api/profiles/adspower/status
```

**Expected**: `{"success":true,"data":{"isConnected":true}}`

### Test 4: Create Test Profile

```powershell
curl -X POST http://localhost:3001/api/profiles -H "Content-Type: application/json" -d "{\"name\":\"Test\",\"target_url\":\"https://google.com\"}"
```

**Expected**: Profile created with `ads_power_id`

---

## 🎉 Success Indicators

When everything is working, you should see:

- ✅ AdsPower desktop app running
- ✅ API accessible on port 50325
- ✅ Your server shows `"isConnected": true`
- ✅ No more "switching to demo mode" messages
- ✅ Can create profiles with real AdsPower IDs
- ✅ Can launch profiles that open real browsers

---

## 🆘 Still Having Issues?

### Automatic Diagnostic

```powershell
# Run our diagnostic tool
node diagnose-adspower.js
```

### Manual Browser Test

Open browser and go to:

```
http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=1
```

### Check AdsPower Version

- Newer versions have better API support
- Update to latest version if needed
- Check AdsPower documentation for your version

### Use Demo Mode (Fallback)

If you can't get AdsPower working immediately:

- Your server works perfectly in demo mode
- All features functional (simulated)
- Continue development while troubleshooting

---

## 📞 Getting Help

1. **AdsPower Issues**: Contact AdsPower support
2. **Integration Issues**: Check our TROUBLESHOOTING.md
3. **Technical Issues**: Run `node diagnose-adspower.js`

---

**🎯 Bottom Line**: Your goal is to get `curl http://localhost:3001/api/profiles/adspower/status` to return `"isConnected": true`
