// Acceptance tests for the AI dial: Off really turns the interpreter off, and
// Fill gaps lets a model write a description for something the author mentioned
// in a room's prose but never built — labeled as AI-written, steered by the
// student's tone and theme, and never changing the world.

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from './spaceLesson.js'
import { loadWorld } from '../../src/engine/loader.js'
import { takeTurn } from '../../src/engine/turn.js'
import { ScriptedInterpreter } from '../../src/engine/interpreter.js'
import { findGap } from '../../src/engine/gaps.js'
import { createGame } from '../../src/game.js'
import { buildStages } from '../../src/stages.js'
import { cleanDescription, describePrompt } from '../../src/llm/prompts.js'
import LessonController from '../../src/lesson/LessonController.js'

const MUG = 'The mug says WORLD’S OKAYEST PILOT. The coffee froze long ago.'

/** An interpreter that records every call, so tests can see what it was asked. */
function fake({ text = MUG, describes = true } = {}) {
  const calls = { interpret: [], describe: [] }
  const interpreter = {
    name: 'fake',
    calls,
    async interpret(utterance, context) {
      calls.interpret.push(utterance)
      if (utterance === 'what is that mug like') {
        return { kind: 'action', action: { type: 'look' }, rephrased: 'examine the mug' }
      }
      return { kind: 'action', action: { type: 'take', item: 'prybar' } }
    },
  }
  if (describes) {
    interpreter.describe = async request => {
      calls.describe.push(request)
      return { kind: 'text', text, meta: { model: 'fake' } }
    }
  }
  return interpreter
}

const fresh = () => loadWorld(space)

describe('findGap', () => {
  const gapFor = async line => {
    const world = fresh()
    const turn = await takeTurn(world, line)
    return findGap(world, turn.parseError, turn.parseTrace)
  }

  it('finds something examined that the room mentions but the author never built', async () => {
    expect(await gapFor('examine mug')).toMatchObject({ noun: 'mug' })
    expect(await gapFor('look at the coffee mug')).toMatchObject({ noun: 'coffee mug' })
    expect(await gapFor('x stars')).toMatchObject({ noun: 'stars' })
  })

  it('finds nothing for words the room never mentions, or verbs other than examining', async () => {
    expect(await gapFor('examine dragon')).toBeNull()
    expect(await gapFor('take mug')).toBeNull()
    expect(await gapFor('dance')).toBeNull()
    expect(await gapFor('examine prybar')).toBeNull()      // built, so not a gap
  })
})

