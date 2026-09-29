import { useReducer, useCallback } from 'react';
import { reducer, initialState } from './lib/roomReducer';
import { usePokerSocket, saveSession, clearSession, loadSession } from './hooks/usePokerSocket';
import { getRoomFromUrl, setRoomInUrl, clearRoomInUrl } from './lib/roomUrl';
import { Lobby } from './components/Lobby';
import { PokerRoom } from './components/PokerRoom';

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleMessage = useCallback((msg) => {
    // On ROOM_JOINED, persist session for refresh recovery
    if (msg.type === 'ROOM_JOINED') {
      const session = loadSession();
      saveSession(
        msg.payload.clientId,
        msg.payload.roomState.code,
        // name comes from existing session on reconnect, or we get it from voters list
        session?.name || msg.payload.roomState.voters.find(v => v.id === msg.payload.clientId)?.name || ''
      );
      setRoomInUrl(msg.payload.roomState.code);
    }
    dispatch(msg);
  }, []);

  const handleReconnectFailed = useCallback((message) => {
    clearRoomInUrl();
    dispatch({ type: 'RECONNECT_ERROR', message });
  }, []);

  const { send, connected } = usePokerSocket({
    onMessage: handleMessage,
    onReconnectFailed: handleReconnectFailed,
  });

  function createRoom(name) {
    dispatch({ type: 'CLEAR_ERROR' });
    send('CREATE_ROOM', { name });
  }

  function joinRoom(name, code) {
    dispatch({ type: 'CLEAR_ERROR' });
    send('JOIN_ROOM', { name, code });
  }

  function castVote(pick) {
    send('CAST_VOTE', { pick });
  }

  function reveal() {
    send('REVEAL');
  }

  function newRound() {
    send('NEW_ROUND');
  }

  function leave() {
    send('LEAVE_ROOM');
    clearSession();
    clearRoomInUrl();
    dispatch({ type: 'LEAVE' });
  }

  if (state.phase === 'session' && state.roomState) {
    return (
      <PokerRoom
        roomState={state.roomState}
        clientId={state.clientId}
        connected={connected}
        onVote={castVote}
        onReveal={reveal}
        onNewRound={newRound}
        onLeave={leave}
      />
    );
  }

  return (
    <Lobby
      onCreateRoom={createRoom}
      onJoinRoom={joinRoom}
      error={state.error}
      reconnectError={state.reconnectError}
      connected={connected}
      initialCode={getRoomFromUrl()}
    />
  );
}
