// Acceptance tests for the session log: every change to the AI's rules (model,
// dial, tone, theme) shows in the console as it happens, every turn remembers the
// rules it ran under, and the whole session can be downloaded as one JSON file
// someone else can read to see what went wrong.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import { createGame } from '../../src/game.js'
import { logFilename } from '../../src/sessionLog.js'
import LessonController from '../../src/lesson/LessonController.js'

const RAW = '{"means":"take the prybar","type":"take","item":"prybar"}'

function fake(name = 'fake model') {
  return {
    name,
    async interpret() {
      return {
        kind: 'action',
        action: { type: 'take', item: 'prybar' },
        meta: { model: name, raw: RAW, prompt: 'the prompt' },
      }
    },
  }
}

const game = (interpreter = null) => {
  const g = createGame({ worldData: space, interpreter, worldKey: null })
  g.state.pace = 0
  return g
}
const settingsLines = g => g.state.log.filter(entry => entry.kind === 'settings')

describe('changing the AI rules', () => {
  it('prints one console line naming the model, dial, tone and theme', () => {
    const g = game()
    g.setAi({ interpreter: fake('Qwen test'), aiMode: 'fill_gaps', style: { tone: 'eerie', theme: 'loneliness' } })
    const lines = settingsLines(g)
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toMatch(/Qwen test/)
    expect(lines[0].text).toMatch(/fill gaps/i)
    expect(lines[0].text).toMatch(/eerie/)
    expect(lines[0].text).toMatch(/loneliness/)
    expect(g.state.interpreter.name).toBe('Qwen test')
    expect(g.state.aiMode).toBe('fill_gaps')
    expect(g.state.style).toEqual({ tone: 'eerie', theme: 'loneliness' })
  })

  it('keeps what it is not told to change, and says nothing when nothing changed', () => {
    const g = game()
    const model = fake()
    g.setAi({ interpreter: model })
    g.setAi({ aiMode: 'improvise' })
    expect(g.state.interpreter).toBe(model)
    expect(g.state.aiMode).toBe('improvise')
    expect(settingsLines(g)).toHaveLength(1)
    expect(settingsLines(g)[0].text).toMatch(/fake model.*improvise/i)
    const line = settingsLines(g)[0]
    g.setAi({ interpreter: model, aiMode: 'improvise', style: { tone: null, theme: null } })
    expect(settingsLines(g)).toEqual([line])
  })

  it('keeps one line for back-to-back changes, such as typing a theme letter by letter', () => {
    const g = game()
    for (const theme of ['a', 'a s', 'a spooky ship']) g.setAi({ style: { tone: 'eerie', theme } })
    const lines = settingsLines(g)
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toMatch(/a spooky ship/)
    expect(g.state.log.at(-1)).toBe(lines[0])
  })

  it('starts a new line once something else was printed in between', async () => {
    const g = game()
    g.setAi({ aiMode: 'off' })
    await g.submit('look')
    g.setAi({ aiMode: 'understand' })
    expect(settingsLines(g)).toHaveLength(2)
  })

  it('names the absence of a model and of a tone or theme in words', () => {
    const g = game(fake())
    g.setAi({ interpreter: null, aiMode: 'off' })
    const text = settingsLines(g).at(-1).text
    expect(text).toMatch(/no model/i)
    expect(text).toMatch(/\boff\b/i)
    expect(text).not.toMatch(/null|undefined/)
  })

  it('stamps every console line with the time it was printed', () => {
    const g = game()
    g.setAi({ aiMode: 'off' })
    for (const entry of g.state.log) expect(Number.isNaN(Date.parse(entry.at))).toBe(false)
  })
})