describe('takeTurn with aiMode', () => {
  it('Off never consults the interpreter', async () => {
    const interpreter = fake()
    const turn = await takeTurn(fresh(), 'grab the metal bar', { interpreter, aiMode: 'off' })
    expect(interpreter.calls.interpret).toEqual([])
    expect(turn.route).toBe('unresolved')
    expect(turn.action).toBeNull()
  })

  it('Understand consults the interpreter but never fills a gap', async () => {
    const interpreter = fake()
    const turn = await takeTurn(fresh(), 'examine mug', { interpreter, aiMode: 'understand' })
    expect(interpreter.calls.describe).toEqual([])
    expect(turn.route).not.toBe('filled')
    expect(turn.text).toMatch(/mug/)
  })

  it('Fill gaps writes a labeled description, steered by tone and theme, and changes nothing', async () => {
    const interpreter = fake()
    const world = fresh()
    const before = JSON.stringify(world)
    const style = { tone: 'eerie', theme: 'loneliness' }
    const turn = await takeTurn(world, 'examine the mug', { interpreter, aiMode: 'fill_gaps', style })

    expect(turn.route).toBe('filled')
    expect(turn.aiWritten).toBe(true)
    expect(turn.text).toBe(MUG)
    expect(turn.filled).toMatchObject({ noun: 'mug', text: MUG, name: 'fake' })
    expect(turn.action).toBeNull()
    expect(turn.events).toEqual([])
    expect(JSON.stringify(world)).toBe(before)

    const [request] = interpreter.calls.describe
    expect(request.noun).toBe('mug')
    expect(request.style).toEqual(style)
    expect(request.context.roomDescription).toMatch(/coffee mug/)
  })

  it('Improvise fills gaps too, until it is built', async () => {
    const turn = await takeTurn(fresh(), 'examine mug', { interpreter: fake(), aiMode: 'improvise' })
    expect(turn.route).toBe('filled')
  })

  it('fills a gap the interpreter’s rephrasing points at', async () => {
    const interpreter = fake()
    const turn = await takeTurn(fresh(), 'what is that mug like', { interpreter, aiMode: 'fill_gaps' })
    expect(interpreter.calls.interpret).toEqual(['what is that mug like'])
    expect(turn.route).toBe('filled')
    expect(turn.text).toBe(MUG)
  })

  it('leaves real gaps alone when nothing is mentioned, and built things to the engine', async () => {
    const interpreter = fake()
    const dragon = await takeTurn(fresh(), 'examine dragon', { interpreter, aiMode: 'fill_gaps' })
    expect(dragon.route).not.toBe('filled')
    const console_ = await takeTurn(fresh(), 'examine console', { interpreter, aiMode: 'fill_gaps' })
    expect(console_.route).toBe('parser')
    expect(interpreter.calls.describe).toEqual([])
  })

  it('falls back to the usual reply when the interpreter cannot describe', async () => {
    const plain = await takeTurn(fresh(), 'examine mug', { interpreter: fake({ describes: false }), aiMode: 'fill_gaps' })
    expect(plain.route).not.toBe('filled')
    expect(plain.text).toMatch(/mug/)
    const none = await takeTurn(fresh(), 'examine mug', { interpreter: null, aiMode: 'fill_gaps' })
    expect(none.route).toBe('unresolved')
    const blank = await takeTurn(fresh(), 'examine mug', { interpreter: fake({ text: '   ' }), aiMode: 'fill_gaps' })
    expect(blank.route).not.toBe('filled')
  })

  it('remembers what it wrote, so the same detail reads the same way twice', async () => {
    const interpreter = fake()
    const gapCache = new Map()
    const world = fresh()
    const first = await takeTurn(world, 'examine mug', { interpreter, aiMode: 'fill_gaps', gapCache })
    const again = await takeTurn(world, 'look at the mug', { interpreter, aiMode: 'fill_gaps', gapCache })
    expect(again.text).toBe(first.text)
    expect(interpreter.calls.describe).toHaveLength(1)
  })

  it('defaults to Understand', async () => {
    const interpreter = fake()
    await takeTurn(fresh(), 'grab the metal bar', { interpreter })
    expect(interpreter.calls.interpret).toHaveLength(1)
  })
})

describe('ScriptedInterpreter descriptions', () => {
  it('describes from an optional table, keyed by noun', async () => {
    const scripted = new ScriptedInterpreter('scripted', {}, { mug: MUG })
    expect(await scripted.describe({ noun: 'mug' })).toMatchObject({ kind: 'text', text: MUG })
    expect((await scripted.describe({ noun: 'stars' })).kind).toBe('unavailable')
    expect((await new ScriptedInterpreter('s', {}).describe({ noun: 'mug' })).kind).toBe('unavailable')
  })
})

describe('the game session', () => {
  const game = (interpreter = fake()) => {
    const g = createGame({ worldData: space, interpreter, worldKey: null })
    g.state.pace = 0
    return g
  }

  it('starts in Understand, with no tone or theme', () => {
    const g = game()
    expect(g.state.aiMode).toBe('understand')
    expect(g.state.style).toEqual({ tone: null, theme: null })
  })

  it('prints AI-written text as its own kind of line', async () => {
    const g = game()
    g.state.aiMode = 'fill_gaps'
    g.state.style = { tone: 'cozy', theme: 'home' }
    await g.submit('examine mug')
    const last = g.state.log.at(-1)
    expect(last.kind).toBe('ai')
    expect(last.text).toBe(MUG)
    expect(g.world.value.turn_count).toBe(0)
  })

  it('obeys Off', async () => {
    const interpreter = fake()
    const g = game(interpreter)
    g.state.aiMode = 'off'
    await g.submit('grab the metal bar')
    expect(interpreter.calls.interpret).toEqual([])
  })

  it('forgets what the AI wrote when the story restarts', async () => {
    const interpreter = fake()
    const g = game(interpreter)
    g.state.aiMode = 'fill_gaps'
    await g.submit('examine mug')
    await g.submit('examine mug')
    expect(interpreter.calls.describe).toHaveLength(1)
    g.restart()
    await g.submit('examine mug')
    expect(interpreter.calls.describe).toHaveLength(2)
  })

  it('shows the filled gap as a stage in the parser panel', async () => {
    const g = game()
    g.state.aiMode = 'fill_gaps'
    const turn = await g.submit('examine mug')
    const stage = buildStages(turn).find(s => s.kind === 'filled')
    expect(stage).toBeTruthy()
    expect(stage.filled.text).toBe(MUG)
  })
})

