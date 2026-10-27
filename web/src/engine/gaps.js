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

/** Return the character addressed by a failed talk command and its topic, or null. */
export function findTopic(world, parseError, parseTrace) {
  if (parseError?.kind !== 'unknown_noun') return null
  if (!parseTrace?.some(step => step.stage === 'verb' && step.kind === 'talk')) return null

  const nounWords = words(parseError.noun ?? '')
  if (!nounWords.length) return null
  const npcs = q.npcsInRoom(world, world.player_location)

  if (nounWords[0] === 'about' && npcs.length === 1 && nounWords.length > 1) {
    return { npc: npcs[0].id, name: npcs[0].name, topic: nounWords.slice(1).join(' ') }
  }

  const names = npcs.flatMap(npc => [npc.name, ...(npc.aliases ?? [])]
    .map(name => ({ npc, nameWords: words(name) })))
    .sort((a, b) => b.nameWords.length - a.nameWords.length)
  const addressed = names.find(candidate => candidate.nameWords.length < nounWords.length
    && candidate.nameWords.every((word, index) => nounWords[index] === word))
  if (!addressed) return null

  const topicWords = nounWords.slice(addressed.nameWords.length)
  if (['about', 'for', 'if', 'to'].includes(topicWords[0])) topicWords.shift()
  if (!topicWords.length) return null
  return { npc: addressed.npc.id, name: addressed.npc.name, topic: topicWords.join(' ') }
}
