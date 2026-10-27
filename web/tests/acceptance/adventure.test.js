// Acceptance tests for src/adventure/: Adventure Lab's lab-specific side of the
// Lab2 progress system — its condition catalog, its validator, and the schema
// for its level properties.

import { describe, expect, it } from 'vitest'
import tiny from './fixtures/tiny_world.json'
import { loadWorld } from '../../src/engine/loader.js'
import { takeTurn } from '../../src/engine/turn.js'
import { ScriptedInterpreter } from '../../src/engine/interpreter.js'
import { Validator } from '../../src/lab2/ProgressManager.js'
import ProgressManager from '../../src/lab2/ProgressManager.js'
import { AdventureConditions } from '../../src/adventure/conditions.js'
import AdventureValidator from '../../src/adventure/AdventureValidator.js'
import { AdventureLevelPropertiesSchema, parseLevelProperties } from '../../src/adventure/levelKind.js'

const NAMES = {
  play: ['game_won', 'turn_failed', 'examined_matching', 'saw_custom_refusal', 'saw_tool_hint',
    'opened_door_locked_by_flag', 'flag_set', 'interpreter_understood', 'interpreter_clarified'],
  ui: ['viewed_understood_panel', 'ai_dial_set'],
  definition: ['entity_named_matching', 'item_has_open_refusal', 'item_has_tool_hint', 'door_locked_by_flag'],
}

/** A validator fed by playing `lines` in a fresh copy of `raw`. */
async function played(lines, { raw = tiny, interpreter = null } = {}) {
  const validator = new AdventureValidator()
  validator.setDefinition(raw)
  const world = loadWorld(raw)
  for (const line of lines) validator.recordTurn(await takeTurn(world, line, { interpreter }), world)
  validator.checkConditions()
  return validator
}

const met = (validator, ...conditions) => validator.conditionsMet(conditions)

describe('AdventureConditions', () => {
  it('describes every condition, by source', () => {
    const entries = Object.values(AdventureConditions)
    for (const [source, names] of Object.entries(NAMES)) {
      for (const name of names) {
        const entry = entries.find(c => c.name === name)
        expect(entry, name).toBeTruthy()
        expect(entry.source).toBe(source)
        expect(entry.description.length).toBeGreaterThan(10)
      }
    }
    expect(entries).toHaveLength(Object.values(NAMES).flat().length)
  })
})

