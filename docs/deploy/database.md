---
title: Database
summary: Local Docker Postgres vs hosted Postgres
---

Paperclip uses PostgreSQL via Drizzle ORM. It no longer starts an embedded database automatically.

`pnpm db:migrate` resolves the target database from `DATABASE_URL`, adjacent `.paperclip/.env`, repo-root `.env`, or `config.database.connectionString`.

## 1. Local PostgreSQL (Docker)

For a full PostgreSQL server locally:

```sh
docker compose up -d
```

This starts PostgreSQL 17 on `localhost:5432`. Set the connection string:

```sh
cp .env.example .env
# DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
```

Push the schema:

```sh
pnpm db:migrate
```

## 2. Hosted PostgreSQL (Supabase)

For production, use a hosted provider like [Supabase](https://supabase.com/).

1. Create a project at [database.new](https://database.new)
2. Copy the connection string from Project Settings > Database
3. Set `DATABASE_URL` in your `.env`

Use the **direct connection** (port 5432) for migrations and the **pooled connection** (port 6543) for the application.

If using connection pooling, disable prepared statements:

```ts
// packages/db/src/client.ts
export function createDb(url: string) {
  const sql = postgres(url, { prepare: false });
  return drizzlePg(sql, { schema });
}
```

The Drizzle schema (`packages/db/src/schema/`) is the same regardless of which PostgreSQL server you target.
