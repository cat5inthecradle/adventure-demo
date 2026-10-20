// The rules engine: apply(world, action) -> events.
//
// The ONLY thing that mutates a world, and the only source of game truth. Never
// performs I/O, never uses randomness or the clock, and never throws for an
// illegal player action — it returns an action_failed event instead.
//
// Actions and events are plain objects discriminated by `type`. See actions.js and
// events.js for their shapes.

import * as q from './queries.js'
import { DIRECTION_ORDER, LOC_INVENTORY, isEnded } from './models.js'
import { Reason } from './events.js'

const get = (table, id) => (id != null && Object.hasOwn(table, id) ? table[id] : null)
const ref = q.entityRef

/** Validate legality, mutate world in place, return events. Deterministic. */
export function apply(world, action) {
  if (isEnded(world)) return [failed(Reason.GAME_OVER)]

  const origin = world.player_location
  // Captured before the action runs, because whatever moves the player also marks
  // the destination visited.
  const seenBefore = new Set(world.visited)

  let events
  switch (action.type) {
    case 'look': events = [describeRoom(world)]; break
    case 'examine': events = examine(world, action.target); break
    case 'go': events = go(world, action.direction); break
    case 'traverse': events = traverse(world, action.target); break
    case 'listen': events = listen(world, action.target ?? null); break
    case 'take': events = take(world, action.item); break
    case 'drop': events = drop(world, action.item); break
    case 'open': events = open(world, action.target); break
    case 'use': events = use(world, action.item, action.target ?? null); break
    case 'talk': events = talk(world, action.npc); break
    case 'inventory': events = [{ type: 'inventory_listed', items: q.inventory(world).map(ref) }]; break
    default: throw new Error(`unknown action type '${action.type}'`)
  }

  if (events.length === 1 && events[0].type === 'action_failed') return events

  world.turn_count += 1
  // An action that put the player somewhere new owes them the new room.
  const moved = world.player_location !== origin
  if (moved) events.push(describeRoom(world, !seenBefore.has(world.player_location)))
  events.push(...runTriggers(world, moved, seenBefore))
  return events
}

/** The room_described event for the current room. */
export function describeRoom(world, firstVisit = true) {
  const room = q.currentRoom(world)
  const exits = []
  for (const direction of DIRECTION_ORDER) {
    const exit = room.exits[direction]
    if (!exit) continue
    if (exit.door_id == null) {
      exits.push({ direction, door: null, door_open: null })
    } else {
      const door = world.doors[exit.door_id]
      exits.push({ direction, door: ref(door), door_open: door.open })
    }
  }
  return {
    type: 'room_described',
    room: ref(room),
    description: q.resolvedDescription(world, room),
    exits,
    items: q.itemsInRoom(world, room.id).map(ref),
    npcs: q.npcsInRoom(world, room.id).map(ref),
    first_visit: firstVisit,
  }
}

/**
 * The world's own turn, after the player has had theirs. Every matching trigger
 * fires, in file order, each judged against the world the one before it left.
 */
function runTriggers(world, moved, seenBefore) {
  const events = []
  for (const trigger of world.triggers) {
    if (isEnded(world)) break
    if (trigger.once && trigger.fired) continue
    if (trigger.when === 'enter' && !moved) continue
    if (!q.conditionsMatch(world, trigger)) continue
    trigger.fired = true
    if (trigger.text) events.push({ type: 'narrated', trigger: trigger.id, text: trigger.text })
    const here = world.player_location
    const ended = applyEffects(world, trigger.effects)
    if (world.player_location !== here) {
      events.push(describeRoom(world, !seenBefore.has(world.player_location)))
    }
    if (ended) events.push(ended)
  }
  return events
}

function failed(reason, subject = null, message = null) {
  return { type: 'action_failed', reason, subject, message }
}

function notPresent(world, id) {
  const entity = q.findEntity(world, id)
  return failed(Reason.NOT_PRESENT, entity ? ref(entity) : null)
}

const visibleById = world => new Map(q.visibleEntities(world).map(e => [e.id, e]))

function examine(world, targetId) {
  const entity = visibleById(world).get(targetId)
  if (!entity) return [notPresent(world, targetId)]
  const description = q.kindOf(world, entity.id) === 'item'
    ? q.resolvedDescription(world, entity)
    : entity.description
  return [{ type: 'entity_examined', entity: ref(entity), description }]
}

