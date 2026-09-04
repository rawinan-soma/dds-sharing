# One image serves the whole application on one port (docs/adr/0003).

FROM node:22-alpine AS base
# Matches the npm version the checked-in package-lock.json files were generated
# with, so `npm ci` verifies cleanly regardless of what the base image bundles.
RUN npm install -g npm@11.7.0

FROM base AS web-build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM base AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/drizzle ./drizzle
COPY --from=web-build /app/web/dist/web/browser ./public

EXPOSE 3000
CMD ["node", "dist/main.js"]
