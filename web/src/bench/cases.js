// Replaying and scoring the natural-language benchmark cases.
//
// Shared by the bench page (which runs them through a real model) and the unit
// tests (which check every case is well-formed without one).

import fixture from '../../tests/fixtures/nl_cases.json'
import wayfarer from '../../../worlds/wayfarer.json'
import { loadWorld } from '../engine/loader.js'
import { takeTurn } from '../engine/turn.js'
import { isParseError, parse } from '../engine/parser.js'
import { buildContext } from '../engine/interpreter.js'
import { renderParseError } from '../engine/renderer.js'

export const CASES = fixture.cases.map(c => ({
  ...c,
  setupLines: [...fixture.states[c.state], ...(c.setup ?? [])],
}))

/** Play a case's setup with the parser alone. Returns the world and the transcript. */
export async function prepare(testCase) {
  const world = loadWorld(wayfarer)
  const transcript = []
  for (const line of testCase.setupLines) {
    const result = await takeTurn(world, line)
    if (result.parseError) throw new Error(`case ${testCase.id}: setup line "${line}" did not parse`)
    transcript.push([line, result.text])
  }
  return { world, transcript }
}

const clean = action => Object.fromEntries(Object.entries(action ?? {}).filter(([, v]) => v != null))

/** What a turn amounted to, in the vocabulary of `expect`. */
export function outcomeOf(turn) {
  if (turn.route === 'parser') return { kind: 'parser', action: clean(turn.action) }
  const status = turn.interpreter?.status
  // A rejected answer ends with the game asking the player — the same as clarify.
  if (status === 'clarify' || status === 'rejected') return { kind: 'clarify' }
  if (status === 'action') return { kind: 'action', action: clean(turn.action) }
  return { kind: status ?? 'none' }
}

const sameAction = (a, b) => {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
}

export function passes(testCase, outcome) {
  return testCase.expect.some(want => (want === 'clarify'
    ? outcome.kind === 'clarify'
    : outcome.kind === 'action' && sameAction(want, outcome.action)))
}

export const describeOutcome = o => (o.kind === 'action' || o.kind === 'parser')
  ? `${o.kind === 'parser' ? 'parser: ' : ''}${JSON.stringify(o.action)}`
  : o.kind

export const describeExpect = c => c.expect.map(e => (e === 'clarify' ? 'clarify' : JSON.stringify(e))).join(' or ')

/** The context an interpreter would be handed for a case, without running one. */
export async function contextFor(testCase) {
  const { world, transcript } = await prepare(testCase)
  const parsed = parse(world, testCase.say)
  return {
    context: { ...buildContext(world), parserSaid: isParseError(parsed) ? renderParseError(parsed) : null },
    transcript: transcript.slice(-6),
  }
}

/** Run one case through an interpreter. */
export async function runCase(testCase, interpreter) {
  const { world, transcript } = await prepare(testCase)
  const started = performance.now()
  const turn = await takeTurn(world, testCase.say, { interpreter, transcript: transcript.slice(-6) })
  const outcome = outcomeOf(turn)
  return {
    id: testCase.id,
    say: testCase.say,
    expected: describeExpect(testCase),
    got: describeOutcome(outcome),
    raw: turn.interpreter?.answer?.meta?.raw ?? null,
    messages: turn.interpreter?.answer?.meta?.messages ?? null,
    reread: turn.interpreter?.reread
      ? { text: turn.interpreter.reread.text, used: turn.interpreter.via === 'reread' }
      : null,
    pass: passes(testCase, outcome),
    ms: Math.round(performance.now() - started),
  }
}
