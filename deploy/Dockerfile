# syntax=docker/dockerfile:1
FROM node:22-alpine AS base

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# --ignore-scripts: scripts/copy-monaco-assets.mjs (referenced by the
# postinstall hook) isn't copied into this layer yet — it only needs
# node_modules cached here. We run it explicitly in the builder stage
# below, once the full source tree is present.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# ---- build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN node scripts/copy-monaco-assets.mjs
RUN npm run build

# ---- runtime ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    WORKSPACE_DIR=/workspace

# standalone output does not include public/ or .next/static — copy manually
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/workspace-demo ./workspace-demo
COPY deploy/entrypoint.sh ./entrypoint.sh

RUN mkdir -p /data /workspace \
    && chown -R node:node /app /data /workspace \
    && chmod +x ./entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
