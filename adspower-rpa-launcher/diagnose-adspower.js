const axios = require('axios');

/**
 * AdsPower Connection Diagnostic Tool
 * This script helps diagnose connection issues with AdsPower
 */

async function diagnoseAdsPowerConnection() {
  console.log('🔍 AdsPower Connection Diagnostic Tool\n');

  const baseURL = 'http://local.adspower.net:50325';
  const timeout = 5000;

  // Test 1: Basic connectivity
  console.log('1. Testing basic connectivity...');
  try {
    const response = await axios.get(`${baseURL}/api/v1/user/list`, {
      timeout,
      params: { page: 1, page_size: 1 }
    });
    
    if (response.status === 200) {
      console.log('   ✅ AdsPower API is accessible');
      console.log(`   📊 Response code: ${response.data.code}`);
      console.log(`   📄 Response message: ${response.data.msg}`);
      
      if (response.data.code === 0) {
        console.log('   🎉 AdsPower is working correctly!\n');
        return true;
      } else {
        console.log('   ⚠️  AdsPower API returned error code\n');
        return false;
      }
    }
  } catch (error) {
    console.log('   ❌ Connection failed');
    console.log(`   📝 Error: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   💡 AdsPower desktop application is not running\n');
    } else if (error.code === 'ENOTFOUND') {
      console.log('   💡 DNS resolution failed - check hostname\n');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('   💡 Connection timed out - check firewall/antivirus\n');
    } else {
      console.log('   💡 Unknown connection error\n');
    }
  }

  // Test 2: Alternative URL format
  console.log('2. Testing alternative URL format...');
  try {
    const altURL = 'http://127.0.0.1:50325';
    const response = await axios.get(`${altURL}/api/v1/user/list`, {
      timeout,
      params: { page: 1, page_size: 1 }
    });
    
    if (response.status === 200) {
      console.log('   ✅ Alternative URL works');
      console.log('   💡 Consider updating baseURL to use 127.0.0.1\n');
      return true;
    }
  } catch (error) {
    console.log('   ❌ Alternative URL also failed\n');
  }

  // Test 3: Port accessibility
  console.log('3. Testing port accessibility...');
  try {
    const net = require('net');
    const client = new net.Socket();
    
    const testPort = () => new Promise((resolve, reject) => {
      client.setTimeout(3000);
      client.connect(50325, '127.0.0.1', () => {
        console.log('   ✅ Port 50325 is open');
        client.destroy();
        resolve(true);
      });
      
      client.on('error', (err) => {
        console.log('   ❌ Port 50325 is not accessible');
        console.log(`   📝 Error: ${err.message}`);
        reject(err);
      });
      
      client.on('timeout', () => {
        console.log('   ❌ Port connection timed out');
        client.destroy();
        reject(new Error('Timeout'));
      });
    });
    
    await testPort();
  } catch (error) {
    console.log('   💡 Port is not accessible - AdsPower is likely not running\n');
  }

  return false;
}

async function showRecommendations() {
  console.log('📋 Troubleshooting Recommendations:\n');
  
  console.log('🔧 If AdsPower is not running:');
  console.log('   1. Launch the AdsPower desktop application');
  console.log('   2. Wait for it to fully load');
  console.log('   3. Check that the application is not minimized to system tray\n');
  
  console.log('⚙️  If AdsPower is running but not accessible:');
  console.log('   1. Check AdsPower settings for "Local API" option');
  console.log('   2. Ensure the API is enabled and using port 50325');
  console.log('   3. Restart AdsPower if you just enabled the API\n');
  
  console.log('🔥 If firewall/antivirus is blocking:');
  console.log('   1. Add AdsPower to your antivirus/firewall whitelist');
  console.log('   2. Temporarily disable firewall to test');
  console.log('   3. Check Windows Defender or third-party security software\n');
  
  console.log('🔄 If you want to test without AdsPower:');
  console.log('   1. The system automatically switches to demo mode');
  console.log('   2. Demo mode simulates profile operations');
  console.log('   3. All features work but no real browser profiles are created\n');
}

async function testAPIEndpoints() {
  console.log('🌐 Testing API endpoints...\n');
  
  const endpoints = [
    'http://localhost:3001/api/health',
    'http://localhost:3001/api/profiles/adspower/status',
    'http://localhost:3001/api/profiles/adspower/diagnose'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, { timeout: 5000 });
      console.log(`✅ ${endpoint} - Status: ${response.status}`);
      
      if (endpoint.includes('diagnose')) {
        console.log('   📊 Diagnosis data:', JSON.stringify(response.data.data, null, 2));
      }
    } catch (error) {
      console.log(`❌ ${endpoint} - Error: ${error.message}`);
    }
  }
  console.log();
}

// Main execution
async function main() {
  try {
    const isConnected = await diagnoseAdsPowerConnection();
    
    if (!isConnected) {
      await showRecommendations();
    }
    
    // Test API endpoints if the main server is running
    console.log('🔗 Testing RPA Launcher API...');
    await testAPIEndpoints();
    
    console.log('✅ Diagnostic complete!');
    console.log('\n💡 Next steps:');
    if (!isConnected) {
      console.log('   - Start AdsPower desktop application');
      console.log('   - Enable Local API in AdsPower settings');
      console.log('   - Run this diagnostic again');
    } else {
      console.log('   - AdsPower is working correctly');
      console.log('   - You can create and launch profiles normally');
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Diagnostic interrupted by user');
  process.exit(0);
});

// Run the diagnostic
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { diagnoseAdsPowerConnection, showRecommendations };