// Acceptance tests for src/lesson/LessonController.js: the framework-free host
// that runs the Hour of AI unit. It plays the part Code.org's Studio and Lab2
// ProjectContainer play — resolve the level, load its project, feed the
// validator, and say where Continue goes — so the Vue (later React) view on top
// of it only draws.

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import LessonController from '../../src/lesson/LessonController.js'

/** A Storage-like object, so the test can see what the controller keeps. */
function memoryStore() {
  const data = new Map()
  return {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
    data,
  }
}

function controller(store = memoryStore()) {
  return new LessonController({ unit, levelProperties, starters: { space }, store })
}

async function play(c, lines) {
  c.game.state.pace = 0
  for (const line of lines) await c.game.submit(line)
}

const WIN = ['take prybar', 'go south', 'use prybar on crate', 'take power cell', 'go north', 'use power cell on console']

function withMug() {
  const raw = structuredClone(space)
  raw.items.coffee_mug = {
    id: 'coffee_mug', name: 'coffee mug', aliases: ['mug'],
    description: 'Cold coffee, older than the outage.', location: 'cockpit', portable: true,
  }
  return raw
}

describe('LessonController', () => {
  it('resolves a level and starts its world', () => {
    const c = controller()
    const level = c.goTo(1, 1)
    expect(level).toMatchObject({ position: 1, totalLevels: 8, levelId: 9001 })
    expect(c.level).toBe(level)
    expect(c.properties.levelData.view).toBe('play')
    expect(c.game.world.value.title).toBe(space.title)
    expect(c.state()).toMatchObject({ hasConditions: true, satisfied: false })
  })

  it('passes level 1 by winning, and Continue goes to level 2', async () => {
    const c = controller()
    c.goTo(1, 1)
    await play(c, WIN)
    expect(c.state().satisfied).toBe(true)
    expect(c.next()).toEqual({ to: '#learn/hoai-adventure/1/2' })
  })

  it('tells listeners when progress changes', async () => {
    const c = controller()
    let calls = 0
    c.onChange(() => { calls++ })
    c.goTo(1, 1)
    const before = calls
    await play(c, ['look'])
    expect(calls).toBeGreaterThan(before)
  })

  it('records UI events for the validator', () => {
    const c = controller()
    c.goTo(1, 7)
    expect(c.state().satisfied).toBe(false)
    c.recordUiEvent('ai_dial_set', 'fill_gaps')
    expect(c.state().satisfied).toBe(true)
  })

  it('gives partway feedback after an edit, and passes once the edit is played', async () => {
    const c = controller()
    c.goTo(1, 3)
    await c.game.applyWorld(withMug(), { restart: true })
    expect(c.state()).toMatchObject({ satisfied: false })
    expect(c.state().message).toBeTruthy()
    await play(c, ['examine mug'])
    expect(c.state().satisfied).toBe(true)
  })

  it('carries the student’s world from level to level through the project template', async () => {
    const store = memoryStore()
    const first = controller(store)
    first.goTo(1, 3)
    await first.game.applyWorld(withMug(), { restart: true })

    const later = controller(store)
    later.goTo(1, 4)
    expect(Object.keys(later.game.definition.value.items)).toContain('coffee_mug')
    later.goTo(1, 8)
    expect(Object.keys(later.game.definition.value.items)).toContain('coffee_mug')
  })

  it('starts levels without a project template from the starter, every time', async () => {
    const store = memoryStore()
    const c = controller(store)
    c.goTo(1, 3)
    await c.game.applyWorld(withMug(), { restart: true })
    c.goTo(1, 1)
    expect(Object.keys(c.game.definition.value.items)).not.toContain('coffee_mug')
  })

  it('resets progress when the level changes', async () => {
    const c = controller()
    c.goTo(1, 1)
    await play(c, WIN)
    expect(c.state().satisfied).toBe(true)
    c.goTo(1, 2)
    expect(c.state()).toMatchObject({ satisfied: false, message: null })
  })

  it('treats free play as always finishable', () => {
    const c = controller()
    c.goTo(1, 8)
    expect(c.canContinue()).toBe(true)
    expect(c.next()).toHaveProperty('href')
    c.goTo(1, 1)
    expect(c.canContinue()).toBe(false)
  })

  it('parses lesson routes', () => {
    expect(LessonController.parseRoute('#learn/hoai-adventure/1/3')).toEqual({ unit: 'hoai-adventure', lesson: 1, level: 3 })
    expect(LessonController.parseRoute('#build')).toBeNull()
  })
})
