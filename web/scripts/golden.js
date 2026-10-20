// Records what the engine says to two scripted sessions, for tests/golden.test.js.
//
//   npm run golden            rewrite tests/fixtures/golden.json
//   npm run golden -- <file>  write somewhere else (to compare before replacing)
//
// The golden test then fails on any change to what a player would see or hear,
// so a change to parsing, rules or prose is always a deliberate one: look at the
// diff of golden.json, and commit it with the change that caused it.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWorld } from '../src/engine/loader.js'
import { isParseError, parse } from '../src/engine/parser.js'
import { apply } from '../src/engine/engine.js'
import { Style, renderEvents, renderParseError } from '../src/engine/renderer.js'

const here = dirname(fileURLToPath(import.meta.url))
const worldFile = join(here, '../../worlds/wayfarer.json')
const out = process.argv[2] ?? join(here, '../tests/fixtures/golden.json')

const SCRIPTS = {
  // The designed solution, plus one look after the win.
  golden_path: [
    'go east', 'go south', 'take prybar', 'go north', 'go east',
    'use prybar on crate', 'take power cell', 'use power cell on droid',
    'talk to droid', 'go west', 'open door', 'go north', 'pull lever', 'look',
  ],
  // Everything else: typos, failures, routing, listening, ambiguity, empty input.
  wandering: [
    'look around', 'where am i', 'x manual', 'read manual', 'take manual', 'i',
    'listen', 'e', 'listen at door', 'open door', 'go north', 'enter pod',
    'go to cargo bay', 'go to engine room', 'go back', 'take reactor',
    'take prybar', 'opne crate', 'open teh crate using the prybar',
    'go to the cargo bay', 'take crate', 'use prybar on crate', 'take cell',
    'take power cell', 'take power cell', 'drop power cell', 'drop sandwich',
    'take droid', 'wake droid', 'talk to droid', 'xyzzy', 'take', '',
    'go sideways', 'take the thing', 'go to the crew quarters', 'examine console',
    'use console', 'take prybar', 'get in the pod', 'inventory',
    'pick up manual', 'put down manual', 'jump out the window',
    'use power cell on droid', 'take power cell', 'use power cell on droid',
    'talk to droid', 'talk to droid', 'w', 's', 'n', 'n', 'u', 'd',
  ],
}

// Optional fields are left out rather than recorded as null.
const clean = action => Object.fromEntries(Object.entries(action).filter(([, v]) => v != null))

const raw = JSON.parse(readFileSync(worldFile, 'utf8'))
const golden = {}
for (const [name, lines] of Object.entries(SCRIPTS)) {
  const world = loadWorld(raw)
  const steps = lines.map(line => {
    const parsed = parse(world, line)
    if (isParseError(parsed)) return { line, action: null, text: renderParseError(parsed), speech: null }
    const events = apply(world, parsed)
    return {
      line,
      action: clean(parsed),
      text: renderEvents(events, Style.TEXT, world.pronouns),
      speech: renderEvents(events, Style.SPEECH, world.pronouns),
    }
  })
  const { player_location, turn_count, outcome, flags, visited } = world
  golden[name] = { steps, final: { player_location, turn_count, outcome, flags, visited } }
}

writeFileSync(out, `${JSON.stringify(golden, null, 1)}\n`)
console.log(Object.fromEntries(Object.entries(golden).map(([k, v]) => [k, v.steps.length])), '->', out)
