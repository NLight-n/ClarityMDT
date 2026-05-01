#!/bin/sh
set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy
echo "✅ Migrations complete."

echo "🚀 Starting Next.js server..."
exec node server.js
