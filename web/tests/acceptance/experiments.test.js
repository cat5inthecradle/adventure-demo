import { describe, it, expect } from 'vitest'
import LessonController from '../../src/lesson/LessonController.js'
import { unit, levelProperties, starters } from '../../src/lesson/hourOfAi.js'
const memory = () => {
  const data = new Map()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
}
const create = (store = null) => new LessonController({ unit, levelProperties, starters, store })
const review = (c, route = 'recorded') => {
  for (const task of c.experimentTasks()) c.saveExperiment(task.id, route, 'The evidence shows what changed')
}

describe('AI investigation completion', () => {
  it('finishes without a model, persists evidence, and resets it', () => {
    const store = memory(), c = create(store)
    c.goTo(1, 3)
    expect(() => c.saveExperiment('interpret', 'live', 'I see an action')).toThrow(/Try the experiment/)
    expect(() => c.saveExperiment('interpret', 'recorded', 'idk')).toThrow(/few words/)
    c.saveExperiment('interpret', 'recorded', 'The prybar moved into inventory')
    expect(c.canContinue()).toBe(false)
    c.saveExperiment('boundary', 'recorded', 'The game rejected an unrelated move')
    expect(c.canContinue()).toBe(true)
    c.goTo(1, 4)
    c.saveDialChoice('I want only interpretation')
    expect(c.canContinue()).toBe(false)
    review(c)
    expect(c.canContinue()).toBe(true)
    const again = create(store)
    again.goTo(1, 4)
    expect(again.canContinue()).toBe(true)
    expect(again.card().experiments.every(e => e.route === 'recorded' && e.evidence)).toBe(true)
    again.clearSavedLesson()
    const fresh = create(store)
    expect(fresh.card().experiments.every(e => !e.route)).toBe(true)
  })

  it('does not promote legacy dial preferences and completion flags', () => {
    const store = memory()
    store.setItem('adventure-lab:lesson-passed', '[9001,9006,9007]')
    store.setItem('adventure-lab:lesson-dial', JSON.stringify({ setting: 'off', reason: 'I prefer authored stories' }))
    const c = create(store)
    c.goTo(1, 4)
    expect(c.dialSaved.setting).toBe('off')
    expect([...c.passed]).toEqual([9001])
    expect(c.canContinue()).toBe(false)
  })

  it('accepts reviewed unsuccessful live replies without claiming successful interpretation', async () => {
    const c = create()
    c.goTo(1, 3)
    c.game.state.pace = 0
    c.setInterpreter({ name: 'scripted failure', async interpret() { throw new Error('unavailable') } })
    await c.game.submit('can you grab the prybar for me')
    await c.game.submit('fly to the moon')
    expect(c.canContinue()).toBe(false)
    review(c, 'live')
    expect(c.canContinue()).toBe(true)
    expect(c.card().experiments[0]).toMatchObject({ route: 'live' })
    expect(c.card().experiments[0].evidence).toContain('unavailable')
  })

  it('requires the same input in Off and Understand, then allows mixed recorded generation', async () => {
    const store = memory(), c = create(store)
    c.goTo(1, 4)
    c.game.state.pace = 0
    c.setDial({ setting: 'off' })
    await c.game.submit('could you get me the prybar')
    c.setDial({ setting: 'understand' })
    await c.game.submit('look')
    expect(c.liveEvidence('compare')).toBeNull()
    await c.game.submit('could you get me the prybar')
    c.saveExperiment('compare', 'live', 'Neither request took the prybar')
    for (const id of ['scenery', 'dialogue']) c.saveExperiment(id, 'recorded', 'Generated text leaves rules unchanged')
    expect(c.canContinue()).toBe(false)
    c.saveDialChoice('Keep the authored rules')
    expect(c.canContinue()).toBe(true)
    const again = create(store)
    again.goTo(1, 4)
    expect(again.liveEvidence('compare')).toContain('could you get me the prybar')
    expect(again.card().experiments.slice(2).map(e => e.route)).toEqual(['live', 'recorded', 'recorded'])
  })
})
