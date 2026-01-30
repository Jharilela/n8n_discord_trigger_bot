FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine AS production
WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discordbot -u 1001

# Create data directory for backups
RUN mkdir -p /app/data && chown -R discordbot:nodejs /app/data

COPY --from=deps --chown=discordbot:nodejs /app/node_modules ./node_modules
COPY --chown=discordbot:nodejs package*.json ./
COPY --chown=discordbot:nodejs *.js ./
COPY --chown=discordbot:nodejs PRIVACY_POLICY.md ./

USER discordbot
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "docker-init.js"]
