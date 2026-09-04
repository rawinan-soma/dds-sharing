# DDS Sharing

See [`CONTEXT.md`](CONTEXT.md) for the domain glossary and [`docs/spec.md`](docs/spec.md) for the full specification.

## Running it

```
docker compose up
```

brings up Postgres, Redis (AOF persistence on), MinIO, Mailpit and the application on one host. The app serves both the API and the built Angular SPA from the same origin — `http://localhost:3000` once it's up.

```
docker compose down
```

is the whole kill switch (docs/adr/0003).

## Migrations

Drizzle migrations run automatically on boot — a fresh checkout never needs a manual step.

To generate a migration from a schema change, or apply migrations without starting the app (`server/`):

```
npm run db:generate   # writes SQL under server/drizzle from src/db/schema.ts
npm run db:migrate    # applies pending migrations to DATABASE_URL
```

## Local development (without Docker)

```
cd server && npm install && npm run start:dev   # NestJS API on :3000
cd web && npm install && npm start               # Angular dev server on :4200, proxying /api, /health, /d to :3000
```

The server needs `DATABASE_URL` and `BASE_URL` set (see `.env.example`) and a running Postgres — `docker compose up postgres` is the quickest way to get one.

## Health

`GET /health` (and its alias `GET /health/scheduler`) is unauthenticated and reports per-component status for `scheduler`, `extraction`, `disk` and `mail`. Only `disk` is a real check at this stage; the others report a healthy placeholder until their owning slice lands (docs/spec.md §14.1). The endpoint returns a non-200 status if any component is unhealthy.
