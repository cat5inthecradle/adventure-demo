// Acceptance tests for Improvise: when a player talks to or asks a character about
// something the author never wrote, the AI writes a short reply in that character's
// voice — labeled as AI-written, steered by tone and theme, and never changing the
// world. Authored dialogue still wins whenever the player just talks to someone.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from './spaceLesson.js'
import { loadWorld } from '../../src/engine/loader.js'
import { takeTurn } from '../../src/engine/turn.js'
import { ScriptedInterpreter } from '../../src/engine/interpreter.js'
import { findTopic } from '../../src/engine/gaps.js'
import { createGame } from '../../src/game.js'
import { buildStages } from '../../src/stages.js'
import { cleanReply, speakPrompt } from '../../src/llm/prompts.js'
import LessonController from '../../src/lesson/LessonController.js'

const REPLY = 'Time is a luxury on a drifting ship. Ask me again once the engines hum.'

/** An interpreter that records every call, so tests can see what it was asked. */
function fake({ text = REPLY, speaks = true } = {}) {
  const calls = { interpret: [], describe: [], speak: [] }
  const interpreter = {
    name: 'fake',
    calls,
    async interpret(utterance) {
      calls.interpret.push(utterance)
      return { kind: 'clarify', question: 'What do you want to ask the droid?' }
    },
    async describe(request) {
      calls.describe.push(request)
      return { kind: 'text', text: 'A described thing.' }
    },
  }
  if (speaks) {
    interpreter.speak = async request => {
      calls.speak.push(request)
      return { kind: 'text', text, meta: { model: 'fake' } }
    }
  }
  return interpreter
}

/** The space world, with the player already beside the droid. */
const inCargoBay = () => {
  const world = loadWorld(space)
  world.player_location = 'cargo_bay'
  return world
}

describe('findTopic', () => {
  const topicFor = async (line, world = inCargoBay()) => {
    const turn = await takeTurn(world, line, { aiMode: 'off' })
    return findTopic(world, turn.parseError, turn.parseTrace)
  }

  it('finds a character the player addressed, and what they asked about', async () => {
    expect(await topicFor('ask the droid for the time')).toMatchObject({ npc: 'maintenance_droid', topic: expect.stringMatching(/time/) })
    expect(await topicFor('talk to the droid about ship')).toMatchObject({ npc: 'maintenance_droid', topic: expect.stringMatching(/ship/) })
    expect(await topicFor('speak to the robot about home')).toMatchObject({ npc: 'maintenance_droid', topic: expect.stringMatching(/home/) })
    expect(await topicFor('ask the maintenance droid what it is doing')).toMatchObject({ npc: 'maintenance_droid' })
  })

  it('takes “tell” as a way of talking', async () => {
    expect(await topicFor('tell the droid hello')).toMatchObject({ npc: 'maintenance_droid', topic: expect.stringMatching(/hello/) })
  })

  it('assumes the only character here when the player just asks about something', async () => {
    expect(await topicFor('ask about the ship')).toMatchObject({ npc: 'maintenance_droid', topic: expect.stringMatching(/ship/) })
  })

  it('finds nothing for objects, absent characters, plain talk, or other verbs', async () => {
    expect(await topicFor('ask the crate about ship')).toBeNull()
    expect(await topicFor('ask the droid about ship', loadWorld(space))).toBeNull()   // droid is in another room
    expect(await topicFor('ask about the ship', loadWorld(space))).toBeNull()         // nobody here
    expect(await topicFor('examine droid about ship')).toBeNull()
    expect(await topicFor('dance with the droid')).toBeNull()
  })
})

