# One image serves the SPA and the API from a single origin (ADR-0003).
FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter web run build
RUN pnpm --filter api run build

ENV NODE_ENV=production
ENV PORT=3000
ENV STATIC_ROOT=../../apps/web/dist/web/browser

WORKDIR /app/apps/api

EXPOSE 3000

# The whole environment is checked first: the migration runner validates only
# DATABASE_URL, and a bad SMTP_PASS should stop the image before it migrates.
CMD ["sh", "-c", "node dist/config/check.js && node dist/db/migrate.js && node dist/main.js"]
