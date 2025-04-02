const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 8080;

// Always set START_PM2 in development mode unless explicitly set to 'false'
if (dev && process.env.START_PM2 !== 'false') {
  process.env.START_PM2 = 'true';
}

// Check if PM2 is installed and AI-agent is running
const checkAndStartPM2 = () => {
  try {
    // Check if PM2 is installed
    try {
      execSync('pm2 -v', { stdio: 'ignore' });
      console.log('PM2 is installed');
    } catch (error) {
      console.warn('PM2 is not installed. AI-agent will not run in the background.');
      console.warn('Run "npm run pm2:install" to install PM2 globally.');
      return;
    }

    // Check if the AI-agent is already running
    try {
      const pmList = execSync('pm2 jlist').toString();
      const processes = JSON.parse(pmList);
      const aiAgent = processes.find(proc => proc.name === 'ai-agent');

      if (aiAgent) {
        console.log('AI-agent is already running with PM2');
        // Ensure the agent is running correctly by checking its status
        const status = execSync('pm2 show ai-agent').toString();
        if (status.includes('status') && !status.includes('online')) {
          console.log('AI-agent is not in online state, restarting...');
          execSync('npm run pm2:restart');
          console.log('AI-agent restarted successfully');
        }
      } else {
        console.log('Starting AI-agent with PM2...');
        try {
          execSync('npm run pm2:start');
          console.log('AI-agent started successfully');
        } catch (startError) {
          console.error('Failed to start AI-agent with PM2:', startError.message);
          // Try a more direct approach as fallback
          try {
            execSync('pm2 start pm2.config.js');
            console.log('AI-agent started using direct PM2 command');
          } catch (directError) {
            console.error('Failed to start AI-agent directly:', directError.message);
          }
        }
      }
    } catch (error) {
      console.error('Error checking or starting AI-agent with PM2:', error.message);
      // Try starting the agent regardless of error
      try {
        execSync('npm run pm2:start');
        console.log('AI-agent started after error recovery');
      } catch (startError) {
        console.error('Failed to start AI-agent with PM2 after error:', startError.message);
        // Last resort - try direct command
        try {
          execSync('pm2 start pm2.config.js');
          console.log('AI-agent started using direct PM2 command after error');
        } catch (directError) {
          console.error('All attempts to start AI-agent failed');
        }
      }
    }
  } catch (error) {
    console.error('Error in checkAndStartPM2:', error);
  }
};

// Create logs directory at startup
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Start the PM2 service if in development mode or if explicitly enabled
if (process.env.START_PM2 === 'true') {
  console.log('START_PM2 is true, starting PM2 service...');
  checkAndStartPM2();
} else {
  console.log('START_PM2 is not set to true, skipping PM2 startup');
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
}); 