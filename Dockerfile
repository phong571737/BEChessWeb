FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install pnpm and dependencies
RUN npm install

# Copy application code
COPY . .

RUN npm run build

# Expose port
EXPOSE 8080

# Start the application
ENTRYPOINT ["node", "dist/js/server.js"]
