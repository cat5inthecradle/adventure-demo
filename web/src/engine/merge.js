// Apply an edited world to a game in progress, without restarting it.
//
// Three versions take part: `base`, the world the game started from; `current`,
// that game as it stands now; and `next`, the edited world. The rule is the same
// one a version-control merge uses: what the author changed comes from `next`,
// what the game changed comes from `current`. So rewriting a room's description
// shows up at once, and the prybar the player already picked up stays in their
// pocket — unless the author deleted the prybar, in which case it is gone.
//
// Pure: takes normalized worlds, returns a new one plus notes for the player.

import { LOC_HIDDEN, LOC_INVENTORY } from './models.js'

const has = (table, id) => Object.hasOwn(table, id)

export function mergeWorld(base, current, next) {
  const world = structuredClone(next)
  const notes = []

  // Progress through the story is the game's.
  world.pronouns = current.pronouns
  world.turn_count = current.turn_count
  world.outcome = current.outcome
  world.flags = { ...current.flags }
  world.counters = { ...current.counters }
  world.visited = current.visited.filter(id => has(world.rooms, id))
  world.previous_location = has(world.rooms, current.previous_location ?? '') ? current.previous_location : null

  if (has(world.rooms, current.player_location)) {
    world.player_location = current.player_location
  } else {
    notes.push(`The room you were in is gone, so you’re back at the start: ${world.rooms[world.player_location]?.name ?? world.player_location}.`)
  }
  if (!world.visited.includes(world.player_location)) world.visited.push(world.player_location)

  // A location the game changed wins, as long as it still points somewhere real.
  const placeOk = loc => loc === LOC_INVENTORY || loc === LOC_HIDDEN || has(world.rooms, loc)
  for (const [id, item] of Object.entries(world.items)) {
    const was = base.items[id]
    const now = current.items[id]
    if (was && now && now.location !== was.location && placeOk(now.location)) item.location = now.location
  }
  for (const [id, npc] of Object.entries(world.npcs)) {
    const was = base.npcs[id]
    const now = current.npcs[id]
    if (was && now && now.location !== was.location && has(world.rooms, now.location)) npc.location = now.location
  }
  for (const [id, door] of Object.entries(world.doors)) {
    const was = base.doors[id]
    const now = current.doors[id]
    if (!was || !now) continue
    if (now.open !== was.open) door.open = now.open
    if (now.locked !== was.locked) door.locked = now.locked
  }

  // Rules that already fired stay fired, matched by id (dialogue by position).
  const firedIds = rules => new Set(rules.filter(r => r.fired).map(r => r.id))
  const firedInteractions = firedIds(current.interactions)
  const firedTriggers = firedIds(current.triggers)
  for (const rule of world.interactions) rule.fired = firedInteractions.has(rule.id)
  for (const rule of world.triggers) rule.fired = firedTriggers.has(rule.id)
  for (const [id, npc] of Object.entries(world.npcs)) {
    const old = current.npcs[id]?.dialogue ?? []
    npc.dialogue.forEach((rule, i) => { rule.fired = !!old[i]?.fired && old[i].text === rule.text })
  }
  for (const [id, door] of Object.entries(world.doors)) {
    const old = current.doors[id]?.listening ?? []
    door.listening.forEach((rule, i) => { rule.fired = !!old[i]?.fired && old[i].text === rule.text })
  }

  const carried = Object.values(current.items).filter(i => i.location === LOC_INVENTORY && !has(world.items, i.id))
  if (carried.length) notes.push(`You were carrying ${carried.map(i => `the ${i.name}`).join(' and ')}, which no longer exist.`)

  return { world, notes }
}
