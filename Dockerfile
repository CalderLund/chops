# Build stage for backend
FROM node:20-slim AS backend-builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Build stage for frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built backend
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend
COPY --from=frontend-builder /app/web/dist ./web/dist

# Copy config directory if it exists
COPY config ./config

# Create data directory
RUN mkdir -p /root/.guitar-teacher

# Expose port (configurable via CHOPS_PORT env var, defaults to 3000 internal)
EXPOSE 3000

# Set default port
ENV CHOPS_PORT=3000

# Start the server
CMD ["node", "dist/server.js"]
