FROM node:20-slim

WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

EXPOSE 8080
CMD ["node", "server.js"]
