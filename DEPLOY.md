# Deploying

The whole stack (Postgres, Redis, RabbitMQ, API, worker, web) runs with Docker Compose,
so the simplest hosting is one small Linux VPS (2 GB RAM is enough, a few euros a month).

## 1. Server

1. Create a VPS (Ubuntu LTS) and point a domain or subdomain at its IP (DNS `A` record).
2. Install Docker: https://docs.docker.com/engine/install/ubuntu/
3. Clone the repository on the server.

## 2. Secrets

Create a `.env` file next to `docker-compose.yml` (never commit it):

```
JWT_SECRET=<a long random string, e.g. `openssl rand -hex 48`>
ANTHROPIC_API_KEY=<optional, enables AI features>
```

Change the default Postgres and RabbitMQ passwords in `docker-compose.yml` for a public server,
and remove the `ports:` of postgres, redis, rabbitmq and mailpit so they are not exposed.
For real e-mails, replace Mailpit with an SMTP provider (`SMTP_HOST`, `SMTP_PORT`).

## 3. HTTPS

Session cookies are `Secure` in production, so the app must be served over HTTPS.
The easiest way is Caddy in front of the `web` container, which gets certificates automatically:

```
# Caddyfile
helpdesk.example.com {
  reverse_proxy localhost:8080
}
```

Set `WEB_ORIGIN=https://helpdesk.example.com` for the `api` and `worker` services (used in e-mail links).

## 4. Start

```bash
docker compose --profile app up -d --build
docker compose exec api node dist/seed.js   # optional demo data
```

Migrations run automatically when the API container starts.
Check `https://helpdesk.example.com/api/health`.
