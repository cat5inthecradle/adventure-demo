// Acceptance tests for the lesson's closing step: setting the AI dial for three
// apps outside the game. The view only draws; LessonController keeps the answers.

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import { parseLevelProperties } from '../../src/adventure/levelKind.js'
import LessonController from '../../src/lesson/LessonController.js'

const DIAL = ['off', 'understand', 'fill_gaps', 'improvise', 'invent']
const LAST = unit.lessons[0].levels.length

function memoryStore() {
  const data = new Map()
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) }
}
const controller = (store = null) => new LessonController({ unit, levelProperties, starters: { space }, store })

describe('the real-life level’s content', () => {
  const level = levelProperties['9009']
  const scenarios = level.levelData.realLife.scenarios

  it('is the last level of the lesson', () => {
    expect(unit.lessons[0].levels.at(-1)).toMatchObject({ activeId: '9009', position: LAST })
  })

  it('has three scenarios that say what every dial setting would mean there', () => {
    expect(scenarios.map(s => s.id)).toEqual(['homework', 'clinic', 'story_game'])
    for (const scenario of scenarios) {
      expect(scenario.title.length).toBeGreaterThan(5)
      expect(scenario.blurb.length).toBeGreaterThan(20)
      expect(Object.keys(scenario.options)).toEqual(DIAL)
      for (const text of Object.values(scenario.options)) expect(text.length).toBeGreaterThan(20)
    }
  })

  it('rejects a scenario with a setting the dial does not have', () => {
    const bad = structuredClone(level)
    bad.levelData.realLife.scenarios[0].options.autopilot = 'The AI does everything.'
    expect(() => parseLevelProperties(bad)).toThrow(/realLife/)
  })
})

describe('setting the dial for real life', () => {
  it('passes only once every scenario has a setting and a reason', () => {
    const c = controller()
    c.goTo(1, LAST)
    expect(c.canContinue()).toBe(false)
    c.setRealLife('homework', { setting: 'fill_gaps', reason: 'Hints are low risk.' })
    c.setRealLife('clinic', { setting: 'understand', reason: 'A wrong dose could hurt someone.' })
    c.setRealLife('story_game', { setting: 'invent' })      // nothing is locked here
    expect(c.canContinue()).toBe(false)                     // a setting without a reason is not an answer
    c.setRealLife('story_game', { reason: ' x ' })
    expect(c.canContinue()).toBe(false)                     // nor is a stray letter
    c.setRealLife('story_game', { reason: 'Surprises are the fun part.' })
    expect(c.canContinue()).toBe(true)
    expect(c.state().message).toBeTruthy()
  })

  it('keeps a reason when the setting changes, and a setting when the reason changes', () => {
    const c = controller()
    c.goTo(1, LAST)
    c.setRealLife('clinic', { setting: 'off' })
    c.setRealLife('clinic', { reason: 'People, not guesses.' })
    c.setRealLife('clinic', { setting: 'understand' })
    expect(c.realLife.clinic).toEqual({ setting: 'understand', reason: 'People, not guesses.' })
  })

  it('refuses a scenario or setting the level does not have', () => {
    const c = controller()
    c.goTo(1, LAST)
    expect(() => c.setRealLife('spaceship', { setting: 'off' })).toThrow(/scenario/)
    expect(() => c.setRealLife('clinic', { setting: 'autopilot' })).toThrow(/setting/)
  })

  it('remembers the answers across a reload, and the level is already passed', () => {
    const store = memoryStore()
    const first = controller(store)
    first.goTo(1, LAST)
    for (const id of ['homework', 'clinic', 'story_game']) first.setRealLife(id, { setting: 'understand', reason: 'People check it.' })

    const again = controller(store)
    again.goTo(1, LAST)
    expect(again.realLife.clinic.setting).toBe('understand')
    expect(again.canContinue()).toBe(true)
    again.goTo(1, 1)
    expect(again.canContinue()).toBe(false)                 // the answers pass only their own level
  })

  it('puts the answers in the downloaded log', () => {
    const c = controller()
    c.goTo(1, LAST)
    c.setRealLife('homework', { setting: 'improvise', reason: 'A tutor should talk.' })
    expect(c.exportLog().lesson.realLife).toEqual({ homework: { setting: 'improvise', reason: 'A tutor should talk.' } })
  })
})
