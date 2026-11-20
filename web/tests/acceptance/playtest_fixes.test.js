// Acceptance tests for what the first student playtests found (docs/playtests/):
// slow replies, hints that did not work, levels that passed without the task,
// and progress that showed skipped levels as done.

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import haunted from '../../../worlds/starters/haunted.json'
import jungle from '../../../worlds/starters/jungle.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import lessonWorlds from '../../../curriculum/hour-of-ai/worlds.json'
import { HELP_TEXT } from '../../src/game.js'
import { buildStages } from '../../src/stages.js'
import LessonController from '../../src/lesson/LessonController.js'

const starters = { space, haunted, jungle }
function memoryStore() {
  const data = new Map()
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) }
}
const controller = (store = null) => new LessonController({ unit, levelProperties, starters, store })
const WIN = ['take prybar', 'go south', 'use prybar on crate', 'take power cell', 'go north', 'use power cell on console']

describe('replies in the lesson', () => {
  it('come at once when there is no step-by-step panel to watch, and quickly when there is', () => {
    const c = controller()
    c.goTo(1, 1)
    expect(c.game.state.pace).toBe(0)
    c.goTo(1, 2)
    expect(c.game.state.pace).toBeGreaterThan(0)
    expect(c.game.state.pace).toBeLessThanOrEqual(200)
  })
})

describe('the first level’s hint', () => {
  for (const key of Object.keys(starters)) {
    it(`works when followed word for word in the ${key} world`, async () => {
      const c = controller()
      c.setWorld(key)
      c.goTo(1, 1)
      const terms = lessonWorlds.worlds[key].terms
      expect(c.properties.longInstructions).toContain('`help`')
      expect(c.properties.longInstructions).toContain(`Go \`${terms.toSecond}\` and \`talk to ${terms.npc}\``)
      await c.game.submit(terms.toSecond)
      await c.game.submit(`talk to ${terms.npc}`)
      const turn = c.game.state.turns.at(-1)
      expect(turn.action, turn.text).toBeTruthy()             // the character was there to talk to
    })
  }

  it('does not tell students to do something with a word the game does not know', () => {
    const known = HELP_TEXT.toLowerCase()
    for (const { terms } of Object.values(lessonWorlds.worlds)) {
      expect(terms.goalTask).not.toMatch(/\bwind\b|\band power\b|\breturn\b/)
      expect(known).toContain('use x on y')
    }
  })
})

