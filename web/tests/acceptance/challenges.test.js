import { describe, expect, it } from 'vitest'
import { ChallengeManager, CHALLENGE_KEY, CHALLENGES } from '../../src/lesson/challenges.js'
import LessonController from '../../src/lesson/LessonController.js'
import { unit, levelProperties, starters } from '../../src/lesson/hourOfAi.js'
import { withThing } from '../../src/lesson/addThing.js'

const memory = () => {
  const data = new Map()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
}
const controller = store => new LessonController({ unit, levelProperties, starters, store })

describe('optional practice challenges', () => {
  it('preserves the lesson game and completion while a practice session changes', async () => {
    const c = controller(memory())
    c.goTo(1, 3)
    const originalGame = c.game
    const before = JSON.stringify(c.game.world.value)
    const practice = c.challenges.open('interpreter', 'space', starters.space)
    await practice.game.submit('take prybar')
    practice.note = 'I compared two different requests.'
    practice.reviewed = true
    c.challenges.persist(practice)
    expect(c.game).toBe(originalGame)
    expect(JSON.stringify(c.game.world.value)).toBe(before)
    expect(c.canContinue()).toBe(false)
    expect(c.challenges.open('interpreter', 'space', starters.space)).toBe(practice)
    expect(practice.game.state.interpreter).toBeNull()
  })

  it('restores position, notes and edits after reload while keeping Restart at the authored beginning', async () => {
    const store = memory()
    const manager = new ChallengeManager(store)
    const session = manager.open('object', 'space', starters.space)
    const { world, id } = withThing(starters.space, { name: 'mug', description: 'A blue mug.', aliases: 'cup, vessel', portable: true })
    await session.game.applyWorld(world)
    await session.game.submit('take cup')
    session.note = 'Both aliases worked and the cup was portable.'
    session.reviewed = true
    expect(manager.persist(session)).toBe(true)
    const again = new ChallengeManager(store).open('object', 'space', starters.space)
    expect(again.game.world.value.items[id].location).toBe('inventory')
    expect(again.note).toBe(session.note)
    expect(again.reviewed).toBe(true)
    again.game.restart()
    expect(again.game.world.value.items[id].location).toBe('cockpit')
    expect(again.game.definition.value.items[id].aliases).toEqual(['cup', 'vessel'])
    expect(starters.space.items[id]).toBeUndefined()
  })

  it('keeps authoring practice separate from the saved core project and from other worlds', async () => {
    const store = memory(), c = controller(store)
    c.goTo(1, 5)
    const original = withThing(starters.space, { name: 'mug', description: 'Original mug.' }).world
    c.onWorldApplied(original)
    const practice = c.challenges.open('object', 'space', original)
    const draft = withThing(original, { id: 'mug', name: 'mug', description: 'Practice mug.', aliases: 'cup, vessel', portable: false }).world
    await practice.game.applyWorld(draft)
    c.challenges.persist(practice)
    expect(c.loadProject(c.properties.projectTemplateLevelName).items.mug.description).toBe('Original mug.')
    const other = c.challenges.open('object', 'haunted', starters.haunted)
    expect(other.game.definition.value.items.mug).toBeUndefined()
  })

  it('clears practice records and rejects late writes after lesson reset', async () => {
    const store = memory(), c = controller(store)
    const practice = c.challenges.open('wayfarer', 'space', starters.space)
    await practice.game.submit('look')
    c.challenges.persist(practice)
    expect(store.getItem(CHALLENGE_KEY)).toBeTruthy()
    c.clearSavedLesson()
    expect(c.challenges.persist(practice)).toBe(false)
    expect(store.getItem(CHALLENGE_KEY)).toBeNull()
  })

  it('offers all three challenges without requiring any core completion or model', () => {
    const manager = new ChallengeManager(null)
    for (const challenge of CHALLENGES) {
      const practice = manager.open(challenge.id, 'space', starters.space)
      expect(practice.game.state.interpreter).toBeNull()
      expect(manager.persist(practice)).toBe(false)
    }
    expect(() => manager.open('unknown', 'space', starters.space)).toThrow(/Unknown challenge/)
  })
})
