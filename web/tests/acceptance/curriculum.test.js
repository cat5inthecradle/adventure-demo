// Acceptance tests for the Hour of AI content: the Space starter world and the
// unit's lesson structure and level properties, in Code.org's Lab2 shapes
// (script structure ≈ /api/script_structure, level properties ≈ the id-keyed
// map /s/:script/lessons/:pos/level_properties returns).

import { describe, expect, it } from 'vitest'
import space from '../../../worlds/starters/space.json'
import unit from '../../../curriculum/hour-of-ai/unit.json'
import levelProperties from '../../../curriculum/hour-of-ai/level_properties.json'
import { loadWorld } from '../../src/engine/loader.js'
import { takeTurn } from '../../src/engine/turn.js'
import { TOOLBOX } from '../../src/builder/schema.js'

const CONDITION_NAMES = [
  'game_won', 'turn_failed', 'examined_matching', 'saw_custom_refusal', 'saw_tool_hint',
  'opened_door_locked_by_flag', 'flag_set', 'interpreter_understood', 'interpreter_clarified',
  'viewed_understood_panel', 'ai_dial_set',
  'entity_named_matching', 'item_has_open_refusal', 'item_has_tool_hint', 'door_locked_by_flag',
]
const BLOCK_TYPES = TOOLBOX.contents.flatMap(c => c.contents).filter(b => b.kind === 'block').map(b => b.type)
const PANELS = ['understood', 'world']
const DIAL = ['off', 'understand', 'fill_gaps', 'improvise', 'invent']

async function play(lines) {
  const world = loadWorld(space)
  const turns = []
  for (const line of lines) turns.push(await takeTurn(world, line))
  return { world, turns }
}

describe('Space starter world', () => {
  it('loads', () => {
    expect(() => loadWorld(space)).not.toThrow()
    const world = loadWorld(space)
    expect(world.player_location).toBe('cockpit')
    expect(Object.keys(world.rooms).sort()).toEqual(['cargo_bay', 'cockpit'])
  })

  it('can be won on the documented path', async () => {
    const { world, turns } = await play([
      'take prybar', 'go south', 'use prybar on crate', 'take power cell', 'go north', 'use power cell on console',
    ])
    const failed = turns.filter(t => t.events.some(e => e.type === 'action_failed') || t.parseError)
    expect(failed.map(t => t.line)).toEqual([])
    expect(world.outcome).toBe('win')
  })

  it('keeps the power cell hidden until the crate is pried open', () => {
    expect(space.items.power_cell.location).toBe('hidden')
    expect(space.items.supply_crate.location).toBe('cargo_bay')
    expect(space.items.supply_crate.portable).toBe(false)
  })

  it('ships flaw 1: the cockpit mentions a coffee mug that is not a thing', async () => {
    expect(space.rooms.cockpit.description.toLowerCase()).toContain('coffee mug')
    const named = [...Object.values(space.items), ...Object.values(space.npcs ?? {}), ...Object.values(space.doors ?? {})]
      .flatMap(e => [e.name, ...(e.aliases ?? [])]).map(s => s.toLowerCase())
    expect(named.filter(n => n.includes('mug'))).toEqual([])
    const { turns } = await play(['examine mug'])
    expect(turns[0].events.some(e => e.type === 'entity_examined')).toBe(false)
  })

  it('ships flaw 2: the crate gives the flat, generic refusal', async () => {
    expect(space.items.supply_crate.open_refusal ?? null).toBeNull()
    expect(Object.keys(space.items.supply_crate.open_refusal_with ?? {})).toEqual([])
    const { turns } = await play(['go south', 'open crate'])
    const refusal = turns[1].events.find(e => e.type === 'action_failed')
    expect(refusal).toMatchObject({ reason: 'not_openable', message: null })
  })

  it('has a helper who points at leverage and the prybar', async () => {
    const { turns } = await play(['go south', 'talk to droid'])
    const spoke = turns[1].events.find(e => e.type === 'npc_spoke')
    expect(spoke?.text?.toLowerCase()).toMatch(/prybar|leverage/)
  })
})

