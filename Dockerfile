FROM node:22-alpine

WORKDIR /app

# Ensure data directory exists
RUN mkdir -p /data

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Default environment
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV VJ_DATA_DIR=/data
ENV NODE_OPTIONS="--experimental-sqlite"

EXPOSE 8080

CMD ["node", "--experimental-sqlite", "server.js"]