function go(world, direction) {
  const room = q.currentRoom(world)
  const exit = room.exits[direction]
  if (!exit) return [failed(Reason.NO_EXIT)]
  const door = exit.door_id != null ? world.doors[exit.door_id] : null
  if (door && !door.open) return [failed(Reason.DOOR_CLOSED, ref(door))]
  return passThrough(world, room, exit, door)
}

/** True when a locked door's unlock flag is set, i.e. it may be opened now. */
const canUnlock = (world, door) => door.unlock_flag != null && !!world.flags[door.unlock_flag]

/**
 * Go through a named portal. Naming the door carries more intent than naming a
 * direction, so an unlocked-but-shut door opens on the way. A locked one refuses.
 */
function traverse(world, doorId) {
  const room = q.currentRoom(world)
  const door = get(world.doors, doorId)
  if (!door) return [notPresent(world, doorId)]
  const way = DIRECTION_ORDER.map(d => room.exits[d]).find(e => e && e.door_id === doorId)
  if (!way) return [failed(Reason.NOT_PRESENT, ref(door))]

  const events = []
  if (!door.open) {
    if (door.locked) {
      if (!canUnlock(world, door)) return [failed(Reason.DOOR_LOCKED, ref(door), door.locked_message)]
      door.locked = false
    }
    door.open = true
    events.push({ type: 'door_opened', door: ref(door), message: door.open_message })
  }
  return [...events, ...passThrough(world, room, way, door)]
}

function passThrough(world, room, way, door) {
  relocatePlayer(world, way.to)
  return [{
    type: 'moved',
    from_room: ref(room),
    to_room: ref(world.rooms[way.to]),
    through: door ? ref(door) : null,
    message: way.pass_message,
  }]
}

/** The one place player movement happens. Companions come along. */
function relocatePlayer(world, roomId) {
  if (!world.visited.includes(world.player_location)) world.visited.push(world.player_location)
  const followers = Object.values(world.npcs)
    .filter(npc => npc.follows_player && npc.location === world.player_location)
  world.previous_location = world.player_location
  world.player_location = roomId
  for (const npc of followers) npc.location = roomId
  if (!world.visited.includes(roomId)) world.visited.push(roomId)
}

/**
 * Hearing cascades. A portal with something to say says it; everything else gives
 * the room's own sound — so getting an answer at all is never the tell.
 */
function listen(world, targetId) {
  const room = q.currentRoom(world)
  const ambient = { type: 'listened', subject: null, text: q.resolvedSounds(world, room) }
  if (targetId == null) return [ambient]

  const subject = visibleById(world).get(targetId)
  if (!subject) return [notPresent(world, targetId)]
  ambient.subject = ref(subject)
  if (q.kindOf(world, subject.id) !== 'door') return [ambient]

  for (const rule of subject.listening) {
    if (rule.once && rule.fired) continue
    if (!q.conditionsMatch(world, rule)) continue
    rule.fired = true
    const events = [{ type: 'listened', subject: ref(subject), text: rule.text }]
    const ended = applyEffects(world, rule.effects)
    if (ended) events.push(ended)
    return events
  }
  return [ambient]
}

function take(world, itemId) {
  const item = get(world.items, itemId)
  if (!item) {
    // "take droid" while looking at it deserves "you can't take that", not
    // "you don't see that".
    const npc = get(world.npcs, itemId)
    if (npc && npc.location === world.player_location) return [failed(Reason.NOT_PORTABLE, ref(npc))]
    return [notPresent(world, itemId)]
  }
  if (item.location !== world.player_location) {
    const reason = item.location === LOC_INVENTORY ? Reason.ALREADY_CARRYING : Reason.NOT_PRESENT
    return [failed(reason, ref(item))]
  }
  if (!item.portable) return [failed(Reason.NOT_PORTABLE, ref(item))]
  item.location = LOC_INVENTORY
  return [{ type: 'item_taken', item: ref(item) }]
}

function drop(world, itemId) {
  const item = get(world.items, itemId)
  if (!item || item.location !== LOC_INVENTORY) {
    return [failed(Reason.NOT_CARRYING, item ? ref(item) : null)]
  }
  item.location = world.player_location
  return [{ type: 'item_dropped', item: ref(item) }]
}

