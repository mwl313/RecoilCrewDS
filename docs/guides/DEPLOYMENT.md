# Deployment

The production build is a single Node process: it serves the static client
from `dist/` and speaks WebSocket on the same port (`/ws`). No separate
static host is required, and there is no hardcoded `localhost` in the client —
it connects to `ws(s)://<current host>/ws`.

## Build once

```bash
npm install
npm run build
```

## Option 1 — Render / Railway / Fly.io / any Node host (recommended)

Deploy the repository with the start command:

```bash
npm run server
```

Set `PORT` (Render/Railway inject it automatically; Fly uses `PORT` too).
The included `Dockerfile` does this automatically for Docker-based platforms:

```bash
docker build -t recoil-crew .
docker run -p 8080:8080 -e PORT=8080 recoil-crew
```

On Render: **New Web Service → this repo**, build command
`npm install && npm run build`, start command `npm run server`. Render
provides HTTPS automatically, so the browser connects to `wss://`.

## Option 2 — Static host + separate server

If you prefer itch.io / GitHub Pages / Netlify for the client:

1. Build and deploy `dist/` to the static host.
2. Deploy the server separately (any Node host).
3. Point the client at your server. In the browser the client uses the
   **same origin** by default, so for a separate server set one of:
   - Serve the client and server from the same origin via a reverse proxy
     (recommended; `/ws` must proxy to the server), or
   - Patch the WebSocket URL in `src/client/net.ts` and rebuild.

The `.env.example` file documents the supported environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP + WebSocket port |
| `ALLOWED_ORIGINS` | `*` | Comma-separated allowed WebSocket origins |
| `STATIC_DIR` | `dist` | Static client directory |
| `RECOIL_TIME_SCALE` | `1` | Test utility: simulation speed multiplier |

## HTTPS and WebSockets

Render, Railway, Fly.io, and Cloudflare all terminate TLS for you; the server
sees a normal HTTP request and upgrades `/ws` to `wss` transparently. If you
host behind your own TLS, terminate TLS at the proxy and forward both HTTP and
WebSocket upgrade to the Node port.

## Costs and limits

One tiny Node instance comfortably runs hundreds of concurrent rooms (each room
is two players; snapshots are ~3–8 KB at 20 Hz). Memory use is flat across
rematches because entities are pooled/reused by the simulation.
