// A prose gap is something the room's author mentioned, but never made into an
// entity. Finding one is deterministic: the model only gets to write words after
// the parser and the authored room description agree about what the player named.

import * as q from './queries.js'

const words = value => value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const singular = word => word.endsWith('s') ? word.slice(0, -1) : word

/** Return the examined noun that appears in the room prose, or null. */
export function findGap(world, parseError, parseTrace) {
  if (parseError?.kind !== 'unknown_noun') return null
  if (!parseTrace?.some(step => step.stage === 'verb' && step.kind === 'examine')) return null

  const nounWords = words(parseError.noun ?? '').filter(word => word.length >= 3)
  if (!nounWords.length) return null

  const room = q.currentRoom(world)
  const descriptionWords = new Set(words(q.resolvedDescription(world, room)).map(singular))
  return nounWords.every(word => descriptionWords.has(singular(word)))
    ? { noun: parseError.noun }
    : null
}
