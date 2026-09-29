# Sprint Poker

Real-time scrum planning poker — room codes, hidden votes, instant reveal.

**Stack:** Node.js WebSocket server (ws + Express) · Vite + React client · Docker Swarm + Traefik

---

## Project structure

```
sprint-poker/
├── server/              # WebSocket + HTTP server
│   ├── src/index.js
│   ├── package.json
│   └── Dockerfile
├── client/              # Vite + React SPA
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Lobby.jsx / .module.css
│   │   │   └── PokerRoom.jsx / .module.css
│   │   ├── hooks/usePokerSocket.js
│   │   └── lib/roomReducer.js
│   ├── Dockerfile
│   ├── nginx.conf
│   └── vite.config.js
└── deploy/
    └── stack.yml        # Docker Swarm stack
```

---

## Local development

```bash
# Terminal 1 — server
cd server && npm install && npm run dev

# Terminal 2 — client (proxies /ws → localhost:3001 automatically)
cd client && npm install && npm run dev
```

Open http://localhost:5173. Open a second tab to test multi-user flow.

---

## Production deployment (Docker Swarm + Traefik)

### 1. Edit `deploy/stack.yml`

Replace the Traefik host rules if you want a different subdomain than `poker.vegadigital.dev`. The registry and certresolver are pre-configured for your Vega Digital stack. Verify:
- `tls.certresolver=letsencrypt` — matches your Traefik certresolver name
- `traefik-public` external network name matches your existing Traefik network

### 2. Run the deploy script

```bash
chmod +x deploy.sh
./deploy.sh
# Defaults: REGISTRY=registry.vegadigital.dev  DOMAIN=poker.vegadigital.dev
# Override: DOMAIN=poker.myotherdomain.com ./deploy.sh
```

### 4. DNS

Point `poker.vegadigital.dev` → your Swarm manager's public IP.

---

## WebSocket message protocol

All messages are JSON: `{ type: string, payload: object }`

| Direction | Type | Payload |
|-----------|------|---------|
| C→S | `CREATE_ROOM` | `{ name }` |
| C→S | `JOIN_ROOM` | `{ name, code }` |
| C→S | `CAST_VOTE` | `{ pick: number \| null }` |
| C→S | `REVEAL` | `{}` |
| C→S | `NEW_ROUND` | `{}` |
| C→S | `LEAVE_ROOM` | `{}` |
| S→C | `ROOM_JOINED` | `{ clientId, roomState }` |
| S→C | `VOTER_JOINED` | `{ id, name, roomState }` |
| S→C | `STATE_UPDATE` | `{ roomState }` |
| S→C | `ERROR` | `{ message }` |

`roomState`: `{ code, voters: [{ id, name, pick, hasVoted }], revealed }`

Before reveal: `pick` is `null` (no vote) or `"__hidden__"` (voted but hidden).
After reveal: `pick` is the actual number.

---

## Notes

- **Single replica only** — room state is in-memory on the server. If you need HA, swap the Map store for Redis and use `ioredis` pub/sub to broadcast across replicas.
- Rooms auto-delete 30 seconds after the last participant disconnects, and empty rooms older than 1 hour are swept every 5 minutes.
- The `VITE_WS_URL` build arg is baked into the client at build time by Vite — no runtime config needed.