describe('Hour of AI unit', () => {
  const lesson = unit.lessons?.[0]

  it('is one lesson of eight levels in script-structure shape', () => {
    expect(unit).toMatchObject({ name: 'hoai-adventure' })
    expect(typeof unit.title).toBe('string')
    expect(unit.lessons).toHaveLength(1)
    expect(lesson).toMatchObject({ position: 1, script_name: 'hoai-adventure' })
    expect(lesson.levels.map(l => l.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    for (const level of lesson.levels) {
      expect(level).toMatchObject({
        activeId: String(level.activeId),
        ids: [level.activeId],
        path: `#learn/hoai-adventure/1/${level.position}`,
        app: 'adventure',
        uses_lab2: true,
      })
      expect(typeof level.id).toBe('string')
      expect(typeof level.progression_display_name).toBe('string')
      expect(level.freePlay).toBe(level.position === 8)
    }
  })

  it('groups levels into the four sections', () => {
    expect(lesson.levels.map(l => l.progression)).toEqual([
      'Play and look inside', 'Play and look inside',
      'Fix the world', 'Fix the world', 'Fix the world',
      'AI and the author', 'AI and the author',
      'Free play',
    ])
  })
})

describe('Hour of AI level properties', () => {
  const levels = unit.lessons[0].levels
  const props = position => levelProperties[levels[position - 1].activeId]

  it('has properties for exactly the unit’s levels, keyed by id', () => {
    expect(Object.keys(levelProperties).sort()).toEqual(levels.map(l => l.activeId).sort())
    for (const level of levels) {
      const p = props(level.position)
      expect(p).toMatchObject({ id: Number(level.activeId), appName: 'adventure', type: 'Adventure' })
      expect(p.name).toMatch(/^[a-z0-9_]+$/)
      expect(p.displayName?.length).toBeGreaterThan(0)
      expect(p.longInstructions?.length).toBeGreaterThan(40)
      expect(p.teacherMarkdown?.length).toBeGreaterThan(40)
      expect(Array.isArray(p.validations)).toBe(true)
    }
  })

  it('uses only known conditions and well-formed validations', () => {
    for (const level of levels) {
      for (const v of props(level.position).validations) {
        expect(typeof v.key).toBe('string')
        expect(typeof v.message).toBe('string')
        expect(typeof v.next).toBe('boolean')
        for (const c of v.conditions) expect(CONDITION_NAMES).toContain(c.name)
      }
    }
  })

  it('gives every level but free play a way to pass, and free play none', () => {
    for (const level of levels.slice(0, 7)) {
      expect(props(level.position).validations.some(v => v.next)).toBe(true)
    }
    expect(props(8).validations).toEqual([])
    expect(props(8).freePlay).toBe(true)
  })

  it('passes each level on the conditions the design names', () => {
    const passing = position => props(position).validations.find(v => v.next).conditions
    expect(passing(1)).toEqual([{ name: 'game_won' }])
    expect(passing(2)).toEqual(expect.arrayContaining([{ name: 'turn_failed' }, { name: 'viewed_understood_panel' }]))
    expect(passing(3)).toEqual([{ name: 'examined_matching', value: 'mug' }])
    expect(passing(4)).toEqual(expect.arrayContaining([
      { name: 'item_has_open_refusal', value: 'supply_crate' },
      { name: 'item_has_tool_hint', value: 'supply_crate' },
      { name: 'saw_tool_hint', value: 'supply_crate' },
    ]))
    expect(passing(5)).toEqual(expect.arrayContaining([{ name: 'door_locked_by_flag' }, { name: 'opened_door_locked_by_flag' }]))
    expect(passing(6)).toEqual(expect.arrayContaining([{ name: 'interpreter_understood' }, { name: 'interpreter_clarified' }]))
    expect(passing(7)).toEqual([{ name: 'ai_dial_set' }])
  })

  it('puts the passing validation first and adds partway feedback where the design has it', () => {
    for (const position of [3, 4, 5, 6]) {
      const validations = props(position).validations
      expect(validations[0].next).toBe(true)
      expect(validations.some(v => !v.next)).toBe(true)
    }
  })

  it('shares one student world from level 3 on', () => {
    expect(props(1).projectTemplateLevelName).toBeUndefined()
    expect(props(2).projectTemplateLevelName).toBeUndefined()
    for (const position of [3, 4, 5, 6, 7, 8]) {
      expect(props(position).projectTemplateLevelName).toBe('hoai_adventure_world')
    }
  })

  it('sets up each level’s view, panels, blocks and AI', () => {
    for (const level of levels) {
      const data = props(level.position).levelData
      expect(data.startWorld).toBe('space')
      expect(['play', 'build']).toContain(data.view)
      for (const panel of data.panels) expect(PANELS).toContain(panel)
      expect(typeof data.interpreter).toBe('boolean')
      if (data.build?.blocks) for (const type of data.build.blocks) expect(BLOCK_TYPES).toContain(type)
    }
    const data = position => props(position).levelData
    expect(data(1)).toMatchObject({ view: 'play', panels: [], build: null, interpreter: false })
    expect(data(2)).toMatchObject({ view: 'play', panels: ['understood'], build: null, interpreter: false })
    expect(data(3)).toMatchObject({ view: 'build', build: { blocks: ['room', 'item'] } })
    expect(data(4)).toMatchObject({ view: 'build', build: { blocks: ['item', 'refusal_with'] } })
    expect(data(5).view).toBe('build')
    expect(data(5).build.blocks).toEqual(expect.arrayContaining(['door', 'lock_until', 'use_rule', 'eff_flag']))
    expect(data(6)).toMatchObject({ view: 'play', build: null, interpreter: true })
    expect(data(8).build).toEqual({})
    for (const position of [7, 8]) {
      expect(data(position).interpreter).toBe(true)
      expect(data(position).aiDial).toEqual({ settings: DIAL, default: 'understand', locked: ['invent'] })
    }
  })
})
