// World JSON <-> Blockly workspace state, in both directions, as plain data.
//
// The state is Blockly's own serialization format ({blocks, variables}), so the
// builder loads and saves it with Blockly.serialization.workspaces, and these
// functions never need Blockly itself — which is what lets the tests check that
// a world survives the round trip. Blocks carry no positions: the builder lays a
// loaded world out from the blocks' real rendered sizes (blocks.js, arrange).
//
// Ids live in block.data on the blocks that define things (rooms, doors, items,
// characters, rules); everything else refers to them by id through dropdowns.

import { DIRECTION_ORDER, normalizeWorld } from '../engine/models.js'

/** Where "A blank world" starts: the story block and one room, ready to play. */
export const BLANK_WORLD = {
  title: 'My adventure',
  intro: 'Write the first thing the player reads here.',
  win_epilogue: 'You did it!',
  player_location: 'first_room',
  rooms: { first_room: { id: 'first_room', name: 'first room', description: 'Describe what the player sees.' } },
}

// --- world -> blocks ------------------------------------------------------------

/** A Blockly workspace state for a world. */
export function worldToState(raw) {
  const world = normalizeWorld(raw)
  const variables = new Map()
  const flagVar = name => variable(variables, name, 'Flag')
  const counterVar = name => variable(variables, name, 'Counter')

  const conditions = rule => [
    ...rule.rooms.map(room => ({ type: 'cond_room', fields: { ROOM: room } })),
    ...Object.entries(rule.requires_flags).map(([name, value]) => ({
      type: 'cond_flag', fields: { FLAG: flagVar(name), VALUE: String(value) },
    })),
    ...Object.entries(rule.requires_counters).flatMap(([name, c]) => [
      ...(c.at_least != null ? [{ type: 'cond_counter', fields: { COUNTER: counterVar(name), OP: 'at_least', N: c.at_least } }] : []),
      ...(c.at_most != null ? [{ type: 'cond_counter', fields: { COUNTER: counterVar(name), OP: 'at_most', N: c.at_most } }] : []),
    ]),
    ...Object.entries(rule.requires_doors).map(([door, open]) => ({
      type: 'cond_door', fields: { DOOR: door, STATE: open ? 'open' : 'closed' },
    })),
  ]

  const effects = list => list.flatMap(e => {
    switch (e.type) {
      case 'set_flag': return [{ type: 'eff_flag', fields: { FLAG: flagVar(e.flag), VALUE: String(e.value) } }]
      case 'adjust_counter': return [{ type: 'eff_counter', fields: { COUNTER: counterVar(e.counter), DELTA: e.delta } }]
      case 'move_item': return [{ type: 'eff_move_item', fields: { ITEM: e.item_id, TO: e.to } }]
      case 'move_npc': return [{ type: 'eff_move_npc', fields: { NPC: e.npc_id, TO: e.to } }]
      case 'move_player': return [{ type: 'eff_move_player', fields: { TO: e.to } }]
      case 'set_door': return [
        ...(e.open != null ? [{ type: 'eff_door', fields: { DOOR: e.door_id, STATE: e.open ? 'open' : 'closed' } }] : []),
        ...(e.locked != null ? [{ type: 'eff_door', fields: { DOOR: e.door_id, STATE: e.locked ? 'locked' : 'unlocked' } }] : []),
      ]
      case 'end_game':
      case 'win_game':
        return [{ type: 'eff_end', fields: { OUTCOME: e.outcome ?? 'win', EPILOGUE: e.epilogue ?? '' } }]
    }
    return []
  })

  const ruleInputs = rule => ({
    IF: chain(conditions(rule)),
    THEN: chain(effects(rule.effects)),
  })

  const blocks = []
  blocks.push({
    type: 'world',
    fields: {
      TITLE: world.title, START: world.player_location, PRONOUNS: world.pronouns,
      INTRO: world.intro, WIN: world.win_epilogue,
    },
  })

  for (const room of Object.values(world.rooms)) {
    const exits = DIRECTION_ORDER.filter(d => room.exits[d]).map(d => ({
      type: 'exit',
      fields: { DIR: d, TO: room.exits[d].to, DOOR: room.exits[d].door_id ?? '', MESSAGE: room.exits[d].pass_message ?? '' },
    }))
    const alt = room.alt_flag != null
      ? [{ type: 'room_alt', fields: { FLAG: flagVar(room.alt_flag), DESCRIPTION: room.alt_description ?? '', SOUNDS: room.alt_sounds ?? '' } }]
      : []
    blocks.push({
      type: 'room',
      data: room.id,
      fields: { NAME: room.name, DESCRIPTION: room.description, SOUNDS: room.sounds ?? '' },
      inputs: { EXITS: chain(exits), ALT: chain(alt) },
    })
  }

  for (const door of Object.values(world.doors)) {
    const lock = !door.locked ? []
      : door.unlock_flag != null
        ? [{ type: 'lock_until', fields: { FLAG: flagVar(door.unlock_flag) } }]
        : [{ type: 'lock_fixed' }]
    blocks.push({
      type: 'door',
      data: door.id,
      fields: {
        NAME: door.name, ALIASES: door.aliases.join(', '), DESCRIPTION: door.description,
        OPEN: door.open ? 'open' : 'closed', LOCKED_MSG: door.locked_message ?? '', OPEN_MSG: door.open_message ?? '',
      },
      inputs: { LOCK: chain(lock) },
    })
  }

  for (const item of Object.values(world.items)) {
    const alt = item.alt_flag != null
      ? [{ type: 'item_alt', fields: { FLAG: flagVar(item.alt_flag), DESCRIPTION: item.alt_description ?? '' } }]
      : []
    const refusals = Object.entries(item.open_refusal_with).map(([tool, message]) => ({
      type: 'refusal_with', fields: { ITEM: tool, MESSAGE: message },
    }))
    blocks.push({
      type: 'item',
      data: item.id,
      fields: {
        NAME: item.name, ALIASES: item.aliases.join(', '), DESCRIPTION: item.description,
        LOCATION: item.location, PORTABLE: item.portable ? 'TRUE' : 'FALSE', REFUSAL: item.open_refusal ?? '',
      },
      inputs: { ALT: chain(alt), REFUSAL_WITH: chain(refusals) },
    })
  }

  for (const npc of Object.values(world.npcs)) {
    const says = npc.dialogue.map(rule => ({
      type: 'says',
      fields: { TEXT: rule.text, ONCE: rule.once ? 'TRUE' : 'FALSE' },
      inputs: ruleInputs(rule),
    }))
    blocks.push({
      type: 'npc',
      data: npc.id,
      fields: {
        NAME: npc.name, ALIASES: npc.aliases.join(', '), DESCRIPTION: npc.description,
        LOCATION: npc.location, FOLLOWS: npc.follows_player ? 'TRUE' : 'FALSE',
      },
      inputs: { SAYS: chain(says) },
    })
  }

  for (const rule of world.interactions) {
    blocks.push({
      type: 'use_rule',
      data: rule.id,
      fields: { ITEM: rule.item_id, TARGET: rule.target_id ?? '', MESSAGE: rule.message, ONCE: rule.once ? 'TRUE' : 'FALSE' },
      inputs: ruleInputs(rule),
    })
  }
  for (const rule of world.triggers) {
    blocks.push({
      type: 'trigger_rule',
      data: rule.id,
      fields: { WHEN: rule.when, TEXT: rule.text, ONCE: rule.once ? 'TRUE' : 'FALSE' },
      inputs: ruleInputs(rule),
    })
  }

  return {
    blocks: { languageVersion: 0, blocks: blocks.map(prune) },
    variables: [...variables.values()],
  }
}