describe('AdventureValidator', () => {
  it('is a Lab2 Validator that always checks every validation', () => {
    const validator = new AdventureValidator()
    expect(validator).toBeInstanceOf(Validator)
    expect(validator.shouldCheckConditions()).toBe(true)
    expect(validator.shouldCheckNextConditionsOnly()).toBe(false)
    expect(validator.getValidationResults()).toBeUndefined()
  })

  it('knows a won game', async () => {
    const v = await played(['pull lever', 'open door', 'north', 'take coin', 'use coin'])
    expect(met(v, { name: 'game_won' })).toBe(true)
    expect(met(v, { name: 'flag_set', value: 'lever_pulled' })).toBe(true)
    expect(met(v, { name: 'flag_set', value: 'other_flag' })).toBe(false)
    expect(met(await played(['look']), { name: 'game_won' })).toBe(false)
  })

  it('records failures with and without their reason', async () => {
    const v = await played(['xyzzy', 'open crate'])
    expect(met(v, { name: 'turn_failed' })).toBe(true)
    expect(met(v, { name: 'turn_failed', value: 'not_understood' })).toBe(true)
    expect(met(v, { name: 'turn_failed', value: 'not_openable' })).toBe(true)
    expect(met(v, { name: 'turn_failed', value: 'door_locked' })).toBe(false)
    expect(met(await played(['look']), { name: 'turn_failed' })).toBe(false)
  })

  it('matches examined things by any word of their name or aliases', async () => {
    const v = await played(['examine cup'])
    expect(met(v, { name: 'examined_matching', value: 'mug' })).toBe(true)
    expect(met(v, { name: 'examined_matching', value: 'MUG' })).toBe(true)
    expect(met(v, { name: 'examined_matching', value: 'coin' })).toBe(false)
  })

  it('tells an author’s refusal from a stronger tool hint', async () => {
    const plain = await played(['open crate'])
    expect(met(plain, { name: 'saw_custom_refusal', value: 'crate' })).toBe(true)
    expect(met(plain, { name: 'saw_tool_hint', value: 'crate' })).toBe(false)
    const hinted = await played(['take crowbar', 'open crate'])
    expect(met(hinted, { name: 'saw_custom_refusal', value: 'crate' })).toBe(true)
    expect(met(hinted, { name: 'saw_tool_hint', value: 'crate' })).toBe(true)
  })

  it('does not count the generic refusal as the author’s', async () => {
    const raw = structuredClone(tiny)
    delete raw.items.crate.open_refusal
    delete raw.items.crate.open_refusal_with
    const v = await played(['take crowbar', 'open crate'], { raw })
    expect(met(v, { name: 'turn_failed', value: 'not_openable' })).toBe(true)
    expect(met(v, { name: 'saw_custom_refusal', value: 'crate' })).toBe(false)
    expect(met(v, { name: 'saw_tool_hint', value: 'crate' })).toBe(false)
  })

  it('knows when a door locked by a flag was opened', async () => {
    expect(met(await played(['open door']), { name: 'opened_door_locked_by_flag' })).toBe(false)
    expect(met(await played(['pull lever', 'open door']), { name: 'opened_door_locked_by_flag' })).toBe(true)
  })

  it('tells an interpreted action from a clarifying question', async () => {
    const interpreter = new ScriptedInterpreter('test', {
      'grab that iron bar': { kind: 'action', action: { type: 'take', item: 'crowbar' } },
      'open the vault with my sandwich': { kind: 'clarify', question: "I don't see a sandwich here." },
    })
    const understood = await played(['grab that iron bar'], { interpreter })
    expect(met(understood, { name: 'interpreter_understood' })).toBe(true)
    expect(met(understood, { name: 'interpreter_clarified' })).toBe(false)
    const both = await played(['grab that iron bar', 'open the vault with my sandwich'], { interpreter })
    expect(met(both, { name: 'interpreter_understood' }, { name: 'interpreter_clarified' })).toBe(true)
    expect(met(await played(['take crowbar'], { interpreter }), { name: 'interpreter_understood' })).toBe(false)
  })

  it('records UI events, with and without a value, and ignores unknown ones', () => {
    const v = new AdventureValidator()
    v.recordUiEvent('viewed_understood_panel')
    v.recordUiEvent('ai_dial_set', 'fill_gaps')
    v.recordUiEvent('made_up_event')
    expect(met(v, { name: 'viewed_understood_panel' })).toBe(true)
    expect(met(v, { name: 'ai_dial_set' })).toBe(true)
    expect(met(v, { name: 'ai_dial_set', value: 'fill_gaps' })).toBe(true)
    expect(met(v, { name: 'ai_dial_set', value: 'off' })).toBe(false)
  })

  it('checks the authored world, and rechecks it after an edit', () => {
    const v = new AdventureValidator()
    v.setDefinition(tiny)
    v.checkConditions()
    expect(met(v, { name: 'entity_named_matching', value: 'mug' })).toBe(true)
    expect(met(v, { name: 'entity_named_matching', value: 'teapot' })).toBe(false)
    expect(met(v, { name: 'item_has_open_refusal', value: 'crate' })).toBe(true)
    expect(met(v, { name: 'item_has_tool_hint', value: 'crate' })).toBe(true)
    expect(met(v, { name: 'item_has_open_refusal', value: 'lever' })).toBe(false)
    expect(met(v, { name: 'door_locked_by_flag' })).toBe(true)

    const edited = structuredClone(tiny)
    delete edited.items.crate.open_refusal_with
    edited.doors.vault_door.unlock_flag = null
    v.setDefinition(edited)
    v.checkConditions()
    expect(met(v, { name: 'item_has_tool_hint', value: 'crate' })).toBe(false)
    expect(met(v, { name: 'door_locked_by_flag' })).toBe(false)
    expect(met(v, { name: 'item_has_open_refusal', value: 'crate' })).toBe(true)
  })

  it('forgets play and UI history on clear, but keeps the authored world', async () => {
    const v = await played(['xyzzy'])
    v.recordUiEvent('viewed_understood_panel')
    v.clear(true)
    v.checkConditions()
    expect(met(v, { name: 'turn_failed' })).toBe(false)
    expect(met(v, { name: 'viewed_understood_panel' })).toBe(false)
    expect(met(v, { name: 'item_has_open_refusal', value: 'crate' })).toBe(true)
  })

  it('skips conditions it does not know, as Lab2 does', () => {
    const v = new AdventureValidator()
    expect(met(v, { name: 'published_to_gallery' })).toBe(true)
  })

  it('drives a ProgressManager through a level', async () => {
    const manager = new ProgressManager(() => {})
    const validator = new AdventureValidator()
    manager.setValidator(validator)
    manager.onLevelChange([
      { key: 'pass', conditions: [{ name: 'saw_tool_hint', value: 'crate' }], message: 'That hint lands.', next: true },
      { key: 'part', conditions: [{ name: 'saw_custom_refusal', value: 'crate' }], message: 'Now a hint for the crowbar.', next: false },
    ])
    validator.setDefinition(tiny)
    const world = loadWorld(tiny)
    validator.recordTurn(await takeTurn(world, 'open crate'), world)
    manager.updateProgress()
    expect(manager.getCurrentState()).toMatchObject({ satisfied: false, message: 'Now a hint for the crowbar.' })
    validator.recordTurn(await takeTurn(world, 'take crowbar'), world)
    validator.recordTurn(await takeTurn(world, 'open crate'), world)
    manager.updateProgress()
    expect(manager.getCurrentState()).toMatchObject({ satisfied: true, message: 'That hint lands.' })
  })
})

