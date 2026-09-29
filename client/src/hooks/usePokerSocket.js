import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://poker.vegadigital.dev/ws';
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 10000;
const SESSION_KEY = 'sprint-poker-session';

// Persist session across browser refreshes
export function saveSession(clientId, roomCode, name) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ clientId, roomCode, name }));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function usePokerSocket({ onMessage, onReconnectFailed }) {
  const ws = useRef(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  const onReconnectFailedRef = useRef(onReconnectFailed);
  const [connected, setConnected] = useState(false);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onReconnectFailedRef.current = onReconnectFailed; }, [onReconnectFailed]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setConnected(true);
      reconnectCount.current = 0;

      // Auto-rejoin if we have a saved session (browser refresh case)
      const session = loadSession();
      if (session?.clientId && session?.roomCode && session?.name) {
        socket.send(JSON.stringify({
          type: 'RECONNECT',
          payload: {
            clientId: session.clientId,
            roomCode: session.roomCode,
            name: session.name,
          },
        }));
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'RECONNECT_FAILED') {
          clearSession();
          onReconnectFailedRef.current?.(msg.payload?.message);
          return;
        }
        onMessageRef.current(msg);
      } catch (e) {
        console.error('[ws] parse error', e);
      }
    };

    socket.onclose = () => {
      setConnected(false);
      // Keep retrying indefinitely (capped backoff) — a long outage (laptop
      // sleep, spotty network) shouldn't permanently strand the user.
      reconnectCount.current++;
      const delay = Math.min(RECONNECT_DELAY * reconnectCount.current, MAX_RECONNECT_DELAY);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // onclose fires after onerror, so reconnect logic lives there
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((type, payload = {}) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { send, connected };
}
