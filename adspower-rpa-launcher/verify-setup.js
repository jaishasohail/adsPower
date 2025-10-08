const axios = require('axios');
const chalk = require('chalk');

/**
 * AdsPower Setup Verification Script
 * This script helps verify each step of the AdsPower setup process
 */

class SetupVerifier {
  constructor() {
    this.steps = [];
    this.currentStep = 0;
  }

  addStep(name, testFn, instructions) {
    this.steps.push({ name, testFn, instructions });
  }

  async runStep(stepIndex) {
    const step = this.steps[stepIndex];
    if (!step) return false;

    console.log(`\n📋 Step ${stepIndex + 1}: ${step.name}`);
    console.log('━'.repeat(50));

    try {
      const result = await step.testFn();
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        return true;
      } else {
        console.log(chalk.red(`❌ ${result.message}`));
        if (step.instructions) {
          console.log(chalk.yellow('\n💡 What to do:'));
          step.instructions.forEach(instruction => {
            console.log(chalk.yellow(`   ${instruction}`));
          });
        }
        return false;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      if (step.instructions) {
        console.log(chalk.yellow('\n💡 What to do:'));
        step.instructions.forEach(instruction => {
          console.log(chalk.yellow(`   ${instruction}`));
        });
      }
      return false;
    }
  }

  async runAll() {
    console.log(chalk.blue.bold('🚀 AdsPower Setup Verification\n'));
    
    let successCount = 0;
    
    for (let i = 0; i < this.steps.length; i++) {
      const success = await this.runStep(i);
      if (success) {
        successCount++;
      } else {
        console.log(chalk.red(`\n⏸️  Setup verification stopped at step ${i + 1}`));
        console.log(chalk.yellow('Please fix the issue above and run the script again.\n'));
        return false;
      }
    }

    if (successCount === this.steps.length) {
      console.log(chalk.green.bold('\n🎉 All steps completed successfully!'));
      console.log(chalk.green('✅ AdsPower is properly connected to your server'));
      console.log(chalk.blue('\n🚀 You can now create and launch real profiles!'));
      return true;
    }

    return false;
  }
}

// Initialize verifier
const verifier = new SetupVerifier();

// Step 1: Check if your server is running
verifier.addStep(
  'Verify RPA Launcher Server',
  async () => {
    const response = await axios.get('http://localhost:3001/api/health', { timeout: 5000 });
    if (response.status === 200) {
      return { success: true, message: 'RPA Launcher server is running' };
    }
    return { success: false, message: 'RPA Launcher server is not responding' };
  },
  [
    '1. Make sure your server is running: npm start',
    '2. Check if port 3001 is available',
    '3. Look for any error messages in the terminal'
  ]
);

// Step 2: Test AdsPower direct connection
verifier.addStep(
  'Test AdsPower Direct Connection',
  async () => {
    try {
      const response = await axios.get('http://local.adspower.net:50325/api/v1/user/list', {
        timeout: 5000,
        params: { page: 1, page_size: 1 }
      });
      
      if (response.status === 200 && response.data.code === 0) {
        return { success: true, message: 'AdsPower API is accessible and working' };
      } else {
        return { success: false, message: `AdsPower API returned error: ${response.data.msg}` };
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return { success: false, message: 'AdsPower is not running or API is not enabled' };
      }
      return { success: false, message: `Connection failed: ${error.message}` };
    }
  },
  [
    '1. Launch AdsPower desktop application',
    '2. Run AdsPower as Administrator',
    '3. Go to Settings → Advanced → Local API',
    '4. Enable "Local API Server" checkbox',
    '5. Verify port is set to 50325',
    '6. Save settings and restart AdsPower'
  ]
);

// Step 3: Check server connection to AdsPower
verifier.addStep(
  'Verify Server-AdsPower Integration',
  async () => {
    const response = await axios.get('http://localhost:3001/api/profiles/adspower/status', { timeout: 5000 });
    const data = response.data.data;
    
    if (data.isConnected && !data.demoMode) {
      return { success: true, message: 'Server successfully connected to AdsPower' };
    } else if (data.demoMode) {
      return { success: false, message: 'Server is in demo mode - AdsPower not detected' };
    } else {
      return { success: false, message: 'Server cannot connect to AdsPower' };
    }
  },
  [
    '1. Wait 30 seconds for auto-reconnection',
    '2. Restart your RPA Launcher server',
    '3. Ensure AdsPower is running and API is enabled',
    '4. Check firewall/antivirus settings'
  ]
);