describe('the describe prompt', () => {
  const context = {
    roomName: 'Cockpit',
    roomDescription: 'A dark navigation console waits beside a forgotten coffee mug.',
    exits: ['south'], visible: [], inventory: [],
  }

  it('carries the noun, the room, the tone and the theme', () => {
    const messages = describePrompt({ noun: 'mug', context, style: { tone: 'eerie', theme: 'loneliness' } })
    const all = messages.map(m => m.content).join('\n')
    expect(messages[0].role).toBe('system')
    expect(all).toMatch(/mug/)
    expect(all).toMatch(/forgotten coffee mug/)
    expect(all).toMatch(/eerie/i)
    expect(all).toMatch(/loneliness/)
  })

  it('works without a tone or theme', () => {
    const messages = describePrompt({ noun: 'mug', context, style: { tone: null, theme: null } })
    expect(messages.map(m => m.content).join('\n')).not.toMatch(/null|undefined/)
  })

  it('cleans a reply down to at most two short sentences', () => {
    expect(cleanDescription('"The mug is cold."')).toBe('The mug is cold.')
    expect(cleanDescription('One. Two! Three? Four.')).toBe('One. Two!')
    expect(cleanDescription('   ')).toBe('')
    expect(cleanDescription('x'.repeat(600)).length).toBeLessThanOrEqual(280)
  })
})

describe('the lesson', () => {
  const controller = () => new LessonController({ unit, levelProperties, starters: { space }, store: null })

  it('starts a dial level at its default and applies the dial to the game at once', () => {
    const c = controller()
    c.goTo(1, 4)
    expect(c.dial.setting).toBe('understand')
    expect(c.game.state.aiMode).toBe('understand')
    c.setDial({ setting: 'off' })
    expect(c.game.state.aiMode).toBe('off')
    c.setDial({ setting: 'fill_gaps', tone: 'eerie', theme: 'loneliness' })
    expect(c.game.state.aiMode).toBe('fill_gaps')
    expect(c.game.state.style).toEqual({ tone: 'eerie', theme: 'loneliness' })
    expect(c.dial).toEqual({ setting: 'fill_gaps', tone: 'eerie', theme: 'loneliness' })
  })

  it('refuses a locked setting', () => {
    const c = controller()
    c.goTo(1, 4)
    expect(() => c.setDial({ setting: 'invent' })).toThrow(/locked/i)
    expect(c.game.state.aiMode).toBe('understand')
  })

  it('keeps the student’s dial when they come back to the dial level, and uses Understand elsewhere', () => {
    const c = controller()
    c.goTo(1, 4)
    c.setDial({ setting: 'fill_gaps', tone: 'funny', theme: 'home' })
    c.goTo(1, 3)
    expect(c.game.state.aiMode).toBe('understand')
    c.goTo(1, 4)
    expect(c.game.state.aiMode).toBe('fill_gaps')
    expect(c.game.state.style).toEqual({ tone: 'funny', theme: 'home' })
  })

  it('records a filled gap for the validator', async () => {
    const c = controller()
    c.goTo(1, 4)
    c.setInterpreter(fake())
    c.setDial({ setting: 'fill_gaps' })
    c.game.state.pace = 0
    await c.game.submit('examine mug')
    c.validator.checkConditions()
    expect(c.validator.conditionsMet([{ name: 'ai_filled_gap' }])).toBe(true)
    expect(c.validator.conditionsMet([{ name: 'ai_filled_gap', value: 'mug' }])).toBe(true)
  })

  it('the dial level walks the student through Off, Understand and Fill gaps on the mug', () => {
    const level = levelProperties['9007']
    const text = [level.longInstructions, ...(level.levelData.steps ?? []).map(s => s.text)].join(' ')
    expect(text).toMatch(/mug/i)
    expect(text).toMatch(/\boff\b/i)
    expect(text).toMatch(/fill gaps/i)
    expect(text).toMatch(/AI wrote this/i)
    const conditions = (level.levelData.steps ?? []).flatMap(s => s.conditions ?? [])
    expect(conditions).toContainEqual({ name: 'ai_filled_gap' })
    expect(level.validations.flatMap(v => v.conditions)).toEqual([{ name: 'ai_dial_set' }])
  })
})
