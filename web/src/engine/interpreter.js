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
//   InterpreterResult =
//     | { kind: 'action', action, meta? }        // a structured Action (see actions.js)
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
 */
export function actionSchema(context) {
  const ids = [...context.visible, ...context.inventory].map(e => e.id)
  const doors = context.visible.filter(e => e.kind === 'door').map(e => e.id)
  const npcs = context.visible.filter(e => e.kind === 'npc').map(e => e.id)
  const idOf = list => (list.length ? { type: 'string', enum: list } : { not: {} })
  const variant = (type, props = {}, required = []) => ({
    type: 'object',
    properties: { type: { const: type }, ...props },
    required: ['type', ...required],
    additionalProperties: false,
  })
  return {
    oneOf: [
      variant('look'),
      variant('inventory'),
      variant('go', { direction: idOf(context.exits) }, ['direction']),
      variant('examine', { target: idOf(ids) }, ['target']),
      variant('take', { item: idOf(ids) }, ['item']),
      variant('drop', { item: idOf(context.inventory.map(e => e.id)) }, ['item']),
      variant('open', { target: idOf(ids) }, ['target']),
      variant('traverse', { target: idOf(doors) }, ['target']),
      variant('listen', { target: idOf(ids) }),
      variant('use', { item: idOf(ids), target: idOf(ids) }, ['item']),
      variant('talk', { npc: idOf(npcs) }, ['npc']),
      variant('clarify', { question: { type: 'string', maxLength: 160 } }, ['question']),
    ],
  }
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
