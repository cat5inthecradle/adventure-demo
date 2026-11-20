// The benchmark is only meaningful if every case actually reaches the model and
// every expected answer is one the model is allowed to give.
import { describe, expect, it } from 'vitest'
import { CASES, actionCounts, outcomeOf, passes, prepare, runCase } from '../src/bench/cases.js'
import { isGrounded } from '../src/engine/grounding.js'
import { isParseError, parse } from '../src/engine/parser.js'
import { buildContext, validateResolution } from '../src/engine/interpreter.js'
import { takeTurn } from '../src/engine/turn.js'
import { ScriptedInterpreter } from '../src/engine/interpreter.js'

describe.each(CASES.map(c => [c.id, c]))('case %s', (_, testCase) => {
  it('reaches the interpreter and expects only legal answers', async () => {
    const { world } = await prepare(testCase)
    expect(isParseError(parse(world, testCase.say)), `the parser understands "${testCase.say}"`).toBe(true)
    const context = buildContext(world)
    for (const want of testCase.expect) {
      if (want === 'clarify') continue
      expect(validateResolution(context, want), JSON.stringify(want)).not.toBeNull()
    }
  })
})

describe('scoring', () => {
  it('passes a right answer and fails a wrong one', async () => {
    const testCase = CASES.find(c => c.id === 'snag-bar')
    const right = new ScriptedInterpreter('right', { [testCase.say]: { kind: 'action', action: { type: 'take', item: 'prybar' } } })
    const wrong = new ScriptedInterpreter('wrong', { [testCase.say]: { kind: 'action', action: { type: 'examine', target: 'prybar' } } })
    for (const [interp, ok] of [[right, true], [wrong, false]]) {
      const { world } = await prepare(testCase)
      const turn = await takeTurn(world, testCase.say, { interpreter: interp })
      expect(passes(testCase, outcomeOf(turn))).toBe(ok)
    }
  })
})


describe('intent coverage and benchmark reporting', () => {
  it('keeps the conservative guard cost visible instead of changing expected answers', async () => {
    const blocked = []
    let supported = 0
    for (const c of CASES.filter(c => !c.expect.includes('clarify'))) {
      const { world } = await prepare(c)
      if (c.expect.some(action => isGrounded(c.say, action, world))) supported++
      else blocked.push(c.id)
    }
    expect(supported).toBe(39)
    expect(blocked).toEqual([
      'out-hatch', 'console-buttons', 'it-console', 'it-prybar', 'jam-crowbar',
      'smash-crate', 'power-up-droid', 'droid-juice', 'plug-it-in', 'way-to-pods',
      'head-lifeboats', 'back-engineering',
    ])
  })

  it('does not hide engine rejection behind a model clarification label', async () => {
    const c = CASES.find(c => c.id === 'flight-not-listen')
    const result = await runCase(c, new ScriptedInterpreter('wrong', {
      [c.say]: { kind: 'action', action: { type: 'listen' } },
    }))
    expect(result).toMatchObject({ got: 'rejected', disposition: 'rejected', pass: true, acceptedAction: false })
    expect(outcomeOf({ route: 'interpreter', interpreter: { status: 'unresolved' } })).toEqual({ kind: 'unresolved' })
    expect(passes(c, { kind: 'unresolved' })).toBe(false)
  })

  it('reports incorrect acceptance separately from conservative refusal', () => {
    expect(actionCounts([
      { pass: true, acceptedAction: true, expectedAction: true },
      { pass: false, acceptedAction: true, expectedAction: false },
      { pass: false, acceptedAction: false, expectedAction: true },
      { pass: true, acceptedAction: false, expectedAction: false },
    ])).toEqual({ correctAccepted: 1, incorrectAccepted: 1, expectedActions: 2, expectedActionsNotAccepted: 1 })
  })
})