describe('takeTurn with Improvise', () => {
  it('writes a labeled reply in the character’s voice, steered by tone and theme, and changes nothing', async () => {
    const interpreter = fake()
    const world = inCargoBay()
    const before = JSON.stringify(world)
    const style = { tone: 'funny', theme: 'home' }
    const turn = await takeTurn(world, 'ask the droid for the time', { interpreter, aiMode: 'improvise', style })

    expect(turn.route).toBe('improvised')
    expect(turn.aiWritten).toBe(true)
    expect(turn.text).toContain(REPLY)
    expect(turn.text).toMatch(/droid/i)
    expect(turn.improvised).toMatchObject({ npc: 'maintenance_droid', character: 'maintenance droid', text: REPLY, name: 'fake' })
    expect(turn.text).toMatch(/^The maintenance droid says/)
    expect(turn.action).toBeNull()
    expect(turn.events).toEqual([])
    expect(JSON.stringify(world)).toBe(before)
    expect(interpreter.calls.interpret).toEqual([])

    const [request] = interpreter.calls.speak
    expect(request.npc).toMatchObject({ id: 'maintenance_droid', name: 'maintenance droid' })
    expect(request.npc.description).toMatch(/repair droid/)
    expect(request.npc.lines.join(' ')).toMatch(/prybar/)    // what the author already wrote for them
    expect(request.topic).toMatch(/time/)
    expect(request.line).toBe('ask the droid for the time')
    expect(request.style).toEqual(style)
    expect(request.context.roomName).toBe('Cargo Bay')
  })

  it('speaks the reply in the character’s voice', async () => {
    const turn = await takeTurn(inCargoBay(), 'talk to the droid about ship', { interpreter: fake(), aiMode: 'improvise' })
    const npcParts = turn.speechParts.filter(p => p.voice === 'npc')
    expect(npcParts.map(p => p.text).join(' ')).toContain('Time is a luxury')
    expect(npcParts[0].speaker).toBe('maintenance droid')
  })

  it('leaves plain talk to the author’s dialogue', async () => {
    const interpreter = fake()
    const turn = await takeTurn(inCargoBay(), 'talk to the droid', { interpreter, aiMode: 'improvise' })
    expect(turn.route).toBe('parser')
    expect(turn.text).toMatch(/prybar/)
    expect(interpreter.calls.speak).toEqual([])
  })

  it('only improvises in Improvise', async () => {
    for (const aiMode of ['off', 'understand', 'fill_gaps']) {
      const interpreter = fake()
      const turn = await takeTurn(inCargoBay(), 'ask the droid for the time', { interpreter, aiMode })
      expect(interpreter.calls.speak).toEqual([])
      expect(turn.route).not.toBe('improvised')
    }
  })

  it('still fills gaps in rooms', async () => {
    const turn = await takeTurn(loadWorld(space), 'examine mug', { interpreter: fake(), aiMode: 'improvise' })
    expect(turn.route).toBe('filled')
  })

  it('falls back to the usual reply when the interpreter cannot speak', async () => {
    const plain = await takeTurn(inCargoBay(), 'ask the droid for the time', { interpreter: fake({ speaks: false }), aiMode: 'improvise' })
    expect(plain.route).not.toBe('improvised')
    expect(plain.text).toBeTruthy()
    const none = await takeTurn(inCargoBay(), 'ask the droid for the time', { interpreter: null, aiMode: 'improvise' })
    expect(none.route).toBe('unresolved')
    const blank = await takeTurn(inCargoBay(), 'ask the droid for the time', { interpreter: fake({ text: '  ' }), aiMode: 'improvise' })
    expect(blank.route).not.toBe('improvised')
  })

  it('answers the same question the same way twice', async () => {
    const interpreter = fake()
    const gapCache = new Map()
    const world = inCargoBay()
    const first = await takeTurn(world, 'ask the droid about the ship', { interpreter, aiMode: 'improvise', gapCache })
    const again = await takeTurn(world, 'talk to the robot about ship', { interpreter, aiMode: 'improvise', gapCache })
    expect(again.text).toBe(first.text)
    expect(interpreter.calls.speak).toHaveLength(1)
  })
})

describe('ScriptedInterpreter replies', () => {
  it('replies from an optional table, keyed by topic', async () => {
    const scripted = new ScriptedInterpreter('scripted', {}, {}, { time: REPLY })
    expect(await scripted.speak({ topic: 'time' })).toMatchObject({ kind: 'text', text: REPLY })
    expect((await scripted.speak({ topic: 'ship' })).kind).toBe('unavailable')
    expect((await new ScriptedInterpreter('s', {}).speak({ topic: 'time' })).kind).toBe('unavailable')
  })
})

describe('the game session', () => {
  const game = async (interpreter = fake()) => {
    const g = createGame({ worldData: space, interpreter, worldKey: null })
    g.state.pace = 0
    await g.submit('south')
    return g
  }

  it('prints the reply as an AI-written line and takes no turn', async () => {
    const g = await game()
    g.state.aiMode = 'improvise'
    const turns = g.world.value.turn_count
    await g.submit('ask the droid for the time')
    const last = g.state.log.at(-1)
    expect(last.kind).toBe('ai')
    expect(last.text).toContain(REPLY)
    expect(g.world.value.turn_count).toBe(turns)
  })

  it('forgets its replies when the story restarts', async () => {
    const interpreter = fake()
    const g = await game(interpreter)
    g.state.aiMode = 'improvise'
    await g.submit('ask the droid for the time')
    await g.submit('ask the droid for the time')
    expect(interpreter.calls.speak).toHaveLength(1)
    g.restart()
    await g.submit('south')
    await g.submit('ask the droid for the time')
    expect(interpreter.calls.speak).toHaveLength(2)
  })

  it('shows the improvised reply as a stage in the parser panel', async () => {
    const g = await game()
    g.state.aiMode = 'improvise'
    const turn = await g.submit('ask the droid for the time')
    const stage = buildStages(turn).find(s => s.kind === 'improvised')
    expect(stage).toBeTruthy()
    expect(stage.improvised.text).toBe(REPLY)
  })
})

