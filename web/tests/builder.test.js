// The World Builder must be able to carry any world into blocks and back without
// changing how it plays, and must apply edits to a game in progress sensibly.
import { describe, expect, it } from 'vitest'
import wayfarer from '../../worlds/wayfarer.json'
import golden from './fixtures/golden.json'
import { BLOCKS } from '../src/builder/schema.js'
import { BLANK_WORLD, stateToWorld, worldToState } from '../src/builder/convert.js'
import { loadWorld } from '../src/engine/loader.js'
import { isParseError, parse } from '../src/engine/parser.js'
import { apply } from '../src/engine/engine.js'
import { Style, renderEvents, renderParseError } from '../src/engine/renderer.js'
import { mergeWorld } from '../src/engine/merge.js'

const roundTrip = raw => stateToWorld(JSON.parse(JSON.stringify(worldToState(raw))))

function play(world, lines) {
  return lines.map(line => {
    const parsed = parse(world, line)
    if (isParseError(parsed)) return renderParseError(parsed)
    const events = apply(world, parsed)
    return renderEvents(events, Style.TEXT, world.pronouns) + '\n' + renderEvents(events, Style.SPEECH, world.pronouns)
  })
}

describe('world <-> blocks', () => {
  it('only uses block types, fields and inputs the toolbox defines', () => {
    const defs = new Map(BLOCKS.map(b => [b.type, b]))
    const names = def => new Set(Object.keys(def).filter(k => k.startsWith('args'))
      .flatMap(k => def[k].map(a => a.name)))
    const walk = block => {
      const def = defs.get(block.type)
      expect(def, block.type).toBeTruthy()
      const allowed = names(def)
      for (const f of Object.keys(block.fields ?? {})) expect(allowed.has(f), `${block.type}.${f}`).toBe(true)
      for (const [i, input] of Object.entries(block.inputs ?? {})) {
        expect(allowed.has(i), `${block.type}.${i}`).toBe(true)
        for (let b = input.block; b; b = b.next?.block) walk(b)
      }
    }
    worldToState(wayfarer).blocks.blocks.forEach(walk)
  })

  it('keeps the Wayfarer valid', () => {
    expect(() => loadWorld(roundTrip(wayfarer))).not.toThrow()
  })

  it('keeps the Wayfarer playing exactly the same, word for word', () => {
    for (const { steps } of Object.values(golden)) {
      const lines = steps.map(s => s.line)
      expect(play(loadWorld(roundTrip(wayfarer)), lines)).toEqual(play(loadWorld(wayfarer), lines))
    }
  })

  it('survives a second round trip unchanged', () => {
    const once = roundTrip(wayfarer)
    expect(roundTrip(once)).toEqual(once)
  })

  it('starts a blank world that is already playable', () => {
    const world = loadWorld(roundTrip(BLANK_WORLD))
    expect(play(world, ['look'])[0]).toMatch(/first room/)
  })

  it('gives new blocks readable, unique ids', () => {
    const state = { blocks: { blocks: [
      { type: 'room', fields: { NAME: 'Dark Cave' } },
      { type: 'room', fields: { NAME: 'Dark Cave' } },
    ] } }
    expect(Object.keys(stateToWorld(state).rooms)).toEqual(['dark_cave', 'dark_cave_2'])
  })
})

describe('editing a game in progress', () => {
  const start = () => loadWorld(wayfarer)
  const playTo = lines => {
    const world = start()
    for (const l of lines) apply(world, parse(world, l))
    return world
  }
  const PROGRESS = ['e', 's', 'take prybar', 'n', 'e', 'use prybar on crate', 'take power cell']

  it('keeps what the game changed and takes what the author changed', () => {
    const current = playTo(PROGRESS)
    const edited = structuredClone(wayfarer)
    edited.rooms.cargo_bay.description = 'Freshly rewritten.'
    edited.items.flashlight = { id: 'flashlight', name: 'flashlight', description: 'A torch.', location: 'cargo_bay' }
    const { world, notes } = mergeWorld(start(), current, loadWorld(edited))

    expect(notes).toEqual([])
    expect(world.player_location).toBe('cargo_bay')
    expect(world.rooms.cargo_bay.description).toBe('Freshly rewritten.')
    expect(world.items.prybar.location).toBe('inventory')
    expect(world.items.power_cell.location).toBe('inventory')
    expect(world.items.flashlight.location).toBe('cargo_bay')
    expect(world.flags.crate_open).toBe(true)
    expect(world.interactions.find(i => i.id === 'pry_crate').fired).toBe(true)
    expect(world.turn_count).toBe(current.turn_count)
  })

  it('moves the player to the start when their room is deleted', () => {
    const current = playTo(['e', 'e'])
    const edited = structuredClone(wayfarer)
    delete edited.rooms.cargo_bay
    edited.rooms.corridor.exits = { ...edited.rooms.corridor.exits }
    delete edited.rooms.corridor.exits.east
    for (const id of ['supply_crate', 'power_cell']) delete edited.items[id]
    delete edited.npcs.maintenance_droid
    edited.interactions = edited.interactions.filter(i => !['pry_crate', 'power_droid'].includes(i.id))
    const { world, notes } = mergeWorld(start(), current, loadWorld(edited))
    expect(world.player_location).toBe('crew_quarters')
    expect(notes[0]).toMatch(/gone/)
  })

  it('lets the game keep playing after the merge', () => {
    const current = playTo(PROGRESS)
    const { world } = mergeWorld(start(), current, loadWorld(structuredClone(wayfarer)))
    const out = play(world, ['use power cell on droid', 'talk to droid', 'w', 'open door', 'n', 'pull lever'])
    expect(world.outcome).toBe('win')
    expect(out.at(-1)).toMatch(/THE END/)
  })
})

describe('the world library', async () => {
  const lib = await import('../src/builder/library.js')
  const fakeStore = (entries = {}) => {
    const data = new Map(Object.entries(entries))
    return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), data }
  }

  it('names a world after its Story block', () => {
    expect(lib.titleOf(worldToState(wayfarer))).toBe('The Wayfarer')
    expect(lib.titleOf({ blocks: { blocks: [] } })).toBe('Untitled world')
    expect(lib.titleOf(lib.retitled(worldToState(wayfarer), 'My Ship'))).toBe('My Ship')
  })

  it('brings a pre-library workspace across as the first world', () => {
    const store = fakeStore({ 'adventure-lab:builder': JSON.stringify(worldToState(wayfarer)) })
    const library = lib.loadLibrary(store)
    expect(lib.list(library).map(w => w.name)).toEqual(['The Wayfarer'])
    expect(library.current).toBe(lib.list(library)[0].id)
    expect(store.data.has('adventure-lab:builder')).toBe(false)
  })

  it('keeps worlds apart, renames from the title, and never reuses a name', () => {
    const library = lib.emptyLibrary()
    const a = lib.add(library, worldToState(wayfarer))
    expect(lib.freshTitle(library, 'The Wayfarer')).toBe('The Wayfarer 2')
    const b = lib.add(library, worldToState(BLANK_WORLD))
    lib.update(library, b, lib.retitled(library.worlds[b].state, 'Haunted House'))
    expect(lib.list(library).map(w => w.name)).toEqual(['Haunted House', 'The Wayfarer'])
    library.current = b
    lib.remove(library, b)
    expect(library.current).toBe(a)
  })

  it('survives a save and reload', () => {
    const store = fakeStore()
    const library = lib.emptyLibrary()
    library.current = lib.add(library, worldToState(wayfarer))
    lib.saveLibrary(library, store)
    expect(lib.loadLibrary(store)).toEqual(library)
  })
})
