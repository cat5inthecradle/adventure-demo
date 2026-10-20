import { describe, expect, it } from 'vitest'
import wayfarer from '../../worlds/wayfarer.json'
import { loadWorld, WorldValidationError } from '../src/engine/loader.js'
import { parse } from '../src/engine/parser.js'
import { takeTurn } from '../src/engine/turn.js'
import { ScriptedInterpreter, actionSchema, buildContext } from '../src/engine/interpreter.js'
import { apply as applyPronouns } from '../src/engine/pronouns.js'

describe('loader', () => {
  it('names the offender in a broken world', () => {
    const broken = structuredClone(wayfarer)
    broken.items.prybar.location = 'nowhere'
    expect(() => loadWorld(broken)).toThrow(WorldValidationError)
    expect(() => loadWorld(broken)).toThrow(/prybar/)
  })
})

describe('parser trace', () => {
  it('records every stage without changing the result', () => {
    const world = loadWorld(wayfarer)
    const trace = []
    const traced = parse(world, 'opne the manual', trace)
    expect(traced).toEqual(parse(world, 'opne the manual'))
    expect(trace.map(s => s.stage)).toEqual(['normalize', 'typos', 'verb', 'fillers', 'resolve', 'result'])
    expect(trace[1].fixes).toEqual([{ from: 'opne', to: 'open', distance: 1 }])
  })
})

describe('turn routing', () => {
  it('skips the interpreter when none is configured', async () => {
    const world = loadWorld(wayfarer)
    const result = await takeTurn(world, 'grab the shiny book thing please')
    expect(result.route).toBe('unresolved')
    expect(result.interpreter.status).toBe('skipped')
  })

  it('hands unparseable lines to the interpreter and applies its action', async () => {
    const world = loadWorld(wayfarer)
    const interp = new ScriptedInterpreter('script', {
      'pick up that book please': { kind: 'action', action: { type: 'take', item: 'emergency_manual' } },
    })
    const result = await takeTurn(world, 'pick up that book please', { interpreter: interp })
    expect(result.route).toBe('interpreter')
    expect(result.events[0].type).toBe('item_taken')
  })

  it('rejects an interpreter answer naming something out of sight', async () => {
    const world = loadWorld(wayfarer)
    const interp = new ScriptedInterpreter('liar', {
      'get the lever': { kind: 'action', action: { type: 'take', item: 'launch_lever' } },
    })
    const result = await takeTurn(world, 'get the lever', { interpreter: interp })
    expect(result.interpreter.status).toBe('rejected')
    expect(result.events).toEqual([])
  })

  it('builds a schema whose ids are only what is in view', () => {
    const world = loadWorld(wayfarer)
    const schema = actionSchema(buildContext(world))
    const take = schema.anyOf.find(v => v.properties.type.enum[0] === 'take')
    expect(take.properties.item.enum).not.toContain('launch_lever')
    // Nothing is carried at the start, so there is nothing to drop.
    expect(schema.anyOf.some(v => v.properties.type.enum[0] === 'drop')).toBe(false)
  })
})

describe('pronouns', () => {
  it('agrees verbs with the chosen set', () => {
    expect(applyPronouns('{They} {are} here.', 'she')).toBe('She is here.')
    expect(applyPronouns('{They} {are} here.', 'they')).toBe('They are here.')
    expect(applyPronouns('{thier} pack', 'he')).toBe('{thier} pack')
  })
})

describe('sentences that start with "I"', () => {
  it('are not mistaken for the inventory command', () => {
    const world = loadWorld(wayfarer)
    expect(parse(world, 'i').type).toBe('inventory')
    expect(parse(world, 'inventory').type).toBe('inventory')
    expect(parse(world, 'I want to check out the console').kind).toBe('unknown_verb')
  })
})

describe('re-reading the interpreter\'s paraphrase', () => {
  const answer = (action, rephrased) => new ScriptedInterpreter('para', {
    'i want to check out the console thing': { kind: 'action', action, rephrased },
  })

  it('prefers what the parser makes of the paraphrase over the model\'s action', async () => {
    const world = loadWorld(wayfarer)
    await takeTurn(world, 'e')
    const result = await takeTurn(world, 'I want to check out the console thing', {
      interpreter: answer({ type: 'listen' }, 'look at the status console'),
    })
    expect(result.action).toEqual({ type: 'examine', target: 'status_console' })
    expect(result.interpreter.via).toBe('reread')
  })

  it('asks when the paraphrase names something absent', async () => {
    const world = loadWorld(wayfarer)
    const result = await takeTurn(world, 'I want to check out the console thing', {
      interpreter: answer({ type: 'take', item: 'emergency_manual' }, 'grab a crowbar'),
    })
    expect(result.events).toEqual([])
    expect(result.text).toBe("I don't see any 'crowbar' here.")
  })

  it('falls back to the model\'s action when the paraphrase uses unknown words', async () => {
    const world = loadWorld(wayfarer)
    const result = await takeTurn(world, 'I want to check out the console thing', {
      interpreter: answer({ type: 'examine', target: 'emergency_manual' }, 'peruse the tome'),
    })
    expect(result.action).toEqual({ type: 'examine', target: 'emergency_manual' })
  })
})