describe('the speak prompt', () => {
  const npc = {
    id: 'maintenance_droid',
    name: 'maintenance droid',
    description: 'A dented repair droid with one patient green eye.',
    lines: ["'That crate needs leverage,' the droid says."],
  }
  const context = { roomName: 'Cargo Bay', roomDescription: 'Loose straps sway.', exits: ['north'], visible: [], inventory: [] }

  it('carries the character, what they already say, the question, the tone and the theme', () => {
    const messages = speakPrompt({ npc, topic: 'time', line: 'ask the droid for the time', context, style: { tone: 'eerie', theme: 'loneliness' } })
    const all = messages.at(-1).content
    expect(messages[0].role).toBe('system')
    expect(messages.at(-1).role).toBe('user')
    expect(all).toMatch(/maintenance droid/)
    expect(all).toMatch(/patient green eye/)
    expect(all).toMatch(/crate needs leverage/)
    expect(all).toMatch(/ask the droid for the time/)
    expect(all).toMatch(/eerie/i)
    expect(all).toMatch(/loneliness/)
  })

  it('shows the model worked examples of bare speech, with no narration around it', () => {
    const messages = speakPrompt({ npc, topic: 'time', line: 'ask the droid for the time', context, style: {} })
    const replies = messages.filter(m => m.role === 'assistant').map(m => m.content)
    expect(replies.length).toBeGreaterThanOrEqual(2)
    for (const reply of replies) {
      expect(reply).not.toMatch(/["“”]/)
      expect(reply).not.toMatch(/\bsays\b|\bsighs\b|\bnods\b/)
    }
  })

  it('works without a tone or theme', () => {
    const messages = speakPrompt({ npc, topic: 'time', line: 'ask the droid for the time', context, style: { tone: null, theme: null } })
    expect(messages.map(m => m.content).join('\n')).not.toMatch(/null|undefined/)
  })

  it('cleans a reply down to the words spoken, at most two short sentences', () => {
    expect(cleanReply('"Beep. The engines are cold."')).toBe('Beep. The engines are cold.')
    expect(cleanReply('Maintenance droid: Beep.')).toBe('Beep.')
    expect(cleanReply('The droid looks at me, "This ship is old," it says. "It needs work."')).toBe('This ship is old. It needs work.')
    expect(cleanReply('The droid responds, "I\'m not programmed for timekeeping. "')).toBe("I'm not programmed for timekeeping.")
    expect(cleanReply("'Beep.'")).toBe('Beep.')
    expect(cleanReply('The engines went quiet at noon: nobody came.')).toBe('The engines went quiet at noon: nobody came.')
    expect(cleanReply('One. Two! Three? Four.')).toBe('One. Two!')
    expect(cleanReply('   ')).toBe('')
    expect(cleanReply('x'.repeat(600)).length).toBeLessThanOrEqual(240)
  })
})

describe('the lesson', () => {
  const controller = () => new LessonController({ unit, levelProperties, starters: { space }, store: null })

  it('records an improvised reply for the validator', async () => {
    const c = controller()
    c.goTo(1, 4)
    c.setInterpreter(fake())
    c.setDial({ setting: 'improvise' })
    c.game.state.pace = 0
    await c.game.submit('south')
    await c.game.submit('ask the droid for the time')
    c.validator.checkConditions()
    expect(c.validator.conditionsMet([{ name: 'ai_improvised' }])).toBe(true)
    expect(c.validator.conditionsMet([{ name: 'ai_improvised', value: 'maintenance_droid' }])).toBe(true)
  })

  it('the dial level has the student try Improvise on the droid', () => {
    const level = levelProperties['9007']
    const steps = level.levelData.steps
    const step = steps.find(s => (s.conditions ?? []).some(c => c.name === 'ai_experiment_reviewed' && c.value === 'dialogue'))
    expect(step).toBeTruthy()
    expect(step.text).toMatch(/improvise/i)
    expect(step.text).toMatch(/droid/i)
    expect(steps.at(-1).text).toMatch(/save/i)                 // choosing a setting stays last
    expect(level.validations.flatMap(v => v.conditions)).toEqual([{ name: 'ai_dial_set' }, { name: 'ai_experiments_reviewed' }])
  })

  it('no longer says Improvise is not built', () => {
    const dial = readFileSync(new URL('../../src/components/AiDial.vue', import.meta.url), 'utf8')
    expect(dial).not.toMatch(/not built yet/i)
  })
})

describe('copying from the terminal', () => {
  it('copies each line once, leaving out the screen-reader copy', () => {
    const pane = readFileSync(new URL('../../src/components/TerminalPane.vue', import.meta.url), 'utf8')
    expect(pane).toMatch(/@copy/)
    expect(pane).toMatch(/visually-hidden/)
  })
})
