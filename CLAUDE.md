# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Sprint Poker — real-time scrum planning poker (room codes, hidden votes, instant reveal). Node.js WebSocket server (Express + `ws`) and a Vite + React SPA client, deployed via Docker Swarm + Traefik.

## Commands

```bash
# Server (Terminal 1)
cd server && npm install && npm run dev   # node --watch src/index.js on :3001

# Client (Terminal 2)
cd client && npm install && npm run dev   # Vite dev server on :5173, proxies /ws and /health to :3001

cd client && npm run build                # production build (Vite)
cd client && npm run preview              # preview a production build
```

There is no lint or test setup in this repo.

Open http://localhost:5173; open a second tab to exercise the multi-user flow.

## Architecture

**Everything is in-memory, single-process, single-replica.** `server/src/index.js` holds all server logic in one file: a `rooms` Map (`roomCode -> Room`), where each `Room` has a `voters` Map (`clientId -> { name, pick, ws, disconnectedAt }`). There is no database. The README explicitly notes that HA would require swapping the Map for Redis + `ioredis` pub/sub — do not assume any persistence layer exists.

**WebSocket protocol** (JSON `{ type, payload }` messages) is the entire client-server contract — no REST API beyond `GET /health`. Message types are documented in README.md; when adding a new message type, update both the server `switch` in `index.js` and the client reducer/dispatch.

- `roomState` shape: `{ code, voters: [{ id, name, pick, hasVoted, online }], revealed }`
- Before reveal, `pick` is sent to clients as `null` (no vote) or the string `"__hidden__"` (voted but hidden) — the real pick value only leaves the server after `REVEAL`. Never leak real picks pre-reveal when touching `getRoomState()`.

**Session persistence / reconnect flow**: the client stores `{ clientId, roomCode, name }` in `sessionStorage` (`usePokerSocket.js`). On every new WS connection it sends a `RECONNECT` message with the saved `clientId` before anything else. Server-side, `RECONNECT` either re-attaches the existing voter's `ws` (if the room and clientId still exist) or re-joins them as a new voter under the same `clientId` (e.g. after a server restart) — see the `RECONNECT` case in `index.js`. If the room is gone, the server sends `RECONNECT_FAILED` and the client clears its session and drops back to the lobby. Keep this flow in mind when changing room/voter lifecycle — a disconnected voter is *not* removed immediately, only marked with `disconnectedAt` and pruned later by `cleanupRooms()`.

**Client state machine**: `client/src/lib/roomReducer.js` is a small reducer driven directly by incoming WS message types (`ROOM_JOINED`, `STATE_UPDATE`, `VOTER_JOINED`, `ERROR`, `RECONNECT_ERROR`, `LEAVE`, `CLEAR_ERROR`). `App.jsx` wires `usePokerSocket` → reducer → `Lobby` (phase `lobby`) or `PokerRoom` (phase `session`). There's no router — the UI is these two screens.

**Client → server config**: `VITE_WS_URL` is baked into the client bundle at *build time* by Vite (no runtime env lookup). In dev, the Vite proxy (`vite.config.js`) forwards `/ws` and `/health` to `localhost:3001` so `VITE_WS_URL` doesn't need to be set locally.

**Room lifecycle**: room codes are 6-char hex from `randomBytes(3)`. `cleanupRooms()` runs every 60s: disconnected voters are pruned after 5 minutes with no reconnect, and rooms are deleted once empty *and* older than 1 hour. A room is also deleted immediately on `LEAVE_ROOM` if it becomes empty.

## Deployment

Production is Docker Swarm + Traefik, driven by `deploy.sh`:
- Builds and pushes `server` and `client` images to `$REGISTRY` (default `registry.vegadigital.dev`), tagging with `$TAG` (default `latest`).
- The client image build passes `--build-arg VITE_WS_URL=wss://$DOMAIN/ws` (default domain `poker.vegadigital.dev`) — this is how the client learns the WS endpoint for prod, since it's compiled in, not runtime config.
- Deploys `deploy/stack.yml` via `docker stack deploy`.
- Override with env vars, e.g. `DOMAIN=poker.myotherdomain.com ./deploy.sh`.

When editing `deploy/stack.yml`, the Traefik host rule and the `traefik-public` external network name must match the target Swarm's existing Traefik setup, and `tls.certresolver` must match the configured certresolver name.
