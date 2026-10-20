// Pure read-only helpers over a world. Never mutates, never performs I/O.

import { DIRECTION_ORDER, LOC_INVENTORY } from './models.js'

export const currentRoom = world => world.rooms[world.player_location]

/** Items whose location is this room, in world file order. */
export const itemsInRoom = (world, roomId) =>
  Object.values(world.items).filter(item => item.location === roomId)

export const npcsInRoom = (world, roomId) =>
  Object.values(world.npcs).filter(npc => npc.location === roomId)

export const inventory = world =>
  Object.values(world.items).filter(item => item.location === LOC_INVENTORY)

/** Doors attached to any exit of the room, deduplicated, in exit order. */
export function doorsInRoom(world, roomId) {
  const doors = []
  const seen = new Set()
  for (const exit of Object.values(world.rooms[roomId].exits)) {
    if (exit.door_id == null || seen.has(exit.door_id)) continue
    seen.add(exit.door_id)
    doors.push(world.doors[exit.door_id])
  }
  return doors
}

/** Everything the player can currently refer to: room items, inventory, NPCs, doors. */
export function visibleEntities(world) {
  const roomId = world.player_location
  return [
    ...itemsInRoom(world, roomId),
    ...inventory(world),
    ...npcsInRoom(world, roomId),
    ...doorsInRoom(world, roomId),
  ]
}

/** What kind of thing an entity is. Ids are unique across tables. */
export function kindOf(world, id) {
  if (id in world.items) return 'item'
  if (id in world.npcs) return 'npc'
  if (id in world.doors) return 'door'
  if (id in world.rooms) return 'room'
  return null
}

/** Look an entity up by id across every table. Ignores visibility. */
export function findEntity(world, id) {
  for (const table of [world.items, world.npcs, world.doors, world.rooms]) {
    if (Object.hasOwn(table, id)) return table[id]
  }
  return null
}

/** The {id, name} pair events carry instead of whole entities. */
export const entityRef = entity => ({ id: entity.id, name: entity.name })

export function resolvedDescription(world, obj) {
  if (obj.alt_flag != null && obj.alt_description != null && world.flags[obj.alt_flag]) {
    return obj.alt_description
  }
  return obj.description
}

export function resolvedSounds(world, room) {
  if (room.alt_flag != null && room.alt_sounds != null && world.flags[room.alt_flag]) {
    return room.alt_sounds
  }
  return room.sounds
}

export const flagsMatch = (world, required) =>
  Object.entries(required).every(([name, wanted]) => (world.flags[name] ?? false) === wanted)

export function countersMatch(world, required) {
  for (const [name, cond] of Object.entries(required)) {
    const value = world.counters[name] ?? 0
    if (cond.at_least != null && value < cond.at_least) return false
    if (cond.at_most != null && value > cond.at_most) return false
  }
  return true
}

export const doorsMatch = (world, required) =>
  Object.entries(required).every(([id, wanted]) => world.doors[id].open === wanted)

/** The whole of a rule's guard: room, then flags, counters and door state. */
export function conditionsMatch(world, rule) {
  const rooms = rule.rooms ?? []
  if (rooms.length && !rooms.includes(world.player_location)) return false
  return flagsMatch(world, rule.requires_flags)
    && countersMatch(world, rule.requires_counters)
    && doorsMatch(world, rule.requires_doors)
}

/** Ground the player knows. Where they are standing always counts. */
export const visitedRooms = world => new Set([...world.visited, world.player_location])

/**
 * The direction of the first step along the shortest known route, or null.
 * Routes pass only through rooms already visited; the destination itself may be
 * somewhere the player has merely heard of.
 */
export function firstStepToward(world, destination) {
  if (destination === world.player_location || !(destination in world.rooms)) return null
  const known = visitedRooms(world)
  const seen = new Set([world.player_location])
  const queue = []
  for (const dir of DIRECTION_ORDER) {
    const exit = world.rooms[world.player_location].exits[dir]
    if (exit) queue.push([exit.to, dir])
  }
  while (queue.length) {
    const [roomId, firstStep] = queue.shift()
    if (seen.has(roomId)) continue
    seen.add(roomId)
    if (roomId === destination) return firstStep
    if (!known.has(roomId)) continue
    for (const dir of DIRECTION_ORDER) {
      const exit = world.rooms[roomId].exits[dir]
      if (exit && !seen.has(exit.to)) queue.push([exit.to, firstStep])
    }
  }
  return null
}

/**
 * Find a thing the player has seen but is not standing next to. Searches only
 * walked rooms and never reveals a hidden item. Returns [entity, roomId] or null.
 */
export function locateInKnownRooms(world, matches) {
  const known = visitedRooms(world)
  known.delete(world.player_location)
  const found = []
  for (const item of Object.values(world.items)) {
    if (known.has(item.location) && matches(item)) found.push([item, item.location])
  }
  for (const npc of Object.values(world.npcs)) {
    if (known.has(npc.location) && matches(npc)) found.push([npc, npc.location])
  }
  return found.length === 1 ? found[0] : null
}
