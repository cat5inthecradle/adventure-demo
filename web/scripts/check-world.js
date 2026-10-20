// Checks a world file the way the game will when it loads it.
//
//   npm run check-world                          worlds/wayfarer.json
//   npm run check-world -- ../worlds/yours.json  any other world
//
// Prints what is wrong, by name, and exits non-zero — or a one-line summary.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWorld } from '../src/engine/loader.js'

const here = dirname(fileURLToPath(import.meta.url))
const file = process.argv[2] ? resolve(process.argv[2]) : join(here, '../../worlds/wayfarer.json')

let world
try {
  world = loadWorld(JSON.parse(readFileSync(file, 'utf8')))
} catch (err) {
  console.error(`That world file is not valid: ${err.message}`)
  process.exit(1)
}

const n = (things, one, many = `${one}s`) => {
  const count = Array.isArray(things) ? things.length : Object.keys(things).length
  return `${count} ${count === 1 ? one : many}`
}
console.log(`${world.title}: ${n(world.rooms, 'room')}, ${n(world.doors, 'door')}, `
  + `${n(world.items, 'item')}, ${n(world.npcs, 'person', 'people')}, `
  + `${n(world.interactions, 'interaction')}, ${n(world.triggers, 'trigger')} — loads cleanly.`)
