FROM node:20-alpine

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install all dependencies including dev dependencies
RUN npm install --legacy-peer-deps

# Copy rest of the application
COPY . .

# Create a dummy .env.local file for build process
RUN echo "AZURE_AD_APP_CLIENT_ID=dummy-client-id" > .env.local && \
    echo "AZURE_AD_APP_CLIENT_SECRET=dummy-secret" >> .env.local && \
    echo "AZURE_AD_APP_TENANT_ID=dummy-tenant-id" >> .env.local && \
    echo "NEXTAUTH_URL=http://localhost:8080" >> .env.local && \
    echo "NEXTAUTH_SECRET=dummy-secret" >> .env.local && \
    echo "AZURE_OPENAI_ENDPOINT=dummy-endpoint" >> .env.local && \
    echo "AZURE_OPENAI_API_KEY=dummy-api-key" >> .env.local && \
    echo "AZURE_OPENAI_DEPLOYMENT=dummy-deployment" >> .env.local

# Build the Next.js application
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Create directories for PM2
RUN mkdir -p logs .pm2/logs

# Create a properly formatted startup script
RUN printf '#!/bin/sh\n\
# Start PM2 with pm2-runtime to run in foreground\n\
pm2-runtime start pm2.config.js &\n\
# Wait a moment for PM2 to start\n\
sleep 5\n\
# Start Next.js server\n\
node server.js\n' > start.sh && \
chmod +x start.sh

# Expose the port
EXPOSE 8080

# Start the application
CMD ["./start.sh"] 