describe('Adventure level properties', () => {
  const level = {
    id: 9003,
    name: 'hoai_adventure_3',
    appName: 'adventure',
    type: 'Adventure',
    displayName: 'If you name it, answer it',
    longInstructions: 'Make the mug a real thing.',
    teacherMarkdown: 'Ask: what did players expect?',
    projectTemplateLevelName: 'hoai_adventure_world',
    validations: [{ key: 'pass', conditions: [{ name: 'examined_matching', value: 'mug' }], message: 'Nice.', next: true }],
    levelData: {
      startWorld: 'space',
      view: 'build',
      panels: ['understood'],
      build: { blocks: ['room', 'item'] },
      interpreter: false,
    },
  }

  it('parses a level and fills defaults', () => {
    const parsed = parseLevelProperties(level)
    expect(parsed).toMatchObject(level)
    expect(parsed.freePlay).toBe(false)
    const bare = parseLevelProperties({ ...level, validations: undefined, levelData: { startWorld: 'space', view: 'play' } })
    expect(bare.validations).toEqual([])
    expect(bare.levelData).toMatchObject({ panels: [], build: null, interpreter: false })
    expect(bare.levelData.aiDial).toBeUndefined()
  })

  it('accepts the AI dial', () => {
    const dial = { settings: ['off', 'understand', 'fill_gaps', 'improvise', 'invent'], default: 'understand', locked: ['invent'] }
    expect(parseLevelProperties({ ...level, levelData: { ...level.levelData, aiDial: dial } }).levelData.aiDial).toEqual(dial)
  })

  it('rejects what a lab could not run, naming the field', () => {
    const bad = [
      { ...level, appName: 'music' },
      { ...level, levelData: { ...level.levelData, view: 'bench' } },
      { ...level, levelData: { ...level.levelData, panels: ['minimap'] } },
      { ...level, levelData: { ...level.levelData, aiDial: { settings: ['telepathy'], default: 'telepathy', locked: [] } } },
      { ...level, validations: [{ key: 'x', conditions: [{ name: 'game_won' }], message: 'm' }] },
    ]
    for (const raw of bad) expect(() => parseLevelProperties(raw)).toThrow()
    expect(() => parseLevelProperties({ ...level, levelData: { ...level.levelData, view: 'bench' } })).toThrow(/view/)
  })

  it('exports the zod schema itself', () => {
    expect(typeof AdventureLevelPropertiesSchema.safeParse).toBe('function')
  })
})
