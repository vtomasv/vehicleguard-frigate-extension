# ─────────────────────────────────────────────────────────────────────────────
# VehicleGuard — Multi-stage Dockerfile
# Stage 1: Build (installs all deps, compiles TypeScript + Vite)
# Stage 2: Runtime (only production deps + built artifacts)
#
# Structure: monorepo with single package.json at root
# Build output:
#   - client/dist/  → Vite frontend bundle
#   - dist/         → esbuild server bundle (dist/index.js)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy package manifests + patches (pnpm requires patches before install)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install all dependencies (dev + prod)
RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build frontend (Vite → client/dist/) + server (esbuild → dist/index.js)
RUN pnpm build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Install pnpm (needed for db:push at startup)
RUN npm install -g pnpm@9

# Copy package manifests + patches and install only production deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Copy drizzle schema + migrations (needed for db:push at startup)
COPY --from=builder /app/drizzle ./drizzle
COPY drizzle.config.ts ./

# Copy shared types used at runtime
COPY --from=builder /app/shared ./shared

# Expose port (configured via PORT env var, defaults to 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# Run DB migrations then start the server
CMD ["sh", "-c", "pnpm db:push && node dist/index.js"]