function open(world, targetId) {
  const entity = q.findEntity(world, targetId)
  if (!entity) return [notPresent(world, targetId)]
  if (q.kindOf(world, entity.id) !== 'door') {
    return [failed(Reason.NOT_OPENABLE, ref(entity), openRefusal(world, entity))]
  }
  if (!q.doorsInRoom(world, world.player_location).some(d => d.id === entity.id)) {
    return [failed(Reason.NOT_PRESENT, ref(entity))]
  }
  if (entity.open) return [failed(Reason.ALREADY_OPEN, ref(entity))]
  if (entity.locked) {
    if (!canUnlock(world, entity)) return [failed(Reason.DOOR_LOCKED, ref(entity), entity.locked_message)]
    entity.locked = false
  }
  entity.open = true
  return [{ type: 'door_opened', door: ref(entity), message: entity.open_message }]
}

/** The world's own words for why this will not open, sharpened by the right tool. */
function openRefusal(world, entity) {
  if (q.kindOf(world, entity.id) !== 'item') return null
  for (const [toolId, message] of Object.entries(entity.open_refusal_with)) {
    if (world.items[toolId].location === LOC_INVENTORY) return message
  }
  return entity.open_refusal
}

/** The catch-all interaction verb. Its subject is anything the player can refer to. */
function use(world, itemId, targetId) {
  const visible = visibleById(world)
  const subject = visible.get(itemId)
  if (!subject) return [notPresent(world, itemId)]

  let target = null
  if (targetId != null) {
    target = visible.get(targetId)
    if (!target) return [notPresent(world, targetId)]
  }

  for (const interaction of world.interactions) {
    if (interaction.item_id !== itemId || interaction.target_id !== targetId) continue
    if (interaction.once && interaction.fired) continue
    if (!q.conditionsMatch(world, interaction)) continue
    interaction.fired = true
    const events = [{
      type: 'item_used',
      item: ref(subject),
      target: target ? ref(target) : null,
      message: interaction.message,
      interaction: interaction.id,
    }]
    const ended = applyEffects(world, interaction.effects)
    if (ended) events.push(ended)
    return events
  }
  return [failed(Reason.NOTHING_HAPPENS, ref(subject))]
}

function talk(world, npcId) {
  const npc = get(world.npcs, npcId)
  if (!npc || npc.location !== world.player_location) return [notPresent(world, npcId)]
  for (const rule of npc.dialogue) {
    if (rule.once && rule.fired) continue
    if (!q.conditionsMatch(world, rule)) continue
    rule.fired = true
    const events = [{ type: 'npc_spoke', npc: ref(npc), text: rule.text }]
    const ended = applyEffects(world, rule.effects)
    if (ended) events.push(ended)
    return events
  }
  return [failed(Reason.NOTHING_HAPPENS, ref(npc))]
}

/** Apply every effect in order. Returns the last ending declared, if any. */
function applyEffects(world, effects) {
  let ending = null
  for (const effect of effects) {
    const result = applyEffect(world, effect)
    if (result) ending = result
  }
  return ending
}

function applyEffect(world, effect) {
  switch (effect.type) {
    case 'set_flag':
      world.flags[effect.flag] = effect.value
      break
    case 'adjust_counter':
      world.counters[effect.counter] = (world.counters[effect.counter] ?? 0) + effect.delta
      break
    case 'move_item':
      world.items[effect.item_id].location = effect.to
      break
    case 'move_npc':
      world.npcs[effect.npc_id].location = effect.to
      break
    case 'move_player':
      relocatePlayer(world, effect.to)
      break
    case 'set_door': {
      const door = world.doors[effect.door_id]
      if (effect.open != null) door.open = effect.open
      if (effect.locked != null) door.locked = effect.locked
      break
    }
    case 'end_game':
    case 'win_game': {
      // `win_game` is the older spelling: always a win, with the world-wide epilogue.
      const outcome = effect.outcome ?? 'win'
      world.outcome = outcome
      return {
        type: 'game_ended',
        outcome,
        epilogue: effect.epilogue ?? world.win_epilogue,
        banner: effect.banner ?? null,
      }
    }
  }
  return null
}
