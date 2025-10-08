# Quick AdsPower Connection Test

## Test Connection Status

```bash
# Test if your API is working
curl http://localhost:3001/api/health

# Check AdsPower connection status
curl http://localhost:3001/api/profiles/adspower/status

# Run full diagnostic
node diagnose-adspower.js
```

## If AdsPower is Running and Still Not Connecting

1. **Check AdsPower Settings:**

   - Open AdsPower desktop app
   - Go to Settings → API Settings
   - Enable "Local API Server"
   - Verify port is set to 50325
   - Restart AdsPower after enabling

2. **Test Direct Connection:**

   ```bash
   # This should work if AdsPower is running correctly
   curl "http://local.adspower.net:50325/api/v1/user/list?page=1&page_size=1"
   ```

3. **Firewall Check:**
   - Temporarily disable Windows Defender Firewall
   - Test connection again
   - If it works, add AdsPower to firewall exceptions

## Working in Demo Mode

If you want to continue developing without AdsPower:

```javascript
// All these API calls work in demo mode:
POST / api / profiles; // Creates simulated profiles
POST / api / profiles / 1 / launch; // Simulates profile launch
POST / api / profiles / 1 / stop; // Simulates profile stop
GET / api / profiles; // Lists all profiles
```

## Restart Server After Code Changes

If you added new API routes, restart the server:

```bash
# Stop current server (Ctrl+C)
# Then restart:
npm start
```