function variable(map, name, type) {
  const key = `${type}:${name}`
  if (!map.has(key)) map.set(key, { name, id: key, type })
  return { id: key }
}

/** Link a list of blocks into a Blockly statement stack. */
function chain(list) {
  if (!list.length) return undefined
  const [first, ...rest] = list
  const next = chain(rest)
  const block = prune({ ...first })
  return { block: next ? { ...block, next } : block }
}

/** Drop empty inputs so the state stays tidy. */
function prune(block) {
  if (block.inputs) {
    block.inputs = Object.fromEntries(Object.entries(block.inputs).filter(([, v]) => v))
    if (!Object.keys(block.inputs).length) delete block.inputs
  }
  return block
}

// --- blocks -> world --------------------------------------------------------------

/** A raw world (validate it with loadWorld) from a Blockly workspace state. */
export function stateToWorld(state) {
  const vars = new Map((state.variables ?? []).map(v => [v.id, v.name]))
  const top = state.blocks?.blocks ?? []
  const used = new Set()
  const idFor = (block, fallback) => {
    let id = block.data || slugify(fallback)
    for (let n = 2; used.has(id); n++) id = `${block.data || slugify(fallback)}_${n}`
    used.add(id)
    return id
  }

  const field = (block, name) => {
    const value = block.fields?.[name]
    if (value && typeof value === 'object') return vars.get(value.id) ?? value.name ?? ''
    return value ?? ''
  }
  const yes = (block, name) => field(block, name) === true || field(block, name) === 'TRUE'
  const optional = value => (value === '' ? null : value)
  const aliases = value => String(value).split(',').map(s => s.trim()).filter(Boolean)
  const stack = (block, input) => {
    const out = []
    for (let b = block.inputs?.[input]?.block; b; b = b.next?.block) out.push(b)
    return out
  }

  const conditions = block => {
    const rule = { rooms: [], requires_flags: {}, requires_counters: {}, requires_doors: {} }
    for (const c of stack(block, 'IF')) {
      switch (c.type) {
        case 'cond_room': rule.rooms.push(field(c, 'ROOM')); break
        case 'cond_flag': rule.requires_flags[field(c, 'FLAG')] = field(c, 'VALUE') === 'true'; break
        case 'cond_door': rule.requires_doors[field(c, 'DOOR')] = field(c, 'STATE') === 'open'; break
        case 'cond_counter': {
          const name = field(c, 'COUNTER')
          rule.requires_counters[name] = { ...rule.requires_counters[name], [field(c, 'OP')]: Number(field(c, 'N')) }
          break
        }
      }
    }
    return rule
  }

  const effects = block => stack(block, 'THEN').map(e => {
    switch (e.type) {
      case 'eff_flag': return { type: 'set_flag', flag: field(e, 'FLAG'), value: field(e, 'VALUE') === 'true' }
      case 'eff_counter': return { type: 'adjust_counter', counter: field(e, 'COUNTER'), delta: Number(field(e, 'DELTA')) }
      case 'eff_move_item': return { type: 'move_item', item_id: field(e, 'ITEM'), to: field(e, 'TO') }
      case 'eff_move_npc': return { type: 'move_npc', npc_id: field(e, 'NPC'), to: field(e, 'TO') }
      case 'eff_move_player': return { type: 'move_player', to: field(e, 'TO') }
      case 'eff_door': {
        const state = field(e, 'STATE')
        return state === 'open' || state === 'closed'
          ? { type: 'set_door', door_id: field(e, 'DOOR'), open: state === 'open' }
          : { type: 'set_door', door_id: field(e, 'DOOR'), locked: state === 'locked' }
      }
      case 'eff_end': {
        const epilogue = optional(field(e, 'EPILOGUE'))
        return { type: 'end_game', outcome: field(e, 'OUTCOME'), ...(epilogue ? { epilogue } : {}) }
      }
    }
    return null
  }).filter(Boolean)

  const world = {
    schema_version: 1,
    title: '', intro: '', win_epilogue: '', pronouns: 'they', player_location: '',
    rooms: {}, doors: {}, items: {}, npcs: {}, interactions: [], triggers: [],
    flags: {}, counters: {},
  }
  let rules = 0

  for (const block of top) {
    switch (block.type) {
      case 'world':
        world.title = field(block, 'TITLE')
        world.player_location = field(block, 'START')
        world.pronouns = field(block, 'PRONOUNS') || 'they'
        world.intro = field(block, 'INTRO')
        world.win_epilogue = field(block, 'WIN')
        break
      case 'room': {
        const id = idFor(block, field(block, 'NAME'))
        const exits = {}
        for (const e of stack(block, 'EXITS')) {
          exits[field(e, 'DIR')] = {
            to: field(e, 'TO'),
            door_id: optional(field(e, 'DOOR')),
            pass_message: optional(field(e, 'MESSAGE')),
          }
        }
        const alt = stack(block, 'ALT')[0]
        world.rooms[id] = {
          id,
          name: field(block, 'NAME'),
          description: field(block, 'DESCRIPTION'),
          sounds: optional(field(block, 'SOUNDS')),
          exits,
          alt_flag: alt ? field(alt, 'FLAG') : null,
          alt_description: alt ? optional(field(alt, 'DESCRIPTION')) : null,
          alt_sounds: alt ? optional(field(alt, 'SOUNDS')) : null,
        }
        break
      }
      case 'door': {
        const id = idFor(block, field(block, 'NAME'))
        const lock = stack(block, 'LOCK')[0]
        world.doors[id] = {
          id,
          name: field(block, 'NAME'),
          aliases: aliases(field(block, 'ALIASES')),
          description: field(block, 'DESCRIPTION'),
          open: field(block, 'OPEN') === 'open',
          locked: !!lock,
          unlock_flag: lock?.type === 'lock_until' ? field(lock, 'FLAG') : null,
          locked_message: optional(field(block, 'LOCKED_MSG')),
          open_message: optional(field(block, 'OPEN_MSG')),
        }
        break
      }
      case 'item': {
        const id = idFor(block, field(block, 'NAME'))
        const alt = stack(block, 'ALT')[0]
        world.items[id] = {
          id,
          name: field(block, 'NAME'),
          aliases: aliases(field(block, 'ALIASES')),
          description: field(block, 'DESCRIPTION'),
          location: field(block, 'LOCATION'),
          portable: yes(block, 'PORTABLE'),
          alt_flag: alt ? field(alt, 'FLAG') : null,
          alt_description: alt ? optional(field(alt, 'DESCRIPTION')) : null,
          open_refusal: optional(field(block, 'REFUSAL')),
          open_refusal_with: Object.fromEntries(
            stack(block, 'REFUSAL_WITH').map(r => [field(r, 'ITEM'), field(r, 'MESSAGE')])),
        }
        break
      }
      case 'npc': {
        const id = idFor(block, field(block, 'NAME'))
        world.npcs[id] = {
          id,
          name: field(block, 'NAME'),
          aliases: aliases(field(block, 'ALIASES')),
          description: field(block, 'DESCRIPTION'),
          location: field(block, 'LOCATION'),
          follows_player: yes(block, 'FOLLOWS'),
          dialogue: stack(block, 'SAYS').map(s => ({
            ...conditions(s), text: field(s, 'TEXT'), once: yes(s, 'ONCE'), effects: effects(s),
          })),
        }
        break
      }
      case 'use_rule':
        world.interactions.push({
          id: idFor(block, `rule ${++rules}`),
          item_id: field(block, 'ITEM'),
          target_id: optional(field(block, 'TARGET')),
          ...conditions(block),
          message: field(block, 'MESSAGE'),
          once: yes(block, 'ONCE'),
          effects: effects(block),
        })
        break
      case 'trigger_rule':
        world.triggers.push({
          id: idFor(block, `trigger ${++rules}`),
          when: field(block, 'WHEN') || 'enter',
          ...conditions(block),
          text: field(block, 'TEXT'),
          once: yes(block, 'ONCE'),
          effects: effects(block),
        })
        break
    }
  }
  return world
}

/** "Pod Bay Door!" -> "pod_bay_door". Never empty. */
export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'thing'
}
