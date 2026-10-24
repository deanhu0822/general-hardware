# Single-host pilot image: one Node process serving Next.js plus the in-process
# packet worker, with durable SQLite on a mounted volume. Not for serverless.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/synthetic-assets ./synthetic-assets
# Durable state. Mount a persistent volume here and point FORMA_CHANGE_DB at it.
VOLUME ["/data"]
ENV FORMA_CHANGE_DB=/data/caid.sqlite
ENV PORT=3000
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
