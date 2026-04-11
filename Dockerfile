FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Start the application
ENTRYPOINT ["node", "./src/js/server.js"]
