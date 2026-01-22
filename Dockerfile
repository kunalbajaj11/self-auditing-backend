# Multi-stage build for NestJS application

# Stage 1: Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build


# Stage 2: Production stage
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install system dependencies (SSL + OCR stack)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ghostscript \
    graphicsmagick \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nestjs

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copy assets if needed
COPY --chown=nestjs:nodejs assets ./assets

# Create OCR debug directory with proper permissions for non-root user
# This directory is used for temporary PDF to image conversion files
RUN mkdir -p /app/ocr-debug && \
    chown -R nestjs:nodejs /app/ocr-debug && \
    chmod -R 755 /app/ocr-debug

# Verify poppler-utils is installed and pdftoppm is available
RUN which pdftoppm || (echo "ERROR: pdftoppm not found in PATH" && exit 1)

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start the application
CMD ["node", "dist/main.js"]
