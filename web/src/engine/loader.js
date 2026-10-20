// Loads and validates world JSON. Never mutates a running world.

import { LOC_HIDDEN, LOC_INVENTORY, normalizeWorld } from './models.js'
import { SETS as PRONOUN_SETS } from './pronouns.js'

export class WorldValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WorldValidationError'
  }
}

/** Normalize and validate raw world JSON. Throws WorldValidationError naming the offender. */
export function loadWorld(raw) {
  const world = normalizeWorld(raw)
  validateWorld(world)
  return world
}

const fail = message => { throw new WorldValidationError(message) }
const has = (table, id) => id != null && Object.hasOwn(table, id)

export function validateWorld(world) {
  for (const key of ['title', 'intro', 'win_epilogue', 'player_location', 'rooms']) {
    if (world[key] == null) fail(`world is missing '${key}'`)
  }
  const tables = [['room', world.rooms], ['door', world.doors], ['item', world.items], ['npc', world.npcs]]

  for (const [kind, table] of tables) {
    for (const [key, value] of Object.entries(table)) {
      if (key !== value.id) fail(`${kind} key '${key}' does not match its id '${value.id}'`)
    }
  }
  const seen = {}
  for (const [kind, table] of tables) {
    for (const id of Object.keys(table)) {
      if (seen[id]) fail(`duplicate id '${id}': used by both ${seen[id]} and ${kind}`)
      seen[id] = kind
    }
  }

  if (!has(world.rooms, world.player_location)) {
    fail(`player_location '${world.player_location}' is not a room id`)
  }

  const referenced = new Set()
  for (const [roomId, room] of Object.entries(world.rooms)) {
    for (const [dir, exit] of Object.entries(room.exits)) {
      if (!has(world.rooms, exit.to)) fail(`room '${roomId}' exit ${dir} leads to '${exit.to}', which is not a room id`)
      if (exit.door_id != null) {
        if (!has(world.doors, exit.door_id)) fail(`room '${roomId}' exit ${dir} names door '${exit.door_id}', which is not a door id`)
        referenced.add(exit.door_id)
      }
    }
  }
  for (const doorId of Object.keys(world.doors)) {
    if (!referenced.has(doorId)) fail(`door '${doorId}' is not referenced by any exit`)
  }

  for (const [itemId, item] of Object.entries(world.items)) {
    if (item.location !== LOC_INVENTORY && item.location !== LOC_HIDDEN && !has(world.rooms, item.location)) {
      fail(`item '${itemId}' has location '${item.location}', which is not a room id, 'inventory', or 'hidden'`)
    }
    for (const toolId of Object.keys(item.open_refusal_with)) {
      if (!has(world.items, toolId)) fail(`item '${itemId}' has an open_refusal_with entry for '${toolId}', which is not an item id`)
    }
  }
  for (const [npcId, npc] of Object.entries(world.npcs)) {
    if (!has(world.rooms, npc.location)) fail(`npc '${npcId}' has location '${npc.location}', which is not a room id`)
  }

  const isEntity = id => has(world.items, id) || has(world.npcs, id) || has(world.doors, id)
  const ids = new Set()
  for (const i of world.interactions) {
    if (ids.has(i.id)) fail(`duplicate interaction id '${i.id}'`)
    ids.add(i.id)
    if (!isEntity(i.item_id)) fail(`interaction '${i.id}' names '${i.item_id}', which is not an item, npc, or door id`)
    if (i.target_id != null && !isEntity(i.target_id)) fail(`interaction '${i.id}' names target '${i.target_id}', which is not an item, npc, or door id`)
    checkRule(world, i, `interaction '${i.id}'`)
  }
  for (const [npcId, npc] of Object.entries(world.npcs)) {
    npc.dialogue.forEach((r, n) => checkRule(world, r, `npc '${npcId}' dialogue rule ${n}`))
  }
  for (const [doorId, door] of Object.entries(world.doors)) {
    door.listening.forEach((r, n) => checkRule(world, r, `door '${doorId}' listening rule ${n}`))
  }
  const triggerIds = new Set()
  for (const t of world.triggers) {
    if (triggerIds.has(t.id)) fail(`duplicate trigger id '${t.id}'`)
    triggerIds.add(t.id)
    if (!t.text && !t.effects.length) fail(`trigger '${t.id}' has neither text nor effects, so it can never do anything`)
    checkRule(world, t, `trigger '${t.id}'`)
  }

  if (!has(PRONOUN_SETS, world.pronouns)) {
    fail(`'pronouns' is '${world.pronouns}', which is not one of: ${Object.keys(PRONOUN_SETS).join(', ')}`)
  }
  if (world.schema_version !== 1) fail(`unsupported schema_version ${world.schema_version}; this build reads version 1`)
}

