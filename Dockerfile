FROM node:22-alpine

WORKDIR /app

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

EXPOSE 8080

CMD ["node", "server.js"]

