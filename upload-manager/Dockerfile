FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma.config.* ./
COPY src/prisma ./src/prisma/

# Install dependencies
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate --schema ./src/prisma/schema.prisma

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma.config.* ./
COPY src/prisma ./src/prisma/

# Install production dependencies only
RUN npm ci --only=production

# Generate Prisma Client
RUN npx prisma generate --schema ./src/prisma/schema.prisma

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3002

# Start application
CMD ["node", "dist/main"]