describe('progress', () => {
  it('marks a level passed only when it was passed, and a skipped one as skipped', async () => {
    const c = controller()
    c.goTo(1, 1)
    expect(c.levelStatuses()).toEqual(['here', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead'])
    c.goTo(1, 2)                                              // Next → without winning
    expect(c.levelStatuses().slice(0, 2)).toEqual(['skipped', 'here'])
    c.goTo(1, 1)
    c.game.state.pace = 0
    for (const line of WIN) await c.game.submit(line)
    c.goTo(1, 2)
    expect(c.levelStatuses().slice(0, 2)).toEqual(['passed', 'here'])
  })

  it('remembers passed levels across a reload', async () => {
    const store = memoryStore()
    const first = controller(store)
    first.goTo(1, 1)
    first.game.state.pace = 0
    for (const line of WIN) await first.game.submit(line)
    const again = controller(store)
    again.goTo(1, 3)
    expect(again.levelStatuses().slice(0, 3)).toEqual(['passed', 'skipped', 'here'])
  })
})

describe('the dial level', () => {
  it('does not pass until the student saves a setting with a reason', () => {
    const c = controller()
    c.goTo(1, 4)
    expect(() => c.saveDialChoice('')).toThrow(/reason/i)
    expect(() => c.saveDialChoice('  x ')).toThrow(/reason/i)
    expect(() => c.saveDialChoice('idk')).toThrow(/reason/i)   // round 2: one word is not a reason
    expect(c.canContinue()).toBe(false)
    c.saveDialChoice('It should only translate.')
    expect(c.canContinue()).toBe(false)
    for (const task of c.experimentTasks()) c.saveExperiment(task.id, 'recorded', 'The evidence shows unchanged rules')
    expect(c.canContinue()).toBe(true)
    expect(c.dialSaved).toMatchObject({ setting: 'understand', reason: 'It should only translate.' })
  })

  it('tells the student exactly what to type at each step', () => {
    const steps = levelProperties['9007'].levelData.steps.map(s => s.text)
    expect(steps[3]).toMatch(/Fill gaps/)
    expect(steps[3]).toMatch(/`examine the \{\{detailShort\}\}`/)
    expect(steps.at(-1)).toMatch(/Save my setting/)
  })
})

describe('the AI level', () => {
  it('suggests a request the game truly cannot do, and says what the game does with a guess', () => {
    const text = levelProperties['9006'].longInstructions
    expect(text).toMatch(/AI Interpreter/)                     // where to turn the AI on, as the menu is labelled
    expect(text).toMatch(/fly to the moon/)
    expect(text).not.toMatch(/sandwich/)
    expect(text).toMatch(/throws the guess away and asks you a question/)
  })

  // Round 2: the model often guesses instead of asking, and one student could never pass.
  const scripted = replies => {
    const queue = [...replies]
    return { name: 'scripted', async interpret() { return queue.shift() } }
  }
  const take = { kind: 'action', action: { type: 'take', item: 'prybar' }, rephrased: 'take prybar' }
  const south = { kind: 'action', action: { type: 'go', direction: 'south' }, rephrased: 'go south' }

  const listen = { kind: 'action', action: { type: 'listen' }, rephrased: 'listen' }

  it('turns a guessed move into a question: the player stays put, and the level passes', async () => {
    const c = controller()
    c.goTo(1, 3)
    c.setInterpreter(scripted([take, south]))
    c.game.state.pace = 0
    await c.game.submit('can you grab the prybar for me')
    expect(c.canContinue()).toBe(false)
    const before = c.game.world.value.player_location
    await c.game.submit('order a pizza')                    // the model answers "go south"
    const turn = c.game.state.turns.at(-1)
    expect(c.game.world.value.player_location).toBe(before)
    expect(turn.action ?? null).toBeNull()
    expect(turn.text).toMatch(/What do you want to do\?/)
    expect(turn.interpreter.refused).toEqual({ reason: 'ungrounded', action: { type: 'go', direction: 'south' } })
    expect(c.canContinue()).toBe(false)
    for (const task of c.experimentTasks()) c.saveExperiment(task.id, 'live', 'The reply shows what happened')
    expect(c.canContinue()).toBe(true)
    expect(c.state().message).toMatch(/inspected/)
  })

  it('rejects an unrelated observation and counts the resulting clarification', async () => {
    const c = controller()
    c.goTo(1, 3)
    c.setInterpreter(scripted([take, listen]))
    c.game.state.pace = 0
    await c.game.submit('can you grab the prybar for me')
    await c.game.submit('make me a sandwich')               // the model answers "listen"
    expect(c.game.state.turns.at(-1).action).toBeNull()
    expect(c.game.state.turns.at(-1).interpreter.status).toBe('rejected')
    expect(c.canContinue()).toBe(false)
    for (const task of c.experimentTasks()) c.saveExperiment(task.id, 'live', 'The reply shows what happened')
    expect(c.canContinue()).toBe(true)
    expect(c.state().message).toMatch(/inspected/)
  })

  it('does not pass on a guess alone, or on two ordinary requests', async () => {
    const guessOnly = controller()
    guessOnly.goTo(1, 3)
    guessOnly.setInterpreter(scripted([listen]))
    guessOnly.game.state.pace = 0
    await guessOnly.game.submit('make me a sandwich')
    expect(guessOnly.canContinue()).toBe(false)

    const ordinary = controller()
    ordinary.goTo(1, 3)
    ordinary.setInterpreter(scripted([take, south]))
    ordinary.game.state.pace = 0
    await ordinary.game.submit('can you grab the prybar for me')
    await ordinary.game.submit('could you please go south')
    expect(ordinary.canContinue()).toBe(false)
  })

  it('passes after reviewing evidence when the AI asks a question', async () => {
    const c = controller()
    c.goTo(1, 3)
    c.setInterpreter(scripted([take, { kind: 'clarify', question: 'Where do you want to go?' }]))
    c.game.state.pace = 0
    await c.game.submit('can you grab the prybar for me')
    await c.game.submit('fly to the moon')
    expect(c.canContinue()).toBe(false)
    for (const task of c.experimentTasks()) c.saveExperiment(task.id, 'live', 'The reply shows what happened')
    expect(c.canContinue()).toBe(true)
    expect(c.state().message).toMatch(/inspected/)
  })
})

describe('arriving without a level in the address', () => {
  it('opens the first level for a new student, and where they left off for a returning one', () => {
    const store = memoryStore()
    const c = controller(store)
    expect(c.resumeLevel()).toBe(1)
    c.goTo(1, 4)
    expect(controller(store).resumeLevel()).toBe(4)
  })

  it('ignores a remembered level the lesson does not have', () => {
    const store = memoryStore()
    store.setItem('adventure-lab:lesson-level', '99')
    expect(controller(store).resumeLevel()).toBe(1)
    store.setItem('adventure-lab:lesson-level', 'banana')
    expect(controller(store).resumeLevel()).toBe(1)
    expect(controller(null).resumeLevel()).toBe(1)          // storage blocked
  })
})

describe('coming back to a level', () => {
  it('keeps Continue unlocked on a level that was already passed', async () => {
    const store = memoryStore()
    const c = controller(store)
    c.goTo(1, 1)
    c.game.state.pace = 0
    for (const line of WIN) await c.game.submit(line)
    c.goTo(1, 2)
    c.goTo(1, 1)                                            // a fresh game, but the level stays passed
    expect(c.state().satisfied).toBe(false)
    expect(c.canContinue()).toBe(true)
    const reloaded = controller(store)
    reloaded.goTo(1, 1)
    expect(reloaded.canContinue()).toBe(true)
  })
})

describe('reasons', () => {
  it('need three different words, not three keystrokes', async () => {
    const { isReason } = await import('../../src/lesson/LessonController.js')
    for (const junk of ['', 'idk', 'lol', 'a b c', 'asdf asdf asdf', 'x y zz']) expect(isReason(junk), junk).toBe(false)
    for (const real of ['A wrong dose could hurt someone.', 'Hints are low risk', 'it is safer']) expect(isReason(real), real).toBe(true)
  })
})

describe('the Level 4 comparison sentence', () => {
  it('fails with the AI off and names the tool, so the AI can ground it', async () => {
    const { parse, isParseError } = await import('../../src/engine/parser.js')
    const { loadWorld } = await import('../../src/engine/loader.js')
    const { isGrounded } = await import('../../src/engine/grounding.js')
    for (const [key, raw] of Object.entries(starters)) {
      const terms = lessonWorlds.worlds[key].terms
      const world = loadWorld(raw)
      expect(isParseError(parse(world, terms.understandPhrase)), terms.understandPhrase).toBe(true)
      const tool = Object.values(world.items).find(item => item.name === terms.tool)
      expect(tool, terms.tool).toBeTruthy()
      expect(isGrounded(terms.understandPhrase, { type: 'take', item: tool.id }, world)).toBe(true)
    }
  })
})

describe('the real-life level', () => {
  it('does not count a one-word reason', () => {
    const c = controller()
    c.goTo(1, 6)
    for (const id of ['homework', 'clinic', 'story_game']) c.setRealLife(id, { setting: 'invent', reason: 'lol' })
    expect(c.canContinue()).toBe(false)
    for (const id of ['homework', 'clinic', 'story_game']) c.setRealLife(id, { reason: 'A person should check it.' })
    expect(c.canContinue()).toBe(true)
  })
})

describe('"How it was understood"', () => {
  it('names its steps in plain words', async () => {
    const c = controller()
    c.goTo(1, 2)
    c.game.state.pace = 0
    await c.game.submit('examine the coffee mug')
    const titles = buildStages(c.game.state.turns.at(-1)).map(s => s.title).join(' | ')
    for (const jargon of ['Tokenize', 'Parser', 'Interpreter', 'Engine', 'Render', 'Resolve', 'preposition']) {
      expect(titles).not.toContain(jargon)
    }
    expect(titles).toContain('Split into words')
    expect(titles).toContain('What the game understood')
  })
})

// A failed lookup and an unavailable model are not questions, even though all
// three leave the action empty. Do not award the AI activity for those failures.
describe('truthful interpretation outcomes', () => {
  const replies = [
    ['missing noun in paraphrase', { kind: 'action', action: { type: 'listen' }, rephrased: 'look for a way out' }, 'unresolved'],
    ['model unavailable', { kind: 'unavailable', detail: 'test GPU unavailable' }, 'unavailable'],
    ['statement in question field', { kind: 'clarify', question: 'There is no way out here.' }, 'unresolved'],
  ]
  for (const [label, reply, status] of replies) it(label, async () => {
    const queue = [
      { kind: 'action', action: { type: 'take', item: 'prybar' }, rephrased: 'take prybar' },
      reply,
    ]
    const c = controller()
    c.goTo(1, 3)
    c.setInterpreter({ name: 'scripted', async interpret() { return queue.shift() } })
    c.game.state.pace = 0
    await c.game.submit('can you grab the prybar for me')
    const before = c.game.world.value.turn_count
    await c.game.submit('get me out of here')
    const turn = c.game.state.turns.at(-1)
    expect(turn.interpreter.status).toBe(status)
    expect(turn.clarifying).toBe(false)
    expect(turn.action).toBeNull()
    expect(c.canContinue()).toBe(false)
    expect(c.game.world.value.turn_count).toBe(before)
    expect(turn.text).not.toContain('for way')
    expect(turn.text).not.toContain('me of here')
  })
})
