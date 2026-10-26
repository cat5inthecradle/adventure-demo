// The browser's localStorage, or null where it is blocked (private windows,
// disabled site data). Callers treat null as "this just won't be remembered".
export function storage() {
  try { return window.localStorage } catch { return null }
}
