# Use Node.js 20 LTS as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install PM2 globally and other utilities
RUN npm install -g pm2 && \
    apk add --no-cache bash curl tzdata python3 make g++

# Set timezone to UTC for consistency
ENV TZ=UTC

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies with --force flag as specified
RUN npm install --force

# Copy .env.local first (to be used during build)
COPY .env.local ./.env.local

# Update .env.local for Azure
RUN sed -i "s|http://localhost:8080|https://chronopulse.azurewebsites.net|g" .env.local && \
    sed -i "s|http://localhost:3100|http://localhost:3100|g" .env.local

# Copy the rest of the application
COPY . .

# Rebuild native modules for Linux (especially better-sqlite3)
RUN npm rebuild better-sqlite3

# Create a simple startup file with better error handling
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'set -e' >> /app/start.sh && \
    echo 'echo "Container timezone: $(date)"' >> /app/start.sh && \
    echo 'echo "Starting PM2 for AI agent..."' >> /app/start.sh && \
    echo 'pm2 start pm2.config.js' >> /app/start.sh && \
    echo 'sleep 3' >> /app/start.sh && \
    echo 'pm2 status' >> /app/start.sh && \
    echo 'echo "Starting Next.js..."' >> /app/start.sh && \
    echo 'cd /app && exec node node_modules/next/dist/bin/next start -p 8080' >> /app/start.sh

# Make the startup script executable
RUN chmod +x /app/start.sh

# Build the Next.js application (with environment variables from .env.local)
RUN npm run build

# Expose the port the app runs on
EXPOSE 8080

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/pm2/status || exit 1

# Command to run the app
CMD ["/app/start.sh"]