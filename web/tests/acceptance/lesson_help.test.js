import { describe, expect, it, vi } from 'vitest'
import LessonController from '../../src/lesson/LessonController.js'
import { unit, levelProperties, starters } from '../../src/lesson/hourOfAi.js'
import { lessonHint } from '../../src/lesson/hints.js'
import { understandingSummary } from '../../src/lesson/understanding.js'
import { loadWorld } from '../../src/engine/loader.js'
import { takeTurn } from '../../src/engine/turn.js'
import wayfarer from '../../../worlds/wayfarer.json'

const controller = () => new LessonController({ unit, levelProperties, starters, store: null })

describe('progressive help', () => {
  it.each(Object.keys(starters))('guides %s to its goal using current state, including a dropped tool', async key => {
    const c = controller()
    c.setWorld(key); c.goTo(1, 1); c.game.state.pace = 0
    const tool = c.game.world.value.interactions[0].item_id
    const before = JSON.stringify(c.game.world.value)
    expect(lessonHint(c).goal).toBeTruthy()
    expect(JSON.stringify(c.game.world.value)).toBe(before)
    await c.game.submit(lessonHint(c).command)
    expect(c.game.world.value.items[tool].location).toBe('inventory')
    await c.game.submit(`drop ${c.game.world.value.items[tool].name}`)
    expect(lessonHint(c).command).toMatch(/^take /)
    for (let i = 0; i < 10 && c.game.world.value.outcome !== 'win'; i++) {
      const hint = lessonHint(c)
      expect(hint.command).toBeTruthy()
      const turn = await c.game.submit(hint.command)
      expect(turn.parseError).toBeNull()
      expect(turn.events.some(e => e.type === 'action_failed')).toBe(false)
    }
    expect(c.game.world.value.outcome).toBe('win')
    expect(lessonHint(c).command).toBeNull()
  })

  it.each(Object.keys(starters))('updates %s character advice and container replies', async key => {
    const w = loadWorld(starters[key])
    const opening = w.interactions[0], tool = w.items[opening.item_id], box = w.items[opening.target_id]
    const npc = Object.values(w.npcs)[0]
    w.player_location = npc.location
    const without = await takeTurn(w, `talk to ${npc.name}`)
    tool.location = 'inventory'
    const carrying = await takeTurn(w, `talk to ${npc.name}`)
    expect(carrying.text).toContain('already have')
    expect(carrying.text).not.toBe(without.text)
    const closed = await takeTurn(w, `open ${box.name}`)
    expect(closed.text).toContain(`use ${tool.name} on ${box.name}`)
    await takeTurn(w, `use ${tool.name} on ${box.name}`)
    const opened = await takeTurn(w, `open ${box.name}`)
    expect(opened.events[0].reason).toBe('already_open')
    const absent = await takeTurn(w, 'open imaginary box')
    expect(absent.action).toBeNull()
  })

  it('supports the vine-cutting clue literally without AI', async () => {
    const w = loadWorld(starters.jungle)
    await takeTurn(w, 'take machete')
    await takeTurn(w, 'north')
    const turn = await takeTurn(w, 'cut vines with machete')
    expect(turn.route).toBe('parser')
    expect(w.flags.urn_open).toBe(true)
  })

  it('accepts the spaced pry bar name', async () => {
    const w = loadWorld(starters.space)
    await takeTurn(w, 'take pry bar')
    expect(w.items.prybar.location).toBe('inventory')
  })

  it('keeps pod entry in the bay and points at the actual launch action', async () => {
    const w = loadWorld(wayfarer)
    w.player_location = 'escape_pod_bay'; w.flags.power_restored = true
    const interpret = vi.fn()
    for (const line of ['board escape pod', 'go into escape pod', 'enter escape pod']) {
      const turn = await takeTurn(w, line, { interpreter: { name: 'unused', interpret } })
      expect(turn.text).toMatch(/launch lever/)
      expect(w.player_location).toBe('escape_pod_bay')
    }
    expect(interpret).not.toHaveBeenCalled()
    await takeTurn(w, 'use launch lever')
    expect(w.outcome).toBe('win')
  })

  it('rejects invalid inventory guards in authored worlds', () => {
    const bad = structuredClone(starters.space)
    bad.npcs.maintenance_droid.dialogue[0].requires_items = { nonexistent: true }
    expect(() => loadWorld(bad)).toThrow(/requires_items/)
  })

  it('distinguishes generated words, missing objects and refused actions in the brief inspector', () => {
    expect(understandingSummary({ route: 'filled', changes: [] })).toMatch(/did not create an object/)
    expect(understandingSummary({ route: 'improvised', changes: [] })).toMatch(/not new game rules/)
    expect(understandingSummary({ parseError: { kind: 'unknown_noun', noun: 'mug' } })).toMatch(/could not find “mug”/)
    expect(understandingSummary({ action: {}, events: [{ type: 'action_failed' }] })).toMatch(/rule stopped/)
    expect(understandingSummary({ interpreter: { status: 'unavailable' } })).toMatch(/recorded examples/)
  })
})
