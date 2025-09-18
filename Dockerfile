# Build stage
FROM node:22-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.16.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code (excluding files in .dockerignore)
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:22-alpine

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.16.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Expose port (Railway will override this with PORT env var)
EXPOSE 8080

# Start the application with proper signal handling
CMD ["node", "dist/main"]