function checkRule(world, rule, where) {
  for (const roomId of rule.rooms) {
    if (!has(world.rooms, roomId)) fail(`${where}: rooms names '${roomId}', which is not a room id`)
  }
  for (const doorId of Object.keys(rule.requires_doors)) {
    if (!has(world.doors, doorId)) fail(`${where}: requires_doors names '${doorId}', which is not a door id`)
  }
  for (const [name, c] of Object.entries(rule.requires_counters)) {
    if (c.at_least == null && c.at_most == null) fail(`${where}: counter '${name}' has neither 'at_least' nor 'at_most'`)
    if (c.at_least != null && c.at_most != null && c.at_least > c.at_most) {
      fail(`${where}: counter '${name}' requires at_least ${c.at_least} and at_most ${c.at_most}, which nothing can satisfy`)
    }
  }
  rule.effects.forEach((e, n) => checkEffect(world, e, `${where} effect ${n}`))
}

function checkEffect(world, e, where) {
  switch (e.type) {
    case 'set_flag':
      if (e.flag == null || e.value == null) fail(`${where}: set_flag requires 'flag' and 'value'`)
      break
    case 'move_item':
      if (e.item_id == null || e.to == null) fail(`${where}: move_item requires 'item_id' and 'to'`)
      if (!has(world.items, e.item_id)) fail(`${where}: move_item names item '${e.item_id}', which is not an item id`)
      if (e.to !== LOC_INVENTORY && e.to !== LOC_HIDDEN && !has(world.rooms, e.to)) {
        fail(`${where}: move_item destination '${e.to}' is not a room id, 'inventory', or 'hidden'`)
      }
      break
    case 'set_door':
      if (e.door_id == null) fail(`${where}: set_door requires 'door_id'`)
      if (e.open == null && e.locked == null) fail(`${where}: set_door requires at least one of 'open' or 'locked'`)
      if (!has(world.doors, e.door_id)) fail(`${where}: set_door names door '${e.door_id}', which is not a door id`)
      break
    case 'move_npc':
      if (e.npc_id == null || e.to == null) fail(`${where}: move_npc requires 'npc_id' and 'to'`)
      if (!has(world.npcs, e.npc_id)) fail(`${where}: move_npc names npc '${e.npc_id}', which is not an npc id`)
      if (!has(world.rooms, e.to)) fail(`${where}: move_npc destination '${e.to}' is not a room id`)
      break
    case 'move_player':
      if (e.to == null) fail(`${where}: move_player requires 'to'`)
      if (!has(world.rooms, e.to)) fail(`${where}: move_player destination '${e.to}' is not a room id`)
      break
    case 'adjust_counter':
      if (e.counter == null || e.delta == null) fail(`${where}: adjust_counter requires 'counter' and 'delta'`)
      break
    case 'end_game':
      if (e.outcome == null) fail(`${where}: end_game requires 'outcome' ('win' or 'loss')`)
      if (e.outcome === 'loss' && !e.epilogue) fail(`${where}: a losing end_game needs its own 'epilogue'`)
      break
    case 'win_game':
      break
    default:
      fail(`${where}: unknown effect type '${e.type}'`)
  }
}
