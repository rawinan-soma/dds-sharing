# DDS Sharing

See [`CONTEXT.md`](CONTEXT.md) for the domain and [`docs/spec.md`](docs/spec.md) / [`docs/srs.md`](docs/srs.md) for the specification.

## Package manager

**pnpm only.** `server/` (NestJS) and `web/` (Angular) are a single pnpm workspace — see `pnpm-workspace.yaml`. Never use `npm` or `yarn`; there is no `package-lock.json` or `yarn.lock`, and both are gitignored as a guard.

## Run it

```
pnpm install
docker compose up
```

Brings up Postgres, Redis (AOF persistence), MinIO, Mailpit and the app on one host, one container, one port. Drizzle migrations run automatically on boot.

```
docker compose down
```

is the whole kill switch.

## Develop

```
pnpm --filter server run start:dev
pnpm --filter web run start
```

## Database migrations

Schema lives in `server/src/db/schema.ts`. After changing it:

```
pnpm --filter server run db:generate   # writes a new migration under server/drizzle/
pnpm --filter server run migrate       # applies pending migrations — also runs automatically on boot
```

`DATABASE_URL` must be set for both.

## Health

`GET /health` (and its alias `GET /health/scheduler`) answers unauthenticated with per-component statuses for `scheduler`, `extraction`, `disk` and `mail`. Only `disk` is a real check at this stage — it warns at 75% used, is unhealthy at 90%, and a non-200 aggregate is returned when any component is unhealthy.
