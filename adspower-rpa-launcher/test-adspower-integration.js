const Database = require('./src/backend/database/database');
const ProfileService = require('./src/backend/services/ProfileService');

/**
 * Test script to demonstrate AdsPower integration
 * This script shows how to use the integrated ProfileService
 */

async function testAdsPowerIntegration() {
  console.log('🚀 Starting AdsPower Integration Test...\n');

  // Initialize services
  const db = new Database();
  const profileService = new ProfileService(db);
  
  // Wait for database initialization
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // 1. Check AdsPower connection
    console.log('1. Checking AdsPower connection...');
    const isConnected = await profileService.checkAdsPowerConnection();
    const adsPowerStatus = profileService.getAdsPowerStatus();
    
    console.log(`   Connection: ${isConnected ? '✅ Connected' : '⚠️ Demo Mode'}`);
    console.log(`   Base URL: ${adsPowerStatus.baseURL}`);
    console.log(`   Demo Mode: ${adsPowerStatus.demoMode}\n`);

    // 2. Check available slots
    console.log('2. Checking available profile slots...');
    const availableSlots = await profileService.getAvailableSlots();
    const activeCount = await profileService.getActiveProfilesCount();
    
    console.log(`   Available slots: ${availableSlots}`);
    console.log(`   Active profiles: ${activeCount}\n`);

    // 3. Create a test profile
    console.log('3. Creating test profile...');
    const profileData = {
      name: `Test Profile ${Date.now()}`,
      device_type: 'PC',
      proxy_id: null, // No proxy for testing
      target_url: 'https://google.com'
    };

    const profile = await profileService.createProfile(profileData);
    console.log(`   Profile created: ID ${profile.id}`);
    console.log(`   AdsPower ID: ${profile.ads_power_id}\n`);

    // 4. Get profile status
    console.log('4. Getting profile status...');
    const status = await profileService.getProfileLaunchStatus(profile.id);
    console.log(`   Status: ${status.status}`);
    console.log(`   Active: ${status.isActive}\n`);

    // 5. Launch the profile
    if (availableSlots > 0) {
      console.log('5. Launching profile...');
      const launchResult = await profileService.launchProfile(profile.id, {
        headless: false,
        clear_cache_after_closing: true
      });

      if (launchResult.success) {
        console.log(`   ✅ Profile launched successfully!`);
        console.log(`   WebSocket: ${launchResult.sessionData.wsEndpoint}`);
        console.log(`   Debug Port: ${launchResult.sessionData.debugPort}\n`);

        // 6. Get active sessions
        console.log('6. Getting active sessions...');
        const sessions = profileService.getAllActiveProfileSessions();
        console.log(`   Active sessions: ${sessions.length}\n`);

        // Wait a bit before stopping
        console.log('   Waiting 5 seconds before stopping...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 7. Stop the profile
        console.log('7. Stopping profile...');
        const stopResult = await profileService.stopProfile(profile.id);
        
        if (stopResult.success) {
          console.log(`   ✅ Profile stopped successfully!\n`);
        } else {
          console.log(`   ❌ Failed to stop profile\n`);
        }
      } else {
        console.log(`   ❌ Failed to launch profile\n`);
      }
    } else {
      console.log('5. No available slots - scheduling for later launch...');
      await profileService.scheduleProfileLaunch(profile.id);
      console.log(`   ✅ Profile scheduled for launch\n`);
    }

    // 8. Get all profiles
    console.log('8. Getting all profiles...');
    const allProfiles = await profileService.getAllProfiles();
    console.log(`   Total profiles: ${allProfiles.length}\n`);

    // 9. Test batch operations
    console.log('9. Testing batch launch (demo)...');
    const batchResults = await profileService.launchMultipleProfiles([profile.id], {
      headless: true
    });
    
    batchResults.forEach(result => {
      console.log(`   Profile ${result.profileId}: ${result.action} (${result.success ? 'success' : 'failed'})`);
    });

    console.log('\n🎉 Integration test completed successfully!');

    // Clean up - delete test profile
    await profileService.deleteProfile(profile.id);
    console.log('🧹 Test profile cleaned up');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    // Close database connection
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted by user');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  testAdsPowerIntegration().catch(console.error);
}

module.exports = testAdsPowerIntegration;