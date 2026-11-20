import { describe, expect, it } from 'vitest'
import LessonController from '../../src/lesson/LessonController.js'
import { unit, levelProperties, starters, lessonWorlds } from '../../src/lesson/hourOfAi.js'

function memoryStore() {
  const data = new Map()
  return {
    get length() { return data.size },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
  }
}
const controller = store => new LessonController({ unit, levelProperties, starters, worlds: lessonWorlds, store })

describe('fresh lesson reset', () => {
  it('clears every world and answer across a reload while preserving unrelated storage', () => {
    const store = memoryStore()
    const c = controller(store)
    for (const world of Object.keys(starters)) {
      c.setWorld(world)
      c.goTo(1, 5)
      c.onWorldApplied(starters[world])
      expect(c.loadProject(c.properties.projectTemplateLevelName)).toBeTruthy()
    }
    c.goTo(1, 4)
    c.setDial({ setting: 'improvise', tone: 'funny', theme: 'test' })
    c.saveDialChoice('Characters should invent their dialogue')
    c.goTo(1, 6)
    for (const id of ['homework', 'clinic', 'story_game']) {
      c.setRealLife(id, { setting: 'understand', reason: 'Use the written instructions' })
    }
    expect(c.canContinue()).toBe(true)
    store.setItem('adventure-lab:project:hoai_adventure_world:retired-world', 'old project')
    const retained = ['adventure-lab:project:other-lesson', 'adventure-lab:save:my-game', 'model-cache-sentinel', 'unrelated-setting']
    for (const key of retained) store.setItem(key, 'keep')

    expect(c.clearSavedLesson()).toBe('#learn/hoai-adventure/1/1')
    expect(store.getItem('adventure-lab:project:hoai_adventure_world:retired-world')).toBeNull()
    for (const key of retained) expect(store.getItem(key)).toBe('keep')
    const fresh = controller(store)
    expect(fresh.world).toBe(lessonWorlds.default)
    expect(fresh.resumeLevel()).toBe(1)
    expect(fresh.dialSaved).toBeNull()
    expect(fresh.dialWasSet).toBe(false)
    expect(fresh.realLife).toEqual({})
    expect([...fresh.passed]).toEqual([])
    for (const world of Object.keys(starters)) {
      fresh.setWorld(world)
      fresh.goTo(1, 5)
      expect(fresh.loadProject(fresh.properties.projectTemplateLevelName)).toBeNull()
      expect(fresh.canContinue()).toBe(false)
    }
    fresh.goTo(1, 6)
    expect(fresh.canContinue()).toBe(false)
  })

  it('does not let late game callbacks restore cleared progress or projects', () => {
    const store = memoryStore()
    const c = controller(store)
    c.goTo(1, 5)
    c.clearSavedLesson()
    c.onWorldApplied(starters.space)
    c.onTurn({ events: [] }, { outcome: 'win' })
    c.notify()
    expect(store.length).toBe(0)
  })

  it('works without persistent storage', () => {
    expect(controller(null).clearSavedLesson()).toBe('#learn/hoai-adventure/1/1')
  })

  it('reports deletion failure instead of claiming a clean start', () => {
    const store = memoryStore()
    store.removeItem = () => { throw new Error('denied') }
    expect(() => controller(store).clearSavedLesson()).toThrow(/Could not clear all saved lesson work/)
  })
})
