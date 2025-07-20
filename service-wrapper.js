const path = require('path');
const { execSync, spawn } = require('child_process');
const fs = require('fs');

// Set working directory
process.chdir('C:\\Users\\rajeshalda\\Documents\\GitHub\\repo3');

// Create logs directory
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Log function
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = [${timestamp}] ${message}\n;
    console.log(logMessage.trim());
    fs.appendFileSync(path.join(logsDir, 'service.log'), logMessage);
}

log('MeetingTimeTracker Service Starting...');

try {
    // Set environment variables
    process.env.NODE_ENV = 'production';
    process.env.START_PM2 = 'true';
    
    log('Environment set to production');
    
    // Install dependencies if needed
    if (!fs.existsSync('node_modules')) {
        log('Installing dependencies...');
        execSync('npm install', { stdio: 'inherit' });
    }
    
    // Install PM2 globally if not present
    try {
        execSync('pm2 --version', { stdio: 'ignore' });
        log('PM2 is available');
    } catch (e) {
        log('Installing PM2...');
        execSync('npm install -g pm2', { stdio: 'inherit' });
    }
    
    // Build the application if needed
    if (!fs.existsSync('.next')) {
        log('Building application...');
        execSync('npm run build', { stdio: 'inherit' });
    }
    
    // Start PM2 service first
    log('Starting PM2 service...');
    try {
        execSync('pm2 start pm2.config.js', { stdio: 'inherit' });
    } catch (e) {
        log('PM2 start error (might already be running): ' + e.message);
    }
    
    // Start the main application
    log('Starting Next.js application...');
    const nodeProcess = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', '8080'], {
        stdio: 'inherit',
        env: process.env
    });
    
    nodeProcess.on('error', (err) => {
        log('Application error: ' + err.message);
    });
    
    nodeProcess.on('exit', (code) => {
        log(Application exited with code ${code});
        if (code !== 0) {
            // Restart after delay
            setTimeout(() => {
                log('Restarting application...');
                process.exit(1);
            }, 5000);
        }
    });
    
    log('Application started successfully on port 8080');
    
} catch (error) {
    log('Startup error: ' + error.message);
    process.exit(1);
}
