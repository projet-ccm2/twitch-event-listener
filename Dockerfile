# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

# Copy source code and build
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Use non-root user for security
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
