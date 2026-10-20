// What one turn changed in the world, as a flat list of leaf paths.
//
// Shown in the parser panel so a learner can see that "take prybar" is, underneath,
// nothing more than items.prybar.location going from "engine_room" to "inventory".

export function diffWorld(before, after, path = '', out = []) {
  if (Object.is(before, after)) return out
  const bothObjects = before && after && typeof before === 'object' && typeof after === 'object'
  if (!bothObjects || Array.isArray(before) !== Array.isArray(after)) {
    out.push({ path, from: before, to: after })
    return out
  }
  if (Array.isArray(before)) {
    // Lists of rules (interactions, triggers) are diffed per rule, so a fired
    // rule shows up as interactions[2].fired; lists of ids (visited) whole.
    const ofObjects = before.length === after.length && before.every(v => v && typeof v === 'object')
    if (ofObjects) {
      before.forEach((v, i) => diffWorld(v, after[i], `${path}[${i}]`, out))
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push({ path, from: before, to: after })
    }
    return out
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const key of keys) {
    diffWorld(before[key], after[key], path ? `${path}.${key}` : key, out)
  }
  return out
}
