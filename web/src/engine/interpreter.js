// The seam where a language model (or anything else) can be plugged in later.
//
// An interpreter turns a line the dumb parser could not use into a *candidate*
// action. It never decides truth: everything it may know arrives in an
// InterpreterContext — a deliberately small snapshot of what the player can see —
// and whatever it answers is checked against that snapshot and then handed to the
// engine, which still has the final say.
//
// The contract (all an LLM layer needs to implement):
//
//   interface Interpreter {
//     name: string                              // shown in the parser panel
//     interpret(utterance, context, transcript) // -> Promise<InterpreterResult>
//   }
//
//   context.parserSaid is what the parser told the player, e.g. "I don't see any
//   'metal bar' here." — the strongest hint that the player meant something absent.
//
//   InterpreterResult =
//     | { kind: 'action', action, rephrased?, meta? }
//                                                // a structured Action (see actions.js);
//                                                // `rephrased` is the request in plain
//                                                // words, which the parser tries first
//     | { kind: 'clarify', question, meta? }     // ask the player something
//     | { kind: 'unavailable', detail, meta? }   // network down, no key, etc.
//
//   transcript: the last few [playerLine, gameResponse] pairs, oldest first.
//   meta: anything worth showing in the panel — model, tokens, latency, raw reply.

import * as q from './queries.js'
import { ACTION_TYPES } from './actions.js'
import { DIRECTION_ORDER } from './models.js'

const entity = (e, kind) => ({ id: e.id, name: e.name, aliases: [...e.aliases], kind })

/** Snapshot exactly what the player can currently see and do — nothing more. */
export function buildContext(world) {
  const room = q.currentRoom(world)
  return {
    roomName: room.name,
    roomDescription: q.resolvedDescription(world, room),
    exits: DIRECTION_ORDER.filter(d => d in room.exits),
    // Where each exit leads, for rooms the player has already been — the same
    // knowledge the parser's "go to <room>" routing is allowed to use.
    exitNames: Object.fromEntries(DIRECTION_ORDER
      .filter(d => d in room.exits && q.visitedRooms(world).has(room.exits[d].to))
      .map(d => [d, world.rooms[room.exits[d].to].name])),
    visible: [
      ...q.itemsInRoom(world, room.id).map(e => entity(e, 'item')),
      ...q.npcsInRoom(world, room.id).map(e => entity(e, 'npc')),
      ...q.doorsInRoom(world, room.id).map(e => entity(e, 'door')),
    ],
    inventory: q.inventory(world).map(e => entity(e, 'item')),
    legalActionTypes: [...ACTION_TYPES],
  }
}

/**
 * Defense in depth: every id the action names must be in the context, and a `go`
 * must name a current exit. Returns the action if clean, null otherwise.
 */
export function validateResolution(context, action) {
  if (!action || !ACTION_TYPES.includes(action.type)) return null
  const known = new Set([...context.visible, ...context.inventory].map(e => e.id))
  switch (action.type) {
    case 'look': case 'inventory': return action
    case 'listen': return action.target == null || known.has(action.target) ? action : null
    case 'go': return context.exits.includes(action.direction) ? action : null
    case 'examine': case 'open': case 'traverse': return known.has(action.target) ? action : null
    case 'take': case 'drop': return known.has(action.item) ? action : null
    case 'talk': return known.has(action.npc) ? action : null
    case 'use':
      if (!known.has(action.item)) return null
      if (action.target != null && !known.has(action.target)) return null
      return action
  }
  return null
}

/**
 * A JSON Schema that admits only actions legal to *name* right now: entity fields
 * are enums of the ids in the context, directions are the current exits. Hand it
 * to a constrained decoder (WebLLM's `response_format: {type: 'json_object',
 * schema}`) and a small model physically cannot invent an id. A `clarify` branch
 * lets it ask instead of guessing.
 *
 * Kept to the plain subset grammar compilers handle well: `anyOf`, single-value
 * `enum` for the discriminator, and no empty enums — a verb with nothing to aim at
 * (no doors here, nothing carried) is left out rather than made unsatisfiable.
 */
export function actionSchema(context, { explain = false } = {}) {
  const ids = [...context.visible, ...context.inventory].map(e => e.id)
  const doors = context.visible.filter(e => e.kind === 'door').map(e => e.id)
  const npcs = context.visible.filter(e => e.kind === 'npc').map(e => e.id)
  const carried = context.inventory.map(e => e.id)
  const oneOfIds = list => ({ type: 'string', enum: list })

  const variants = []
  const variant = (type, fields = {}, optional = {}) => {
    // With `explain`, every answer opens with a short paraphrase ("means"), so a
    // model thinks about what the player wants before it commits to a verb.
    const props = { ...(explain ? { means: { type: 'string' } } : {}), type: { type: 'string', enum: [type] } }
    for (const [name, list] of Object.entries(fields)) {
      if (!list.length) return              // nothing it could name: drop the verb
      props[name] = oneOfIds(list)
    }
    for (const [name, list] of Object.entries(optional)) {
      if (list.length) props[name] = oneOfIds(list)
    }
    variants.push({
      type: 'object',
      properties: props,
      required: [...(explain ? ['means'] : []), 'type', ...Object.keys(fields)],
      additionalProperties: false,
    })
  }

  // Asking comes first: when nothing in view fits, it is the right answer.
  variants.push({
    type: 'object',
    properties: {
      ...(explain ? { means: { type: 'string' } } : {}),
      type: { type: 'string', enum: ['clarify'] },
      // No maxLength: a length bound compiles to a huge grammar (seconds, per
      // schema). The caller's max_tokens caps the reply instead.
      question: { type: 'string' },
    },
    required: [...(explain ? ['means'] : []), 'type', 'question'],
    additionalProperties: false,
  })
  variant('look')
  variant('inventory')
  variant('go', { direction: context.exits })
  variant('examine', { target: ids })
  variant('take', { item: ids })
  variant('drop', { item: carried })
  variant('open', { target: ids })
  variant('traverse', { target: doors })
  variant('listen', {}, { target: ids })
  variant('use', { item: ids }, { target: ids })
  variant('talk', { npc: npcs })
  return { anyOf: variants }
}

/**
 * A scripted interpreter for tests and classroom demos: maps exact utterances to
 * results. Real interpreters (an LLM, a rules engine a student writes) share the
 * same shape.
 */
export class ScriptedInterpreter {
  constructor(name, script) {
    this.name = name
    this.script = script
  }

  async interpret(utterance) {
    return this.script[utterance.trim().toLowerCase()]
      ?? { kind: 'clarify', question: "I'm not sure what you mean." }
  }
}