// Step 4: Test profile creation
verifier.addStep(
  'Test Profile Creation',
  async () => {
    const profileData = {
      name: `Setup Test ${Date.now()}`,
      device_type: 'PC',
      target_url: 'https://google.com'
    };

    const response = await axios.post('http://localhost:3001/api/profiles', profileData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (response.data.success && response.data.data.ads_power_id) {
      // Clean up test profile
      try {
        await axios.delete(`http://localhost:3001/api/profiles/${response.data.data.id}`);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      return { success: true, message: 'Profile creation successful with AdsPower integration' };
    } else {
      return { success: false, message: 'Profile creation failed or no AdsPower ID assigned' };
    }
  },
  [
    '1. Ensure AdsPower is running and connected',
    '2. Check AdsPower account status and subscription',
    '3. Verify you have available profile slots in AdsPower',
    '4. Check AdsPower logs for any error messages'
  ]
);

// Step 5: Test profile launching (optional)
verifier.addStep(
  'Test Profile Launch (Quick Test)',
  async () => {
    // Create a test profile first
    const profileData = {
      name: `Launch Test ${Date.now()}`,
      device_type: 'PC',
      target_url: 'https://google.com'
    };

    const createResponse = await axios.post('http://localhost:3001/api/profiles', profileData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (!createResponse.data.success) {
      return { success: false, message: 'Could not create test profile for launch test' };
    }

    const profileId = createResponse.data.data.id;

    try {
      // Test launch
      const launchResponse = await axios.post(`http://localhost:3001/api/profiles/${profileId}/launch`, {}, {
        timeout: 15000
      });

      if (launchResponse.data.success) {
        // Stop the profile
        await axios.post(`http://localhost:3001/api/profiles/${profileId}/stop`);
        
        // Clean up
        await axios.delete(`http://localhost:3001/api/profiles/${profileId}`);
        
        return { success: true, message: 'Profile launch and stop successful' };
      } else {
        return { success: false, message: 'Profile launch failed' };
      }
    } catch (launchError) {
      // Clean up on error
      try {
        await axios.delete(`http://localhost:3001/api/profiles/${profileId}`);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      return { success: false, message: `Launch test failed: ${launchError.message}` };
    }
  },
  [
    '1. Ensure you have available profile slots',
    '2. Check your system resources (RAM, CPU)',
    '3. Verify AdsPower subscription allows profile launching',
    '4. Try launching manually in AdsPower first'
  ]
);

// Function to prompt for user action
async function waitForUserAction(message) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\n${message}\nPress Enter to continue...`, () => {
      rl.close();
      resolve();
    });
  });
}

// Main execution
async function main() {
  console.log(chalk.cyan('Welcome to AdsPower Setup Verification!'));
  console.log(chalk.gray('This script will guide you through connecting AdsPower to your server.\n'));

  // Check if chalk is available (for colors)
  if (!chalk.green) {
    console.log('Note: Install chalk for colored output: npm install chalk\n');
  }

  const success = await verifier.runAll();

  if (success) {
    console.log(chalk.green.bold('\n🎊 Setup Complete! 🎊'));
    console.log(chalk.green('\nYour AdsPower integration is working perfectly!'));
    console.log(chalk.blue('\nNext steps:'));
    console.log(chalk.blue('• Create profiles via API or frontend'));
    console.log(chalk.blue('• Launch profiles to open real browsers'));
    console.log(chalk.blue('• Use WebSocket endpoints for automation'));
    console.log(chalk.blue('• Monitor profiles via the dashboard'));
  } else {
    console.log(chalk.red.bold('\n❌ Setup Incomplete'));
    console.log(chalk.yellow('\nDon\'t worry! You can:'));
    console.log(chalk.yellow('• Continue in demo mode for development'));
    console.log(chalk.yellow('• Fix the issues and run this script again'));
    console.log(chalk.yellow('• Check ADSPOWER_SETUP_GUIDE.md for detailed instructions'));
  }

  console.log(chalk.gray('\n📚 For detailed help: Check ADSPOWER_SETUP_GUIDE.md'));
  console.log(chalk.gray('🐛 For troubleshooting: Run node diagnose-adspower.js'));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Setup verification interrupted by user'));
  process.exit(0);
});

// Run the verification
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n❌ Setup verification failed:'), error.message);
    process.exit(1);
  });
}

module.exports = { SetupVerifier };