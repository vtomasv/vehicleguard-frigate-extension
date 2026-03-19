# ─────────────────────────────────────────────────────────────────────────────
# VehicleGuard — Multi-stage Dockerfile
# Stage 1: Build (installs all deps, compiles TypeScript + Vite)
# Stage 2: Runtime (only production deps + built artifacts)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY client/package.json ./client/
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend (Vite) + compile server TypeScript
RUN pnpm build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Install pnpm for production deps
RUN npm install -g pnpm@9

# Copy package files and install only production deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/shared ./shared

# Expose port (configured via PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Run migrations then start server
CMD ["sh", "-c", "pnpm db:push && node dist/server/index.js"]
