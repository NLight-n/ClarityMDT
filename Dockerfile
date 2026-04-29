# Dependencies stage
FROM node:20-slim AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Offline-friendly Prisma Studio runtime stage
# The app itself uses Prisma 7. This target intentionally pins only the Studio
# container to Prisma 5, whose Studio assets are bundled instead of loaded from
# public CDNs at runtime.
FROM node:20-slim AS prisma-studio

WORKDIR /studio

RUN apt-get update && \
    apt-get install -y ca-certificates openssl --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm init -y && npm install prisma@5.22.0 --omit=dev

COPY prisma/schema.prisma ./prisma/schema.prisma

RUN node -e "const fs=require('fs'); const p='prisma/schema.prisma'; const s=fs.readFileSync(p,'utf8'); const next=s.replace(/datasource db \\{\\s*provider = \"postgresql\"\\s*\\}/, 'datasource db {\\n  provider = \"postgresql\"\\n  url      = env(\"DATABASE_URL\")\\n}'); if (next === s) throw new Error('Could not inject DATABASE_URL into Prisma Studio schema'); fs.writeFileSync(p,next);"

ENV NODE_ENV=production
ENV BROWSER=none

EXPOSE 5555

CMD ["./node_modules/.bin/prisma", "studio", "--schema", "/studio/prisma/schema.prisma", "--port", "5555", "--hostname", "0.0.0.0", "--browser", "none"]

# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Cache bust argument - change this to force rebuild
ARG CACHE_BUST=1

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma schema files first (needed for generate)
COPY prisma ./prisma

# Generate Prisma Client (needs schema files)
RUN npx prisma generate

# Copy the rest of the application files
COPY . .

# Force rebuild by echoing cache bust value
RUN echo "Cache bust: ${CACHE_BUST}"

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install LibreOffice, PostgreSQL 17 client tools, OpenSSL for Prisma, and fonts
# OpenSSL is required for Prisma engine detection in Docker environments
# PostgreSQL 17 client requires the official PostgreSQL APT repository
# Fonts are required for proper PDF conversion (Microsoft-compatible fonts)
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
    # Microsoft-compatible fonts for proper PDF conversion
    fonts-liberation \
    fonts-liberation2 \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    fonts-freefont-ttf \
    fonts-noto \
    fonts-noto-core \
    fontconfig \
    --no-install-recommends && \
    # Update font cache
    fc-cache -f -v && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* \
    /etc/apt/sources.list.d/pgdg.list \
    /etc/apt/keyrings/postgresql.gpg

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Create LibreOffice home directory with proper permissions
# LibreOffice needs a writable directory for user installation
RUN mkdir -p /tmp/libreoffice-home && \
    chown -R nodejs:nodejs /tmp/libreoffice-home

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

# PORT is always 3000 inside the container (host port is configurable via .env in docker-compose.yml)
ENV PORT=3000

# Suppress dconf warnings from LibreOffice (harmless but noisy in logs)
# This prevents permission denied warnings when LibreOffice tries to create cache directories
ENV DCONF_PROFILE=""

# Set LibreOffice home directory to a writable location
# This prevents "User installation could not be completed" errors
ENV HOME="/tmp/libreoffice-home"

CMD ["node", "server.js"]
