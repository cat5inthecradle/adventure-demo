// The benchmark is only meaningful if every case actually reaches the model and
// every expected answer is one the model is allowed to give.
import { describe, expect, it } from 'vitest'
import { CASES, outcomeOf, passes, prepare } from '../src/bench/cases.js'
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
