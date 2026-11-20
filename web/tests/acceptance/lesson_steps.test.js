// Acceptance tests for level steps (a checklist that ticks itself as the
// validator sees each step done) and for panels a level reveals only once the
// student clicks a command.

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from './spaceLesson.js'
import LessonController from '../../src/lesson/LessonController.js'
import { parseLevelProperties } from '../../src/adventure/levelKind.js'

const controller = () => new LessonController({ unit, levelProperties, starters: { space }, store: null })
const props = id => levelProperties[id]

async function play(c, lines) {
  c.game.state.pace = 0
  for (const line of lines) await c.game.submit(line)
}

/** An interpreter that understands nothing but will write when it is asked to. */
const fake = () => ({
  name: 'fake',
  async interpret() { return { kind: 'clarify', question: 'What do you mean?' } },
  async describe() { return { kind: 'text', text: 'A chipped mug, long gone cold.' } },
  async speak() { return { kind: 'text', text: 'The ship has been quiet a long time.' } },
})

describe('level data for steps and revealed panels', () => {
  const base = {
    id: 1, name: 'x', appName: 'adventure', type: 'Adventure', displayName: 'X',
    levelData: { startWorld: 'space', view: 'play' },
  }

  it('defaults to no steps and panels that are always shown', () => {
    const parsed = parseLevelProperties(base)
    expect(parsed.levelData.steps).toEqual([])
    expect(parsed.levelData.revealPanels).toBe('always')
  })

  it('accepts steps, with or without conditions, and on-select panels', () => {
    const steps = [
      { text: 'Open the Build tab.' },
      { text: 'Write a refusal.', conditions: [{ name: 'item_has_open_refusal', value: 'supply_crate' }] },
    ]
    const parsed = parseLevelProperties({ ...base, levelData: { ...base.levelData, steps, revealPanels: 'on_select' } })
    expect(parsed.levelData.steps).toEqual([steps[0], steps[1]].map(s => ({ conditions: [], ...s })))
    expect(parsed.levelData.revealPanels).toBe('on_select')
    expect(() => parseLevelProperties({ ...base, levelData: { ...base.levelData, revealPanels: 'sometimes' } })).toThrow(/revealPanels/)
  })
})

describe('LessonController.steps()', () => {
  it('lists a level’s steps, ticking each one the validator sees done', async () => {
    const c = controller()
    c.goTo(1, 4)
    const steps = c.steps()
    expect(steps.length).toBeGreaterThanOrEqual(4)
    for (const step of steps) {
      expect(typeof step.text).toBe('string')
      expect(typeof step.checkable).toBe('boolean')
      expect(step.done).toBe(false)
    }

    c.setInterpreter(fake())
    c.setDial({ setting: 'fill_gaps' })
    await play(c, ['examine mug'])
    expect(c.steps().some(s => s.done)).toBe(false)
    c.saveExperiment('scenery', 'live', 'Words appeared without an object')
    const afterGap = c.steps()
    expect(afterGap.some(s => s.done)).toBe(true)
    expect(afterGap.some(s => s.checkable && !s.done)).toBe(true)

    c.setDial({ setting: 'improvise' })
    await play(c, ['south', 'ask the droid about the ship'])
    c.saveExperiment('dialogue', 'live', 'The generated dialogue left rules unchanged')
    c.saveExperiment('compare', 'recorded', 'Neither request took the prybar')
    expect(c.steps().at(-1).done).toBe(false)               // the last step is saving a setting
    c.saveDialChoice('It may describe things, not change them.')
    expect(c.steps().filter(s => s.checkable).every(s => s.done)).toBe(true)
  })

  it('never ticks a step that has no conditions', () => {
    const c = controller()
    c.goTo(1, 4)
    for (const step of c.steps().filter(s => !s.checkable)) expect(step.done).toBe(false)
  })

  it('is empty on a level without steps', () => {
    const c = controller()
    c.goTo(1, 1)
    expect(c.steps()).toEqual([])
  })
})

describe('Hour of AI content for these fixes', () => {
  it('reveals level 2’s panel only once the student clicks a command', () => {
    expect(props('9002').levelData.revealPanels).toBe('on_select')
    expect(props('9002').longInstructions.toLowerCase()).toMatch(/click/)
  })

  it('has no level that sends the student to the block builder', () => {
    for (const level of Object.values(levelProperties)) {
      expect(level.levelData).not.toHaveProperty('build')
      expect(level.levelData.view).toBe('play')
      expect(level.longInstructions).not.toMatch(/Build tab/)
    }
  })

  it('names the form and its buttons in the level that adds a thing', () => {
    const level = props('9003')
    expect(level.levelData.addThing).toEqual({ name: 'coffee mug' })
    expect(level.longInstructions).toMatch(/Add a thing/)
    expect(level.longInstructions).toMatch(/Add it to the world/)
    expect(level.longInstructions).toMatch(/Also called/)
  })
})
