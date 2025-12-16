FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install system dependencies required for native modules (e.g. @sentry/profiling-node)
RUN apk add --no-cache python3 make g++ \
  && npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]

