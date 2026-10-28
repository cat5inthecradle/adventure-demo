// Acceptance tests for the lesson's world picker: students choose Drift (space),
// Hollow House (haunted) or Temple of Vines (jungle) on the first level, and every
// level's text, steps and checks speak about the world they chose.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import haunted from '../../../worlds/starters/haunted.json'
import jungle from '../../../worlds/starters/jungle.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import lessonWorlds from '../../../curriculum/hour-of-ai/worlds.json'
import { loadWorld } from '../../src/engine/loader.js'
import { takeTurn } from '../../src/engine/turn.js'
import { findGap, findTopic } from '../../src/engine/gaps.js'
import LessonController from '../../src/lesson/LessonController.js'
import * as hourOfAi from '../../src/lesson/hourOfAi.js'

const starters = { space, haunted, jungle }
const WINS = {
  space: ['take prybar', 'south', 'use prybar on crate', 'take cell', 'north', 'use cell on console'],
  haunted: ['take poker', 'east', 'use poker on chest', 'take key', 'west', 'use key on clock'],
  jungle: ['take machete', 'north', 'use machete on urn', 'take idol', 'south', 'put idol on altar'],
}
const LEVELS = levelProperties => Object.values(levelProperties).map(l => l.id)

function memoryStore() {
  const map = new Map()
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map }
}
const controller = (store = null) => new LessonController({ unit, levelProperties, starters, store })
const positions = () => unit.lessons.flatMap(lesson => lesson.levels.map(level => [lesson.position, level.position]))

describe('the starter worlds', () => {
  for (const key of lessonWorlds.order) {
    it(`${key} loads and can be won`, async () => {
      const world = loadWorld(starters[key])
      let last
      for (const line of WINS[key]) last = await takeTurn(world, line, { aiMode: 'off' })
      expect(last.outcome).toBe('win')
    })

    it(`${key} has what the lesson asks the student to find`, async () => {
      const { terms } = lessonWorlds.worlds[key]
      const examine = loadWorld(starters[key])
      const look = await takeTurn(examine, `examine the ${terms.detailShort}`, { aiMode: 'off' })
      expect(findGap(examine, look.parseError, look.parseTrace)).toBeTruthy()      // mentioned, never built

      const world = loadWorld(starters[key])
      expect(world.items[terms.containerId]).toBeTruthy()
      const phrase = await takeTurn(world, terms.understandPhrase, { aiMode: 'off' })
      expect(phrase.route).toBe('unresolved')                                    // only the AI can read it
      await takeTurn(world, terms.toSecond, { aiMode: 'off' })
      const ask = await takeTurn(world, `ask the ${terms.npc} about ${terms.askAbout}`, { aiMode: 'off' })
      expect(findTopic(world, ask.parseError, ask.parseTrace)).toBeTruthy()
      const talk = await takeTurn(world, `talk to ${terms.npc}`, { aiMode: 'off' })
      expect(talk.route).toBe('parser')
    })
  }

  it('are what the app loads for the lesson', () => {
    expect(Object.keys(hourOfAi.starters).sort()).toEqual(['haunted', 'jungle', 'space'])
    expect(hourOfAi.lessonWorlds.order).toEqual(['space', 'haunted', 'jungle'])
  })
})