describe('the lesson', () => {
  const controller = () => new LessonController({ unit, levelProperties, starters: { space }, store: null })

  it('shows dial and model changes in the console', () => {
    const c = controller()
    c.goTo(1, 4)
    const before = settingsLines(c.game).length
    c.setDial({ setting: 'fill_gaps', tone: 'funny', theme: 'home' })
    c.setInterpreter(fake('Llama test'))
    const lines = settingsLines(c.game).slice(before)
    expect(lines).toHaveLength(1)                          // back to back, so one line
    expect(lines[0].text).toMatch(/fill gaps/i)
    expect(lines[0].text).toMatch(/funny/)
    expect(lines[0].text).toMatch(/Llama test/)
  })

  it('adds where the student is in the lesson to the downloaded log', () => {
    const c = controller()
    c.goTo(1, 4)
    c.setDial({ setting: 'improvise' })
    const log = c.exportLog()
    expect(log.lesson).toMatchObject({ lesson: 1, level: 4, levelId: 9007 })
    expect(log.lesson.dial).toMatchObject({ setting: 'improvise' })
    expect(log.ai.aiMode).toBe('improvise')
  })
})

describe('the downloaded log', () => {
  it('holds the console and every turn, with the rules it ran under and what the model said', async () => {
    const g = game()
    g.setAi({ interpreter: fake('Qwen test'), aiMode: 'understand', style: { tone: 'eerie', theme: null } })
    await g.submit('grab the metal bar')
    await g.submit('look')

    const log = g.exportLog()
    expect(() => JSON.parse(JSON.stringify(log))).not.toThrow()
    expect(log.format).toBe('adventure-lab-session-log')
    expect(Number.isNaN(Date.parse(log.exportedAt))).toBe(false)
    expect(log.world.title).toBe('Drift')
    expect(log.ai).toEqual({ model: 'Qwen test', aiMode: 'understand', style: { tone: 'eerie', theme: null } })

    expect(log.console.some(entry => entry.kind === 'settings')).toBe(true)
    expect(log.console.some(entry => entry.text === '> grab the metal bar')).toBe(true)

    const [grab, look] = log.turns
    expect(grab.line).toBe('grab the metal bar')
    expect(grab.route).toBe('interpreter')
    expect(grab.ai).toEqual({ model: 'Qwen test', aiMode: 'understand', style: { tone: 'eerie', theme: null } })
    expect(Number.isNaN(Date.parse(grab.at))).toBe(false)
    expect(grab.interpreter.answer.meta.raw).toBe(RAW)
    expect(grab.parseTrace.length).toBeGreaterThan(0)
    expect(grab.text).toMatch(/prybar/)
    expect(log.console.some(entry => entry.kind === 'echo' && entry.text.startsWith('(AI interpreted:'))).toBe(true)
    expect(look.route).toBe('parser')
  })

  it('records the rules each turn actually ran under, even after they change', async () => {
    const g = game(fake())
    g.setAi({ aiMode: 'off' })
    await g.submit('grab the metal bar')
    g.setAi({ aiMode: 'understand' })
    await g.submit('grab the metal bar')
    const [first, second] = g.exportLog().turns
    expect(first.ai.aiMode).toBe('off')
    expect(first.route).toBe('unresolved')
    expect(second.ai.aiMode).toBe('understand')
  })

  it('is named for when it was downloaded', () => {
    expect(logFilename(new Date(2026, 9, 28, 14, 5, 9))).toBe('adventure-log-2026-10-28-140509.json')
  })
})

describe('the download button', () => {
  const source = path => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')

  it('sits in the terminal and is wired up in Play and in the lesson', () => {
    expect(source('components/TerminalPane.vue')).toMatch(/Download log/)
    expect(source('App.vue')).toMatch(/downloadLog/)
    expect(source('components/LessonView.vue')).toMatch(/downloadLog/)
  })

  it('is the only way the model picker and the lesson change the rules', () => {
    expect(source('components/InterpreterPicker.vue')).not.toMatch(/state\.interpreter\s*=/)
    expect(source('lesson/LessonController.js')).not.toMatch(/state\.(interpreter|aiMode|style)\s*=/)
  })
})
