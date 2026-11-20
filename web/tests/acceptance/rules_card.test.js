// Acceptance tests for the "My AI rules" card: the one page a student takes
// away. LessonController.card() gathers it; AiRulesCard.vue only draws it.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import haunted from '../../../worlds/starters/haunted.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import { withThing } from '../../src/lesson/addThing.js'
import LessonController from '../../src/lesson/LessonController.js'

function memoryStore() {
  const data = new Map()
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) }
}
const controller = (store = memoryStore()) =>
  new LessonController({ unit, levelProperties, starters: { space, haunted }, store })

/** Do the parts of the lesson the card reports on. */
async function doLesson(c) {
  c.goTo(1, 4)
  c.setDial({ setting: 'fill_gaps', tone: 'eerie' })
  c.saveDialChoice('  Details are safe to make up.  ')
  c.goTo(1, 5)
  const { world } = withThing(c.game.definition.value, { name: 'coffee mug', description: 'Cold coffee.', aliases: 'mug, cup' })
  await c.game.applyWorld(world)
  c.goTo(1, 6)
  c.setRealLife('homework', { setting: 'understand', reason: 'The teacher wrote it.' })
  c.setRealLife('clinic', { setting: 'off', reason: 'A wrong dose could hurt someone.' })
  c.setRealLife('story_game', { setting: 'invent', reason: 'Surprises are fun.' })
}

describe('the AI rules card', () => {
  it('is empty, not broken, before the student has done anything', () => {
    const card = controller().card()
    expect(card.title).toBe('Drift')
    expect(card.dial).toBeNull()
    expect(card.thing).toBeNull()
    expect(card.realLife.map(a => a.id)).toEqual(['homework', 'clinic', 'story_game'])
    for (const app of card.realLife) expect(app).toMatchObject({ setting: null, name: null, means: null, reason: '' })
  })

  it('gathers the game dial, the thing made real and the real-life dials', async () => {
    const c = controller()
    await doLesson(c)
    const card = c.card()
    expect(card.dial).toMatchObject({ setting: 'fill_gaps', name: 'Fill gaps', reason: 'Details are safe to make up.' })
    expect(card.dial.meaning).toMatch(/writes/)
    expect(card.thing).toEqual({ name: 'coffee mug', description: 'Cold coffee.', portable: true, aliases: ['mug', 'cup'] })
    const clinic = card.realLife.find(a => a.id === 'clinic')
    expect(clinic).toMatchObject({ title: 'A clinic app', name: 'Off', reason: 'A wrong dose could hurt someone.' })
    expect(clinic.means).toBe(levelProperties['9009'].levelData.realLife.scenarios[1].options.off)
  })

  it('survives a reload', async () => {
    const store = memoryStore()
    await doLesson(controller(store))
    const again = controller(store)
    again.goTo(1, 6)
    const card = again.card()
    expect(card.dial).toMatchObject({ setting: 'fill_gaps', tone: 'eerie', reason: 'Details are safe to make up.' })
    expect(card.thing?.name).toBe('coffee mug')
    expect(card.realLife.every(a => a.setting)).toBe(true)
    again.goTo(1, 4)
    expect(again.game.state.aiMode).toBe('fill_gaps')          // the saved dial is applied again
  })

  it('reports the thing made in the world the student chose', async () => {
    const c = controller()
    c.setWorld('haunted')
    c.goTo(1, 5)
    const { world } = withThing(c.game.definition.value, { name: 'faded portrait', description: 'Eyes that follow.', aliases: '' })
    await c.game.applyWorld(world)
    expect(c.card()).toMatchObject({ title: 'Hollow House', thing: { name: 'faded portrait' } })
    c.setWorld('space')
    expect(c.card().thing).toBeNull()                         // the space world has no thing yet
  })

  it('puts the saved dial and its reason in the downloaded log', async () => {
    const c = controller()
    await doLesson(c)
    expect(c.exportLog().lesson.dialSaved).toMatchObject({ setting: 'fill_gaps', reason: 'Details are safe to make up.' })
  })

  it('reports the dial the student saved, not one they only tried', async () => {
    const c = controller()
    await doLesson(c)
    c.goTo(1, 4)
    c.setDial({ setting: 'improvise' })                       // experimenting, not saved
    expect(c.card().dial).toMatchObject({ setting: 'fill_gaps', name: 'Fill gaps' })
    expect(c.exportLog().lesson.dial).toMatchObject({ setting: 'improvise' })
  })

  it('shows no game dial when the student moved it but never saved', () => {
    const c = controller()
    c.goTo(1, 4)
    c.setDial({ setting: 'fill_gaps' })
    expect(c.card().dial).toBeNull()
  })

  it('reports incomplete activity separately from saved preferences and an untested object', async () => {
    const c = controller()
    await doLesson(c)
    expect(c.card().activity.map(a => a.completed)).toEqual([false, false, false, false, false, true])
    expect(c.card().observedExample).toBeNull()
    c.setRealLife('clinic', { reason: '' })
    expect(c.card().activity.at(-1).completed).toBe(false)
  })

  it('includes recorded evidence and route without claiming live work', () => {
    const c = controller()
    c.goTo(1, 3)
    for (const task of c.experimentTasks()) c.saveExperiment(task.id, 'recorded', 'The rules rejected an unrelated move')
    const card = c.card()
    expect(card.activity[2]).toMatchObject({ completed: true, route: 'recorded examples' })
    expect(card.observedExample).toMatchObject({ route: 'recorded' })
    expect(card.observedExample.evidence).toContain('prybar')
    expect(card.activity[3].completed).toBe(false)
  })

  it('asks for no name on screen and prints the card alone', () => {
    const source = readFileSync(new URL('../../src/components/AiRulesCard.vue', import.meta.url), 'utf8')
    expect(source).not.toMatch(/<input/)                      // the name line is filled in by hand
    expect(source).toMatch(/@media print/)
    expect(source).toMatch(/window\.print\(\)/)
  })
})
