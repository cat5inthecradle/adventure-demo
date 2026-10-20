// The engine must say exactly what it said when golden.json was recorded, line for
// line, in writing and aloud. When a change to the game is meant to change what a
// player sees, re-record with `npm run golden` and commit the diff with the change.
import { describe, expect, it } from 'vitest'
import golden from './fixtures/golden.json'
import wayfarer from '../../worlds/wayfarer.json'
import { loadWorld } from '../src/engine/loader.js'
import { isParseError, parse } from '../src/engine/parser.js'
import { apply } from '../src/engine/engine.js'
import { Style, renderEvents, renderParseError } from '../src/engine/renderer.js'

// Optional fields are recorded only when set.
const clean = action => Object.fromEntries(Object.entries(action).filter(([, v]) => v != null))

describe.each(Object.entries(golden))('%s', (name, { steps, final }) => {
  it('plays out exactly as recorded', () => {
    const world = loadWorld(wayfarer)
    for (const step of steps) {
      const parsed = parse(world, step.line)
      if (isParseError(parsed)) {
        expect(step.action, `"${step.line}" parsed when recorded`).toBeNull()
        expect(renderParseError(parsed), step.line).toBe(step.text)
        continue
      }
      expect(clean(parsed), step.line).toEqual(clean(step.action ?? {}))
      const events = apply(world, parsed)
      expect(renderEvents(events, Style.TEXT, world.pronouns), step.line).toBe(step.text)
      expect(renderEvents(events, Style.SPEECH, world.pronouns), step.line).toBe(step.speech)
    }
    expect(world.player_location).toBe(final.player_location)
    expect(world.turn_count).toBe(final.turn_count)
    expect(world.outcome).toBe(final.outcome)
    expect(world.flags).toEqual(final.flags)
    expect(world.visited).toEqual(final.visited)
  })
})
