# AdsPower Integration Guide

## Overview

The ProfileService has been integrated with AdsPower to provide seamless profile creation, launching, and management. This integration automatically handles:

- Profile creation in both local database and AdsPower
- Profile launching with session management
- Profile stopping and cleanup
- Proxy configuration
- Task queue management
- Error handling and fallback to demo mode

## Key Features

### 1. Automatic AdsPower Profile Creation

When you create a profile, it automatically:

- Creates a local database entry
- Creates corresponding AdsPower profile
- Configures proxy settings
- Sets up fingerprint configuration
- Links the two profiles via `ads_power_id`

### 2. Integrated Profile Launching

The launch process handles:

- Profile validation
- AdsPower session creation
- Session data storage
- Status updates
- WebSocket endpoint management

### 3. Session Management

Active profiles are tracked with:

- WebSocket endpoints for automation
- Debug ports for browser debugging
- Session metadata
- Launch timestamps

## API Usage Examples

### Create a Profile

```javascript
POST /api/profiles
{
  "name": "Test Profile",
  "device_type": "PC",
  "proxy_id": 1,
  "target_url": "https://example.com"
}
```

### Launch a Profile

```javascript
POST /api/profiles/1/launch
{
  "headless": false,
  "clear_cache_after_closing": true,
  "launch_args": ["--disable-dev-shm-usage"]
}
```

### Stop a Profile

```javascript
POST / api / profiles / 1 / stop;
```

### Get Profile Status

```javascript
GET / api / profiles / 1 / status;
```

### Batch Launch Profiles

```javascript
POST /api/profiles/batch/launch
{
  "profileIds": [1, 2, 3],
  "options": {
    "headless": false,
    "clear_cache_after_closing": true
  }
}
```

### Check AdsPower Connection

```javascript
GET / api / profiles / adspower / status;
```

## Direct ProfileService Usage

### Initialize ProfileService

```javascript
const Database = require("./database/database");
const ProfileService = require("./services/ProfileService");

const db = new Database();
const profileService = new ProfileService(db);

// Start lifecycle management
profileService.startLifecycleManagement();
```

### Create and Launch Profile

```javascript
// Create profile
const profile = await profileService.createProfile({
  name: "My Test Profile",
  device_type: "PC",
  proxy_id: 1,
  target_url: "https://google.com",
});

// Launch profile
const launchResult = await profileService.launchProfile(profile.id, {
  headless: false,
  clear_cache_after_closing: true,
});

if (launchResult.success) {
  console.log("Profile launched!");
  console.log("WebSocket endpoint:", launchResult.sessionData.wsEndpoint);
  console.log("Debug port:", launchResult.sessionData.debugPort);
}
```

### Get Active Sessions

```javascript
// Get all active sessions
const activeSessions = profileService.getAllActiveProfileSessions();

// Get specific profile session
const sessionData = profileService.getActiveProfileSession(profileId);
```

### Stop Profile

```javascript
const stopResult = await profileService.stopProfile(profileId);
if (stopResult.success) {
  console.log("Profile stopped successfully");
}
```

### Schedule Profile Launch

```javascript
// Schedule for later launch (when slots become available)
await profileService.scheduleProfileLaunch(profileId, {
  headless: false,
  clear_cache_after_closing: true,
});
```

### Batch Operations

```javascript
// Launch multiple profiles
const results = await profileService.launchMultipleProfiles([1, 2, 3], {
  headless: false,
});

results.forEach((result) => {
  if (result.success) {
    console.log(`Profile ${result.profileId}: ${result.action}`);
  } else {
    console.error(`Profile ${result.profileId} failed: ${result.error}`);
  }
});
```

## AdsPower Configuration

### Required AdsPower Settings

1. **AdsPower Local API**: Must be running on `http://local.adspower.net:50325`
2. **API Access**: Enable local API access in AdsPower settings
3. **Profile Limits**: Configure based on your AdsPower subscription

### Proxy Configuration

Proxies are automatically configured when creating profiles:

```javascript
const proxyConfig = {
  proxy_type: "http",
  proxy_host: "127.0.0.1",
  proxy_port: "8080",
  proxy_user: "username",
  proxy_password: "password",
};
```

### Fingerprint Configuration

Default fingerprint settings are applied:

```javascript
const fingerprintConfig = {
  automatic_timezone: 1,
  language: ["en-US", "en"],
  screen_resolution: "1920,1080",
};
```

## Error Handling

The integration includes comprehensive error handling:

### Demo Mode Fallback

If AdsPower is not available, the system automatically switches to demo mode:

- Simulates profile creation and launching
- Provides dummy session data
- Allows continued development without AdsPower

### Connection Monitoring

- Automatic connection checking every 30 seconds
- Graceful fallback when connection is lost
- Automatic reconnection when AdsPower becomes available

### Task Queue Management

Failed operations are:

- Logged with detailed error information
- Marked as failed in the task queue
- Available for retry or manual intervention

## Best Practices

### 1. Check Available Slots

```javascript
const availableSlots = await profileService.getAvailableSlots();
if (availableSlots > 0) {
  // Launch profile immediately
} else {
  // Schedule for later
  await profileService.scheduleProfileLaunch(profileId);
}
```

### 2. Monitor Active Profiles

```javascript
const activeCount = await profileService.getActiveProfilesCount();
const maxProfiles = await profileService.getSetting("max_concurrent_profiles");
console.log(`Active: ${activeCount}/${maxProfiles}`);
```

### 3. Handle Connection Status

```javascript
const adsPowerStatus = profileService.getAdsPowerStatus();
if (!adsPowerStatus.isConnected) {
  console.log("AdsPower not available - running in demo mode");
}
```

### 4. Use Task Queue for Batch Operations

```javascript
// For large batch operations, use scheduling
for (const profileId of largeProfileList) {
  await profileService.scheduleProfileLaunch(profileId);
}
```

## Troubleshooting

### Common Issues

1. **AdsPower Not Running**

   - Check if AdsPower desktop application is running
   - Verify local API is enabled
   - Check port 50325 is not blocked

2. **Profile Creation Fails**

   - Verify proxy configuration
   - Check AdsPower subscription limits
   - Review error logs for specific issues

3. **Launch Failures**
   - Ensure profile has valid `ads_power_id`
   - Check available system resources
   - Verify target URL is accessible

### Debug Information

```javascript
// Get comprehensive status
const status = await profileService.getProfileLaunchStatus(profileId);
const adsPowerStatus = profileService.getAdsPowerStatus();

console.log("Profile Status:", status);
console.log("AdsPower Status:", adsPowerStatus);
```

## Migration from Old API

If you're migrating from the old API structure:

1. **Profile Creation**: Now handled automatically with AdsPower integration
2. **Launch Logic**: Moved from individual API calls to integrated ProfileService methods
3. **Session Management**: Centralized in ProfileService
4. **Error Handling**: Improved with automatic fallback and retry logic

The new integration provides better reliability, easier maintenance, and more robust error handling while maintaining the same functionality.
