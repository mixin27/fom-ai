# Build images in CI; deploy immutable commit tags/digests, never a moving latest tag.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --prod=false --ignore-scripts --frozen-lockfile
COPY apps/api apps/api
RUN pnpm build && pnpm --filter api deploy --prod /out

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8081 FOM_AI_SERVICE_ENABLED=false
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY LICENSE THIRD_PARTY_NOTICES.md ./
USER node
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8081/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/service/server.js"]
