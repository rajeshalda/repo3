#!/usr/bin/env node
/**
 * PM2 Status Check Script
 * 
 * This script:
 * 1. Checks if PM2 is installed
 * 2. Checks if the AI agent is running
 * 3. Starts it if it's not running
 * 4. Provides a simple API endpoint for status checks
 */

const { execSync, exec } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PM2_PORT = 3100; // The port used by the AI agent's status server

// Check if PM2 is installed and AI agent is running
function checkPM2Status() {
  try {
    // Check if PM2 is installed
    try {
      execSync('pm2 -v', { stdio: 'ignore' });
      console.log('✅ PM2 is installed');
    } catch (error) {
      console.error('❌ PM2 is not installed. Please run: npm run pm2:install');
      return false;
    }

    // Check if the AI agent is running
    const pmList = execSync('pm2 jlist').toString();
    const processes = JSON.parse(pmList);
    const aiAgent = processes.find(proc => proc.name === 'ai-agent');

    if (aiAgent) {
      console.log('✅ AI agent is running with PM2');
      return true;
    } else {
      console.log('❌ AI agent is not running');
      return false;
    }
  } catch (error) {
    console.error('Error checking PM2 status:', error.message);
    return false;
  }
}

// Start the AI agent
function startAIAgent() {
  try {
    console.log('Starting AI agent...');
    execSync('npm run pm2:start', { stdio: 'inherit' });
    console.log('✅ AI agent started successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to start AI agent:', error.message);
    
    // Try direct approach
    try {
      console.log('Trying alternative start method...');
      execSync('pm2 start pm2.config.js', { stdio: 'inherit' });
      console.log('✅ AI agent started with direct command');
      return true;
    } catch (directError) {
      console.error('❌ All start attempts failed:', directError.message);
      return false;
    }
  }
}

// Check if AI agent API is responding
function checkAIAgentAPI() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: PM2_PORT,
      path: '/api/status',
      method: 'GET',
      timeout: 2000 // 2 second timeout
    }, (res) => {
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const status = JSON.parse(data);
            if (status.success && status.status === 'running') {
              console.log('✅ AI agent API is responding properly');
              resolve(true);
            } else {
              console.log('❌ AI agent API responded but status is not running');
              resolve(false);
            }
          } catch (e) {
            console.log('❌ AI agent API returned invalid JSON');
            resolve(false);
          }
        });
      } else {
        console.log(`❌ AI agent API returned status code ${res.statusCode}`);
        resolve(false);
      }
    });
    
    req.on('error', () => {
      console.log('❌ AI agent API is not responding');
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log('❌ AI agent API request timed out');
      req.abort();
      resolve(false);
    });
    
    req.end();
  });
}

// Main function
async function main() {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // Step 1: Check if PM2 is running the AI agent
  const isRunning = checkPM2Status();
  
  // Step 2: If not running, start it
  if (!isRunning) {
    if (!startAIAgent()) {
      console.error('Failed to start AI agent. Please check the logs for more information.');
      process.exit(1);
    }
  }
  
  // Step 3: Wait a moment for the service to start up
  console.log('Waiting for AI agent to initialize...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Step 4: Check if the API is responding
  const apiResponding = await checkAIAgentAPI();
  
  if (!apiResponding) {
    console.log('AI agent API is not responding properly. Attempting to restart...');
    try {
      execSync('npm run pm2:restart', { stdio: 'inherit' });
      console.log('AI agent restarted. Please check again in a few seconds.');
    } catch (error) {
      console.error('Failed to restart AI agent:', error.message);
    }
  }
  
  console.log('PM2 check completed');
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 