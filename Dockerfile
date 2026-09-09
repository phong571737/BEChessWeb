FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

RUN npm run build

# Run the API without root privileges.
RUN addgroup --system --gid 1001 appgroup \
 && adduser --system --uid 1001 --ingroup appgroup appuser \
 && chown -R appuser:appgroup /app

# Expose port
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

USER appuser
# Start the application
ENTRYPOINT ["node", "dist/server.js"]
