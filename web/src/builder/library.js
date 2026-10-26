// A student's worlds, kept in the browser: each one a Blockly workspace state under
// a name. The name is the world's own title — the Story block's — so there is one
// name for a world wherever it shows: here, in Play's top bar, on a downloaded file.
//
// Plain data with a pluggable store, so the tests can run it without a browser.

import { storage } from '../storage.js'

const KEY = 'adventure-lab:library'
const OLD_KEY = 'adventure-lab:builder'    // the single workspace before there was a library

/** A world's name, read from its Story block. */
export function titleOf(state) {
  const story = (state?.blocks?.blocks ?? []).find(b => b.type === 'world')
  return story?.fields?.TITLE?.trim() || 'Untitled world'
}

/** A copy of a workspace state with its Story block retitled. */
export function retitled(state, title) {
  const copy = structuredClone(state)
  const story = (copy.blocks?.blocks ?? []).find(b => b.type === 'world')
  if (story) story.fields = { ...story.fields, TITLE: title }
  return copy
}

/** "My adventure" -> "My adventure 2" when the name is taken. */
export function freshTitle(library, wanted) {
  const taken = new Set(list(library).map(w => w.name))
  if (!taken.has(wanted)) return wanted
  let n = 2
  while (taken.has(`${wanted} ${n}`)) n++
  return `${wanted} ${n}`
}

// Strictly increasing, so "most recently changed" is never a tie, even for two
// changes in the same millisecond.
let lastStamp = 0
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1))

export function emptyLibrary() {
  return { worlds: {}, current: null }
}

/** Read the library, bringing a pre-library workspace across as its first world. */
export function loadLibrary(store = storage()) {
  let library = null
  try { library = JSON.parse(store?.getItem(KEY) ?? 'null') } catch { library = null }
  if (library?.worlds) return library

  library = emptyLibrary()
  try {
    const old = JSON.parse(store?.getItem(OLD_KEY) ?? 'null')
    if (old?.blocks) {
      const id = add(library, old)
      library.current = id
      store?.removeItem(OLD_KEY)
    }
  } catch { /* nothing to bring across */ }
  return library
}

export function saveLibrary(library, store = storage()) {
  try { store?.setItem(KEY, JSON.stringify(library)) } catch { /* full or blocked: keep going */ }
}

/** Add a workspace state as a new world. Returns its id. */
export function add(library, state) {
  const id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  library.worlds[id] = { id, name: titleOf(state), state, updated: stamp() }
  return id
}

/** Record the current world's latest state. */
export function update(library, id, state) {
  const entry = library.worlds[id]
  if (!entry) return
  entry.state = state
  entry.name = titleOf(state)
  entry.updated = stamp()
}

export function remove(library, id) {
  delete library.worlds[id]
  if (library.current === id) library.current = list(library)[0]?.id ?? null
}

/** The worlds, most recently changed first. */
export function list(library) {
  return Object.values(library.worlds).sort((a, b) => b.updated - a.updated)
}
