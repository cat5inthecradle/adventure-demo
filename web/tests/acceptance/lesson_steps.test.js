// Acceptance tests for level steps (a checklist that ticks itself as the
// validator sees each step done) and for panels a level reveals only once the
// student clicks a command.

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import LessonController from '../../src/lesson/LessonController.js'
import { parseLevelProperties } from '../../src/adventure/levelKind.js'

const controller = () => new LessonController({ unit, levelProperties, starters: { space }, store: null })
const props = id => levelProperties[id]

async function play(c, lines) {
  c.game.state.pace = 0
  for (const line of lines) await c.game.submit(line)
}

function crateWithHints() {
  const raw = structuredClone(space)
  raw.items.supply_crate.open_refusal = 'The lid will not budge by hand. Something with leverage might do it.'
  raw.items.supply_crate.open_refusal_with = { prybar: 'That prybar would fit right under the lid.' }
  return raw
}

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

    await c.game.applyWorld(crateWithHints(), { restart: true })
    const afterEdit = c.steps()
    expect(afterEdit.some(s => s.done)).toBe(true)
    expect(afterEdit.some(s => s.checkable && !s.done)).toBe(true)

    await play(c, ['go south', 'open crate', 'go north', 'take prybar', 'go south', 'open crate'])
    expect(c.steps().filter(s => s.checkable).every(s => s.done)).toBe(true)
    expect(c.state().satisfied).toBe(true)
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

  it('gives level 4 a checklist that covers the edit and the two tries in Play', () => {
    const steps = props('9004').levelData.steps
    expect(steps.length).toBeGreaterThanOrEqual(4)
    const conditions = steps.flatMap(s => s.conditions ?? [])
    expect(conditions).toEqual(expect.arrayContaining([
      { name: 'item_has_open_refusal', value: 'supply_crate' },
      { name: 'item_has_tool_hint', value: 'supply_crate' },
      { name: 'saw_custom_refusal', value: 'supply_crate' },
      { name: 'saw_tool_hint', value: 'supply_crate' },
    ]))
    const text = steps.map(s => s.text).join(' ').toLowerCase()
    expect(text).toContain('build tab')
    expect(text).toContain('play with my changes')
    expect(text).toContain('prybar')
  })

  it('names the Build tab in every level that builds', () => {
    for (const id of ['9003', '9004', '9005', '9008']) {
      expect(props(id).longInstructions).toMatch(/Build tab/)
    }
  })
})
