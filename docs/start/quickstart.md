---
title: Quickstart
summary: Get Paperclip running in minutes
---

Get Paperclip running locally in under 5 minutes.

## Quick Start (Recommended)

```sh
npx paperclipai onboard --yes
```

This walks you through setup, but you still need a PostgreSQL connection string in `DATABASE_URL` or your Paperclip config.

## Local Development

Prerequisites: Node.js 20+ and pnpm 9+.

```sh
pnpm install
docker compose up -d
# set DATABASE_URL in .env or export it
pnpm dev
```

This starts the API server and UI at [http://localhost:3100](http://localhost:3100).

## One-Command Bootstrap

```sh
pnpm paperclipai run
```

This auto-onboards if config is missing, runs health checks with auto-repair, and starts the server.

## What's Next

Once Paperclip is running:

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure its adapter
4. Build out the org chart with more agents
5. Set budgets and assign initial tasks
6. Hit go — agents start their heartbeats and the company runs

<Card title="Core Concepts" href="/start/core-concepts">
  Learn the key concepts behind Paperclip
</Card>
