// Intent regressions from the independent playtests. No GPU or network needed.
import { describe, expect, it } from 'vitest'
import wayfarer from '../../worlds/wayfarer.json'
import jungle from '../../worlds/starters/jungle.json'
import haunted from '../../worlds/starters/haunted.json'
import { loadWorld } from '../src/engine/loader.js'
import { isGrounded } from '../src/engine/grounding.js'
import { takeTurn } from '../src/engine/turn.js'

const answering = reply => ({ name: 'scripted', async interpret() { return reply } })
const clean = action => Object.fromEntries(Object.entries(action).filter(([, v]) => v != null))

describe('model proposals must preserve the request', () => {
  const cases = [
    ['flight does not become listening', haunted, null, 'fly to the moon', { type: 'listen' }, 'listen'],
    ['statue does not become altar', jungle, null, 'inspect the moss-covered statue', { type: 'examine', target: 'stone_altar' }, 'inspect the stone altar'],
    ['light does not become manual', wayfarer, null, 'read the red emergency light', { type: 'examine', target: 'emergency_manual' }, 'read the emergency manual'],
    ['pod entry does not leave the bay', wayfarer, 'escape_pod_bay', 'could you go into escape pod', { type: 'go', direction: 'south' }, 'go south'],
    ['unnamed take does not select an object', wayfarer, null, 'take it', { type: 'take', item: 'emergency_manual' }, 'take the manual'],
    ['unnamed open does not select an object', wayfarer, null, 'open it', { type: 'open', target: 'emergency_manual' }, 'open the manual'],
    ['unnamed use does not select an object', wayfarer, null, 'use it', { type: 'use', item: 'emergency_manual' }, 'use the manual'],
    ['same action cannot substitute target', wayfarer, 'corridor', 'could you examine the door', { type: 'examine', target: 'status_console' }, 'examine console'],
    ['a room name does not license another route', wayfarer, 'corridor', 'could we head to the crew quarters', { type: 'go', direction: 'north' }, 'go north'],
    ['an explicit direction cannot be reversed', wayfarer, null, 'could we go east', { type: 'go', direction: 'west' }, 'go west'],
    ['unknown destination does not license movement', wayfarer, null, 'go to the moon', { type: 'go', direction: 'east' }, 'go east'],
    ['a named item does not license another verb', wayfarer, null, 'please examine the manual', { type: 'take', item: 'emergency_manual' }, 'take manual'],
    ['negation does not license an action', wayfarer, null, "please do not take the manual", { type: 'take', item: 'emergency_manual' }, 'take manual'],
  ]
  for (const [label, raw, room, line, action, rephrased] of cases) {
    for (const path of ['paraphrase', 'structured']) {
      it(`${label} through ${path}`, async () => {
        const world = loadWorld(raw)
        if (room) world.player_location = room
        const before = structuredClone(world)
        const reply = { kind: 'action', action, ...(path === 'paraphrase' ? { rephrased } : {}) }
        const turn = await takeTurn(world, line, { interpreter: answering(reply) })
        expect(turn.interpreter?.status).toBe('rejected')
        expect(turn.action).toBeNull()
        expect(turn.clarifying).toBe(true)
        expect(turn.events).toEqual([])
        expect(world).toEqual(before)
      })
    }
  }
})

describe('supported requests still work', () => {
  const cases = [
    ['can you grab the manual for me', null, { type: 'take', item: 'emergency_manual' }],
    ['please inspect the book', null, { type: 'examine', target: 'emergency_manual' }],
    ['what does that book say', null, { type: 'examine', target: 'emergency_manual' }],
    ['what am I carrying', null, { type: 'inventory' }],
    ['is anything making noise', null, { type: 'listen' }],
    ['can you describe this place', null, { type: 'look' }],
    ['could we head to the corridor', null, { type: 'go', direction: 'east' }],
    ['could you go to the crew quarters', 'corridor', { type: 'go', direction: 'west' }],
    ['can you grab the prybr', 'engine_room', { type: 'take', item: 'prybar' }],
    ['please open the crate with the prybar', 'cargo_bay', { type: 'use', item: 'prybar', target: 'supply_crate' }],
  ]
  for (const [line, room, action] of cases) it(line, async () => {
    const world = loadWorld(wayfarer)
    if (room) world.player_location = room
    if (action.item === 'prybar' && room === 'cargo_bay') world.items.prybar.location = 'inventory'
    const turn = await takeTurn(world, line, { interpreter: answering({ kind: 'action', action }) })
    expect(turn.interpreter.status).toBe('action')
    expect(clean(turn.action)).toEqual(action)
  })

  it('does not swap the roles of a tool and its target', () => {
    const world = loadWorld(wayfarer)
    world.player_location = 'cargo_bay'
    world.items.prybar.location = 'inventory'
    expect(isGrounded('please use prybar on crate', { type: 'use', item: 'supply_crate', target: 'prybar' }, world)).toBe(false)
  })

  it('routes back using actual previous location, not a model-selected bearing', async () => {
    const world = loadWorld(wayfarer)
    await takeTurn(world, 'east')
    expect(isGrounded('back the way I came', { type: 'go', direction: 'west' }, world)).toBe(true)
    expect(isGrounded('back the way I came', { type: 'go', direction: 'south' }, world)).toBe(false)
  })
})
