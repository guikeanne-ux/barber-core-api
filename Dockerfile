FROM node:24.18.0-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm run openapi:generate

FROM deps AS production-deps
RUN npm prune --omit=dev

FROM node:24.18.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi ./openapi
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
COPY package.json package-lock.json ./
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health/live').then((res)=>{if(!res.ok) process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/index.js"]
