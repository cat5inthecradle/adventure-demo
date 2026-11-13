// Acceptance tests for the lesson's one authoring move: the "Add a thing" form
// that replaced the block builder in the Hour of AI lesson. The form's logic is
// src/lesson/addThing.js; these check it against the real lesson and worlds.

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import haunted from '../../../worlds/starters/haunted.json'
import jungle from '../../../worlds/starters/jungle.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import lessonWorlds from '../../../curriculum/hour-of-ai/worlds.json'
import { loadWorld } from '../../src/engine/loader.js'
import { parseAliases, studentThing, withThing } from '../../src/lesson/addThing.js'
import LessonController from '../../src/lesson/LessonController.js'

const starters = { space, haunted, jungle }
const MUG = { name: 'coffee mug', description: 'Cold coffee, older than the outage.', aliases: 'mug, cup' }

async function play(c, lines) {
  c.game.state.pace = 0
  for (const line of lines) await c.game.submit(line)
}
const lastText = c => c.game.state.turns.at(-1).text

describe('withThing', () => {
  it('adds a portable item to the starting room without touching the original', () => {
    const { world, id } = withThing(space, MUG)
    expect(id).toBe('coffee_mug')
    expect(world.items.coffee_mug).toEqual({
      id: 'coffee_mug', name: 'coffee mug', aliases: ['mug', 'cup'],
      description: MUG.description, location: space.player_location, portable: true,
    })
    expect(space.items.coffee_mug).toBeUndefined()
    expect(() => loadWorld(world)).not.toThrow()
  })

  it('updates the same thing when given its id, keeping where it is', () => {
    const first = withThing(space, MUG)
    first.world.items.coffee_mug.location = 'inventory'
    const second = withThing(first.world, { id: first.id, name: 'tin mug', description: 'Dented.', aliases: '' })
    expect(second.id).toBe('coffee_mug')
    expect(Object.keys(second.world.items)).toHaveLength(Object.keys(space.items).length + 1)
    expect(second.world.items.coffee_mug).toMatchObject({ name: 'tin mug', description: 'Dented.', aliases: [], location: 'inventory' })
  })

  it('picks an id nothing else in the world uses', () => {
    const { id, world } = withThing(space, { name: 'Prybar', description: 'Another one.' })
    expect(id).toBe('prybar_2')
    expect(world.items.prybar).toEqual(space.items.prybar)
  })

  it('asks for a name and a description in words a student can act on', () => {
    expect(() => withThing(space, { name: '  ', description: 'x' })).toThrow(/name/i)
    expect(() => withThing(space, { name: 'mug', description: ' ' })).toThrow(/examine/i)
  })
})

describe('parseAliases', () => {
  it('splits on commas and lines, tidies, and drops repeats and the name itself', () => {
    expect(parseAliases(' Mug,  cup\nmug, coffee  mug ,,', 'Coffee Mug')).toEqual(['mug', 'cup'])
    expect(parseAliases('')).toEqual([])
  })
})

describe('studentThing', () => {
  it('finds the thing the starter world does not have', () => {
    expect(studentThing(space, space)).toBeNull()
    expect(studentThing(withThing(space, MUG).world, space)).toMatchObject({ id: 'coffee_mug' })
  })
})

describe('the add-a-thing level', () => {
  for (const key of Object.keys(starters)) {
    it(`passes in the ${key} world once the student adds the detail and examines it`, async () => {
      const c = new LessonController({ unit, levelProperties, starters, store: null })
      c.setWorld(key)
      c.goTo(1, 5)
      const terms = lessonWorlds.worlds[key].terms
      const name = c.properties.levelData.addThing.name
      expect(name).toBe(terms.detail)

      await play(c, [`examine ${terms.detailShort}`])
      expect(c.state().satisfied).toBe(false)

      const { world } = withThing(c.game.definition.value, { name, description: 'Words the student wrote.', aliases: '' })
      await c.game.applyWorld(world)                 // live: the game in progress carries on
      expect(c.state()).toMatchObject({ satisfied: false })
      expect(c.state().message).toBeTruthy()

      await play(c, [`examine ${terms.detailShort}`])
      expect(lastText(c)).toMatch(/Words the student wrote\./)
      expect(c.state().satisfied).toBe(true)
    })
  }

  it('answers to a new "also called" name after the student saves it', async () => {
    const c = new LessonController({ unit, levelProperties, starters, store: null })
    c.goTo(1, 5)
    const added = withThing(c.game.definition.value, { name: 'coffee mug', description: 'Cold coffee.', aliases: '' })
    await c.game.applyWorld(added.world)
    const thing = studentThing(c.game.definition.value, space)
    const renamed = withThing(c.game.definition.value, { id: thing.id, name: 'coffee mug', description: 'Cold coffee.', aliases: 'cup' })
    await c.game.applyWorld(renamed.world)
    await play(c, ['examine cup'])
    expect(lastText(c)).toMatch(/Cold coffee\./)
  })
})
