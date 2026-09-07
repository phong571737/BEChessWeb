FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install pnpm and dependencies
RUN npm ci

# Copy application code
COPY . .

RUN npm run build

# Expose port
EXPOSE 8080

# Start the application
ENTRYPOINT ["node", "dist/server.js"]
