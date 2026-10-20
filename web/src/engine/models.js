// World shape, constants, and default-filling.
//
// A world is plain JSON — the same file the Python build reads. `normalizeWorld`
// fills in every field the file is allowed to omit, so the engine can rely on
// them being present instead of sprinkling `?? []` everywhere.

import { DEFAULT as PRONOUNS_DEFAULT } from './pronouns.js'

// The fixed order exits are listed and searched in, so descriptions and
// pathfinding are deterministic.
export const DIRECTION_ORDER = ['north', 'south', 'east', 'west', 'up', 'down']

// Special Item.location values besides room ids.
export const LOC_INVENTORY = 'inventory'
export const LOC_HIDDEN = 'hidden'

function rule(r) {
  return {
    rooms: [],
    requires_flags: {},
    requires_counters: {},
    requires_doors: {},
    effects: [],
    once: false,
    fired: false,
    ...r,
  }
}

/** Deep-copy a world file and fill in every default. Never mutates its input. */
export function normalizeWorld(raw) {
  const data = structuredClone(raw)
  // The oldest saves carried a `won` boolean instead of an outcome.
  const legacyWon = data.won === true
  delete data.won

  const world = {
    schema_version: 1,
    pronouns: PRONOUNS_DEFAULT,
    visited: [],
    previous_location: null,
    doors: {},
    items: {},
    npcs: {},
    interactions: [],
    triggers: [],
    flags: {},
    counters: {},
    outcome: legacyWon ? 'win' : null,
    turn_count: 0,
    ...data,
  }

  for (const room of Object.values(world.rooms)) {
    room.exits ??= {}
    for (const exit of Object.values(room.exits)) {
      exit.door_id ??= null
      exit.pass_message ??= null
    }
    room.alt_description ??= null
    room.alt_flag ??= null
    room.sounds ??= null
    room.alt_sounds ??= null
  }
  for (const door of Object.values(world.doors)) {
    door.aliases ??= []
    door.open ??= false
    door.locked ??= false
    door.unlock_flag ??= null
    door.locked_message ??= null
    door.open_message ??= null
    door.listening = (door.listening ?? []).map(rule)
  }
  for (const item of Object.values(world.items)) {
    item.aliases ??= []
    item.portable ??= true
    item.alt_description ??= null
    item.alt_flag ??= null
    item.open_refusal ??= null
    item.open_refusal_with ??= {}
  }
  for (const npc of Object.values(world.npcs)) {
    npc.aliases ??= []
    npc.follows_player ??= false
    npc.dialogue = (npc.dialogue ?? []).map(rule)
  }
  world.interactions = world.interactions.map(i => ({ target_id: null, ...rule(i) }))
  world.triggers = world.triggers.map(t => ({ when: 'enter', text: '', ...rule(t) }))
  return world
}

export const isEnded = world => world.outcome != null
export const isWon = world => world.outcome === 'win'
