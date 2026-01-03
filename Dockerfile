# Dependencies stage
FROM node:20-slim AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install LibreOffice, PostgreSQL 17 client tools, and OpenSSL for Prisma
# OpenSSL is required for Prisma engine detection in Docker environments
# PostgreSQL 17 client requires the official PostgreSQL APT repository
RUN apt-get update && \
    apt-get install -y \
    wget \
    ca-certificates \
    gnupg \
    lsb-release \
    --no-install-recommends && \
    # Add PostgreSQL official APT repository for PostgreSQL 17 (modern method)
    mkdir -p /etc/apt/keyrings && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg && \
    sh -c 'echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    apt-get update && \
    apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    postgresql-client-17 \
    openssl \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* \
    /etc/apt/sources.list.d/pgdg.list \
    /etc/apt/keyrings/postgresql.gpg

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Copy necessary files from standalone build
# Next.js standalone output includes everything needed in .next/standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Set ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# EXPOSE documents the container's internal port (used by docker-compose port mapping)
EXPOSE 3000

# HOSTNAME="0.0.0.0" makes Next.js listen on all network interfaces inside the container
# This is required for Docker networking (container must accept connections from outside)
ENV HOSTNAME="0.0.0.0"

# PORT default value (will be overridden by docker-compose.yml from .env file)
# This is the container's internal port - actual host port is mapped in docker-compose.yml
ENV PORT=3000

CMD ["node", "server.js"]

