# ─────────────────────────────────────────────────────────────────────────────
# VehicleGuard — Multi-stage Dockerfile
# Stage 1: Build (installs all deps, compiles TypeScript + Vite)
# Stage 2: Runtime (only production deps + built artifacts)
#
# Build output layout (all under dist/):
#   dist/index.js      → esbuild server bundle
#   dist/public/       → Vite frontend bundle (served as static files)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm matching packageManager field in package.json (pnpm@10.x)
RUN npm install -g pnpm@10

# Copy package manifests + patches (pnpm requires patches before install)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install all dependencies (dev + prod needed for build)
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build:
#   1. vite build  → dist/public/  (frontend static bundle)
#   2. esbuild     → dist/index.js (server bundle)
RUN pnpm build

# Verify build output exists
RUN ls -la dist/ && ls -la dist/public/

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Install pnpm (needed for production install)
RUN npm install -g pnpm@10

# Copy package manifests + patches and install only production deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile --prod

# Copy entire dist/ from builder (contains server + frontend)
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations folder (SQL files needed by migrate.mjs at startup)
COPY --from=builder /app/drizzle ./drizzle

# Copy migration script (uses drizzle-orm/migrator, no drizzle-kit needed)
COPY migrate.mjs ./

# Copy shared types used at runtime
COPY --from=builder /app/shared ./shared

# Expose port (configured via PORT env var, defaults to 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# Run DB migrations (via drizzle-orm migrator) then start the server
CMD ["sh", "-c", "node migrate.mjs && node dist/index.js"]
