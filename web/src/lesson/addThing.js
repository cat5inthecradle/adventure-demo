// The lesson's one authoring move: add a thing to the starting room, or change
// the thing you added. Pure world-file edits; the form component only collects
// the three fields and hands the result to the game.

const TABLES = ['rooms', 'doors', 'items', 'npcs']

const slugify = name =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'thing'

/** Split what a student typed into "also called" into separate names. */
export function parseAliases(text, name = '') {
  const own = name.trim().toLowerCase()
  const seen = new Set()
  const out = []
  for (const part of String(text ?? '').split(/[,\n]/)) {
    const alias = part.trim().replace(/\s+/g, ' ').toLowerCase()
    if (!alias || alias === own || seen.has(alias)) continue
    seen.add(alias)
    out.push(alias)
  }
  return out
}

/** The thing the student added: the first item the starter world does not have. */
export function studentThing(definition, starter) {
  const original = starter?.items ?? {}
  return Object.values(definition?.items ?? {})
    .find(item => !Object.hasOwn(original, item.id)) ?? null
}

/**
 * A copy of `definition` with the student's thing added, or updated when `id`
 * names one that is already there. Throws an Error with a message a student can
 * act on when a field is missing; the world loader checks everything else.
 */
export function withThing(definition, { id = null, name, description, aliases = '', portable }) {
  const cleanName = String(name ?? '').trim().replace(/\s+/g, ' ')
  const cleanDescription = String(description ?? '').trim()
  if (!cleanName) throw new Error('Give your thing a name.')
  if (!cleanDescription) throw new Error('Write what a player sees when they examine it.')

  const world = structuredClone(definition)
  world.items ??= {}
  const wanted = [cleanName.toLowerCase(), ...parseAliases(aliases, cleanName)]
  for (const table of ['items', 'npcs', 'doors']) {
    for (const other of Object.values(world[table] ?? {})) {
      if (table === 'items' && other.id === id) continue
      const taken = [other.name, ...(other.aliases ?? [])].map(n => String(n).toLowerCase())
      const clash = wanted.find(n => taken.includes(n))
      if (clash) throw new Error(`The game already has something called “${clash}”. Pick a different name.`)
    }
  }
  let thingId = id
  if (!thingId || !Object.hasOwn(world.items, thingId)) {
    const used = new Set(TABLES.flatMap(table => Object.keys(world[table] ?? {})))
    const base = slugify(cleanName)
    thingId = base
    for (let n = 2; used.has(thingId); n++) thingId = `${base}_${n}`
  }

  world.items[thingId] = {
    location: world.player_location,
    portable: true,
    ...world.items[thingId],
    id: thingId,
    name: cleanName,
    aliases: parseAliases(aliases, cleanName),
    description: cleanDescription,
  }
  if (portable !== undefined) world.items[thingId].portable = Boolean(portable)
  return { world, id: thingId }
}
