// Reflects the current room code in the URL (?room=CODE) so sessions are
// shareable/bookmarkable and survive cases sessionStorage can't cover
// (private windows, a link opened in a fresh tab).

const PARAM = 'room';

export function getRoomFromUrl() {
  const code = new URLSearchParams(window.location.search).get(PARAM);
  return code ? code.toUpperCase() : null;
}

export function setRoomInUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, code);
  window.history.replaceState(null, '', url);
}

export function clearRoomInUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState(null, '', url);
}
