export const initialState = {
  phase: 'lobby',       // lobby | session | reconnecting
  clientId: null,
  roomCode: null,
  roomState: null,
  error: null,
  reconnectError: null,
};

export function reducer(state, action) {
  switch (action.type) {
    case 'ROOM_JOINED':
      return {
        ...state,
        phase: 'session',
        clientId: action.payload.clientId,
        roomCode: action.payload.roomState.code,
        roomState: action.payload.roomState,
        error: null,
        reconnectError: null,
      };

    case 'STATE_UPDATE':
    case 'VOTER_JOINED':
      return {
        ...state,
        roomState: action.payload.roomState,
      };

    case 'ERROR':
      return { ...state, error: action.payload.message };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'RECONNECT_ERROR':
      return { ...initialState, reconnectError: action.message };

    case 'LEAVE':
      return { ...initialState };

    default:
      return state;
  }
}
