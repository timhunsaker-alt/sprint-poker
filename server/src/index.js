import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'crypto';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const PORT = process.env.PORT || 3001;

// rooms: Map<roomCode, Room>
const rooms = new Map();

function generateRoomCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

function createRoom(code) {
  return {
    code,
    voters: new Map(), // clientId -> { name, pick, ws, disconnectedAt }
    revealed: false,
    createdAt: Date.now(),
  };
}

function getRoomState(room) {
  const voters = [];
  for (const [id, v] of room.voters) {
    // Only include voters with an active connection or recently disconnected
    voters.push({
      id,
      name: v.name,
      pick: room.revealed ? v.pick : (v.pick !== null ? '__hidden__' : null),
      hasVoted: v.pick !== null,
      online: v.ws !== null && v.ws.readyState === WebSocket.OPEN,
    });
  }
  return {
    code: room.code,
    voters,
    revealed: room.revealed,
  };
}

function broadcast(room, message, excludeId = null) {
  const payload = JSON.stringify(message);
  for (const [id, v] of room.voters) {
    if (id !== excludeId && v.ws && v.ws.readyState === WebSocket.OPEN) {
      v.ws.send(payload);
    }
  }
}

function broadcastAll(room, message) {
  broadcast(room, message, null);
}

function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function cleanupRooms() {
  const ONE_HOUR = 60 * 60 * 1000;
  const STALE_VOTER = 5 * 60 * 1000; // remove disconnected voters after 5 min
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Remove voters who disconnected and never came back
    for (const [id, v] of room.voters) {
      if (v.ws === null && v.disconnectedAt && (now - v.disconnectedAt > STALE_VOTER)) {
        room.voters.delete(id);
      }
    }
    // Remove empty old rooms
    if (now - room.createdAt > ONE_HOUR && room.voters.size === 0) {
      rooms.delete(code);
    }
  }
}

setInterval(cleanupRooms, 60 * 1000);

// Heartbeat: keeps idle connections alive through proxies/NATs that kill
// silent WebSockets, and promptly terminates sockets that stopped responding
// so the client's reconnect logic kicks in instead of waiting on a TCP timeout.
const HEARTBEAT_INTERVAL = 30 * 1000;

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL);

// Health check
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

wss.on('connection', (ws) => {
  let currentRoomCode = null;
  let clientId = randomBytes(8).toString('hex');

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { type, payload } = msg;

    switch (type) {

      // ── Reconnect after browser refresh ─────────────────────────────────
      case 'RECONNECT': {
        const { clientId: savedId, roomCode, name } = payload;
        const room = rooms.get(roomCode?.toUpperCase());

        if (!room) {
          // Room is gone (server restarted, room expired) — tell client to go to lobby
          sendTo(ws, { type: 'RECONNECT_FAILED', payload: { message: 'Session expired. Please rejoin.' } });
          return;
        }

        const existing = room.voters.get(savedId);

        if (existing) {
          // Restore the existing voter with new ws reference
          clientId = savedId;
          currentRoomCode = roomCode.toUpperCase();
          existing.ws = ws;
          existing.disconnectedAt = null;

          sendTo(ws, {
            type: 'ROOM_JOINED',
            payload: { clientId, roomState: getRoomState(room) },
          });

          // Let others know this person is back online
          broadcast(room, {
            type: 'STATE_UPDATE',
            payload: { roomState: getRoomState(room) },
          }, clientId);
        } else {
          // clientId not in room — could be server restart, rejoin as new voter
          // Check name collision first
          for (const [, v] of room.voters) {
            if (v.name.toLowerCase() === name?.toLowerCase()) {
              // Same name is fine on reconnect — it's the same person
              break;
            }
          }
          clientId = savedId;
          currentRoomCode = roomCode.toUpperCase();
          room.voters.set(clientId, { name: name || 'Unknown', pick: null, ws, disconnectedAt: null });

          sendTo(ws, {
            type: 'ROOM_JOINED',
            payload: { clientId, roomState: getRoomState(room) },
          });

          broadcast(room, {
            type: 'STATE_UPDATE',
            payload: { roomState: getRoomState(room) },
          }, clientId);
        }
        break;
      }

      // ── Create a new room ────────────────────────────────────────────────
      case 'CREATE_ROOM': {
        let code;
        do { code = generateRoomCode(); } while (rooms.has(code));
        const room = createRoom(code);
        rooms.set(code, room);
        currentRoomCode = code;

        const { name } = payload;
        room.voters.set(clientId, { name, pick: null, ws, disconnectedAt: null });

        sendTo(ws, {
          type: 'ROOM_JOINED',
          payload: { clientId, roomState: getRoomState(room) },
        });
        break;
      }

      // ── Join an existing room ────────────────────────────────────────────
      case 'JOIN_ROOM': {
        const { code, name } = payload;
        const room = rooms.get(code.toUpperCase());

        if (!room) {
          sendTo(ws, { type: 'ERROR', payload: { message: 'Room not found. Check the code and try again.' } });
          return;
        }

        // Name uniqueness check (skip disconnected ghost entries with the same name — they'll be cleaned up)
        for (const [, v] of room.voters) {
          if (v.name.toLowerCase() === name.toLowerCase() && v.ws !== null) {
            sendTo(ws, { type: 'ERROR', payload: { message: `"${name}" is already in this session. Choose a different name.` } });
            return;
          }
        }

        currentRoomCode = code.toUpperCase();
        room.voters.set(clientId, { name, pick: null, ws, disconnectedAt: null });

        sendTo(ws, {
          type: 'ROOM_JOINED',
          payload: { clientId, roomState: getRoomState(room) },
        });

        broadcast(room, {
          type: 'VOTER_JOINED',
          payload: { id: clientId, name, roomState: getRoomState(room) },
        }, clientId);
        break;
      }

      case 'CAST_VOTE': {
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        if (room.revealed) return;

        const voter = room.voters.get(clientId);
        if (!voter) return;

        voter.pick = payload.pick;

        broadcastAll(room, {
          type: 'STATE_UPDATE',
          payload: { roomState: getRoomState(room) },
        });
        break;
      }

      case 'REVEAL': {
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        room.revealed = true;

        broadcastAll(room, {
          type: 'STATE_UPDATE',
          payload: { roomState: getRoomState(room) },
        });
        break;
      }

      case 'NEW_ROUND': {
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        room.revealed = false;

        for (const [, v] of room.voters) {
          v.pick = null;
        }

        broadcastAll(room, {
          type: 'STATE_UPDATE',
          payload: { roomState: getRoomState(room) },
        });
        break;
      }

      case 'LEAVE_ROOM': {
        const room = rooms.get(currentRoomCode);
        if (!room) return;
        room.voters.delete(clientId);

        broadcast(room, {
          type: 'STATE_UPDATE',
          payload: { roomState: getRoomState(room) },
        });

        if (room.voters.size === 0) rooms.delete(currentRoomCode);
        currentRoomCode = null;
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const voter = room.voters.get(clientId);
    if (voter) {
      // Mark as disconnected but keep in room for reconnect window
      voter.ws = null;
      voter.disconnectedAt = Date.now();
    }

    // Notify others this person went offline (state update will show online: false)
    broadcast(room, {
      type: 'STATE_UPDATE',
      payload: { roomState: getRoomState(room) },
    });
  });

  ws.on('error', (err) => {
    console.error(`[ws] client ${clientId} error:`, err.message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[sprint-poker] server listening on :${PORT}`);
});