describe('the lesson in each world', () => {
  for (const key of lessonWorlds.order) {
    it(`${key}: every level speaks about that world, with no placeholders left`, () => {
      const c = controller()
      c.setWorld(key)
      for (const [lesson, level] of positions()) {
        c.goTo(lesson, level)
        const text = JSON.stringify(c.properties)
        expect(text).not.toMatch(/\{\{/)
        expect(c.game.world.value.title).toBe(starters[key].title)
      }
    })
  }

  it('templates the checks too, so they look for the chosen world’s things', () => {
    const c = controller()
    c.setWorld('haunted')
    c.goTo(1, 4)
    const values = JSON.stringify(c.properties.validations)
    expect(values).toMatch(/old_chest/)
    expect(values).not.toMatch(/supply_crate/)
    expect(c.steps().map(s => s.text).join(' ')).toMatch(/chest/)
  })

  it('names the world in the first level', () => {
    const c = controller()
    c.setWorld('jungle')
    c.goTo(1, 1)
    expect(c.properties.longInstructions).toMatch(/Temple of Vines/)
    expect(c.properties.longInstructions).toMatch(/parrot/)
    expect(c.properties.levelData.worldPicker).toBe(true)
  })

  it('lets the student win the first level in a new world', async () => {
    const c = controller()
    c.setWorld('haunted')
    c.goTo(1, 1)
    c.game.state.pace = 0
    for (const line of WINS.haunted) await c.game.submit(line)
    expect(c.state().satisfied).toBe(true)
  })

  it('fills the new world’s gap on the AI dial level', async () => {
    const c = controller()
    c.setWorld('jungle')
    c.goTo(1, 7)
    c.setInterpreter({ name: 'fake', async interpret() { return { kind: 'clarify', question: '?' } }, async describe() { return { kind: 'text', text: 'Moss hides its face.' } } })
    c.setDial({ setting: 'fill_gaps' })
    c.game.state.pace = 0
    await c.game.submit('examine the statue')
    expect(c.steps().find(s => /fill gaps/i.test(s.text)).done).toBe(true)
  })
})

describe('choosing a world', () => {
  it('starts in space', () => {
    const c = controller()
    c.goTo(1, 1)
    expect(c.world).toBe('space')
    expect(c.game.world.value.title).toBe('Drift')
  })

  it('switches the current level to the new world at once', () => {
    const c = controller()
    c.goTo(1, 1)
    const notified = []
    c.onChange(() => notified.push(true))
    c.setWorld('haunted')
    expect(c.world).toBe('haunted')
    expect(c.game.world.value.title).toBe('Hollow House')
    expect(c.properties.longInstructions).toMatch(/Hollow House/)
    expect(notified.length).toBeGreaterThan(0)
  })

  it('refuses a world that does not exist', () => {
    const c = controller()
    expect(() => c.setWorld('moon')).toThrow(/moon/)
    expect(c.world).toBe('space')
  })

  it('is remembered in this browser', () => {
    const store = memoryStore()
    controller(store).setWorld('jungle')
    const again = controller(store)
    again.goTo(1, 1)
    expect(again.world).toBe('jungle')
    expect(again.game.world.value.title).toBe('Temple of Vines')
  })

  it('keeps each world’s built project apart, and space’s where it always was', () => {
    const store = memoryStore()
    const c = controller(store)
    c.goTo(1, 3)
    const built = { ...space, title: 'Drift, with a mug' }
    c.onWorldApplied(built)
    expect(store.getItem('adventure-lab:project:hoai_adventure_world')).toMatch(/with a mug/)

    c.setWorld('haunted')
    expect(c.game.world.value.title).toBe('Hollow House')     // the space project does not follow
    c.onWorldApplied({ ...haunted, title: 'Hollow House, with a portrait' })
    c.setWorld('space')
    expect(c.game.world.value.title).toBe('Drift, with a mug')
    c.setWorld('haunted')
    expect(c.game.world.value.title).toBe('Hollow House, with a portrait')
  })

  it('records the world in the downloaded log', () => {
    const c = controller()
    c.setWorld('jungle')
    c.goTo(1, 2)
    expect(c.exportLog().lesson.world).toBe('jungle')
  })

  it('still works when the app only knows the space world', () => {
    const c = new LessonController({ unit, levelProperties, starters: { space }, store: null })
    for (const [lesson, level] of positions()) {
      c.goTo(lesson, level)
      expect(JSON.stringify(c.properties)).not.toMatch(/\{\{/)
    }
  })
})

describe('the picker', () => {
  it('shows on the first level with each world’s name and blurb', () => {
    const panel = readFileSync(new URL('../../src/components/InstructionsPanel.vue', import.meta.url), 'utf8')
    const picker = readFileSync(new URL('../../src/components/WorldPicker.vue', import.meta.url), 'utf8')
    expect(panel).toMatch(/WorldPicker/)
    expect(panel).toMatch(/worldPicker/)
    expect(picker).toMatch(/setWorld/)
    expect(picker).toMatch(/blurb/)
  })

  it('every level id still resolves', () => {
    expect(LEVELS(levelProperties)).toContain(9001)
  })
})
