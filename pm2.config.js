const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.config({ path: envPath }).parsed || {};

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!require('fs').existsSync(logsDir)) {
  require('fs').mkdirSync(logsDir, { recursive: true });
}

module.exports = {
  apps: [
    {
      name: 'ai-agent',
      script: 'ai-agent-server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        ...envConfig
      },
      env_production: {
        NODE_ENV: 'production',
        PM2_HOME: path.join(process.cwd(), '.pm2'), // Store PM2 files in the app directory
        ...envConfig
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      output: './logs/ai-agent-out.log',
      error: './logs/ai-agent-error.log',
      // Graceful shutdown with signals
      kill_timeout: 5000,
      // Keep track of which users have enabled the AI agent
      user_data: './src/ai-agent/data/storage/json/pm2-user-data.json',
      // Production specific settings
      production_mode: process.env.NODE_ENV === 'production',
      // Azure App Service specific settings
      azure_webapp: process.env.WEBSITE_SITE_NAME ? true : false,
    },
  ],
}; 