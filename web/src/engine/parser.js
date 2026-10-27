// The deliberately dumb, offline command parser: text -> Action or ParseError.
//
// Resolves names to entity ids against what the player can currently see. It never
// checks legality (a visible but non-portable item still parses into a take — the
// engine rejects it) and never mutates the world.
//
// Every decision it makes can be recorded into an optional `trace` array, which is
// what the parser panel draws. Tracing is observation only: parse() returns the same
// result with or without it.

import * as q from './queries.js'
import { Drop, Examine, Go, Listen, Look, Open, ShowInventory, Take, Talk, Traverse, Use } from './actions.js'

const PUNCTUATION = new Set(".,!?'\"")

// Nouns too generic to identify anything on their own.
export const GENERIC_TOKENS = new Set(['thing', 'things', 'stuff', 'one', 'item', 'object', 'it'])

// Words that mean "where I am" rather than any object in it.
export const SELF_TOKENS = new Set(['around', 'room', 'here', 'place', 'surroundings', 'everything'])

// In the vocabulary only so the typo fixer leaves them alone ("where" is one edit from "here").
const QUESTION_TOKENS = new Set(['where', 'what', 'whats', 'which', 'who', 'why', 'how', 'am', 'is', 'are', 'do'])

export const FILLERS = new Set(['the', 'a', 'an', 'to', 'at', 'on', 'in', 'with', 'up', 'that', 'this',
  'out', 'from', 'through', 'my', 'your'])

export const DIRECTIONS = {
  north: 'north', n: 'north',
  south: 'south', s: 'south',
  east: 'east', e: 'east',
  west: 'west', w: 'west',
  up: 'up', u: 'up',
  down: 'down', d: 'down',
}

// Verb phrases, matched longest-first against the head of the input.
const VERB_LIST = [
  ['look', 'look'], ['l', 'look'], ['look at', 'examine'],
  ['where am i', 'look'], ['where are we', 'look'],
  ['look under', 'examine'], ['look in', 'examine'], ['look inside', 'examine'],
  ['look behind', 'examine'], ['search', 'examine'], ['examine', 'examine'],
  ['check', 'examine'], ['x', 'examine'], ['inspect', 'examine'], ['read', 'examine'],
  ['go', 'go'], ['walk', 'go'], ['move', 'go'], ['head', 'go'],
  ['take', 'take'], ['get', 'take'], ['grab', 'take'], ['pick up', 'take'],
  ['drop', 'drop'], ['put down', 'drop'],
  ['open', 'open'], ['crack open', 'open'], ['unjam', 'open'], ['pry', 'open'],
  ['use', 'use'], ['slot', 'use'], ['yank', 'use'], ['fix', 'use'], ['turn on', 'use'],
  ['switch on', 'use'], ['pull', 'use'], ['push', 'use'], ['press', 'use'], ['put', 'use'],
  ['insert', 'use'], ['give', 'use'],
  ['listen', 'listen'], ['listen at', 'listen'], ['listen to', 'listen'],
  ['listen through', 'listen'], ['hear', 'listen'],
  // Going through a named portal: the player named the way through, not a bearing.
  ['enter', 'traverse'], ['exit', 'traverse'], ['board', 'traverse'], ['get in', 'traverse'],
  ['get into', 'traverse'], ['get out', 'traverse'], ['climb', 'traverse'], ['climb in', 'traverse'],
  ['climb into', 'traverse'], ['climb out', 'traverse'], ['climb out of', 'traverse'],
  ['climb through', 'traverse'], ['jump', 'traverse'], ['jump out', 'traverse'],
  ['jump out of', 'traverse'], ['jump through', 'traverse'], ['leap', 'traverse'],
  ['leap out', 'traverse'], ['leap out of', 'traverse'], ['leap through', 'traverse'],
  ['crawl', 'traverse'], ['crawl through', 'traverse'], ['squeeze through', 'traverse'],
  ['go through', 'traverse'], ['go out', 'traverse'], ['go out of', 'traverse'],
  ['talk to', 'talk'], ['talk', 'talk'], ['speak to', 'talk'], ['speak', 'talk'],
  ['ask', 'talk'], ['wake', 'talk'], ['wake up', 'talk'],
  ['inventory', 'inventory'], ['i', 'inventory'], ['inv', 'inventory'],
]
export const VERB_PHRASES = new Map(VERB_LIST)
const MAX_PHRASE_LEN = Math.max(...VERB_LIST.map(([p]) => p.split(' ').length))

// Prepositions that separate "use X on Y" (instrument first).
const USE_PREPOSITIONS = ['on', 'with', 'into', 'in', 'to']
// For opening verbs the operands are reversed: "open the crate WITH the prybar".
const INSTRUMENT_PREPOSITIONS = ['with', 'using']

/** A parse failure. kind: empty | unknown_verb | unknown_noun | ambiguous | missing_noun | no_route | elsewhere */
export function ParseError(kind, fields = {}) {
  return { parseError: true, kind, verb: null, noun: null, candidates: null, place: null, placeId: null, ...fields }
}
export const isParseError = r => r != null && r.parseError === true

/** Turn a line of terse player input into an Action, or explain why not. */
export function parse(world, text, trace = null) {
  const t = trace ? step => trace.push(step) : () => {}
  const p = new Parser(world, t)
  const result = p.run(text)
  t({ stage: 'result', result })
  return result
}

class Parser {
  constructor(world, trace) {
    this.world = world
    this.trace = trace
  }

  run(text) {
    const { world, trace } = this
    let tokens = normalize(text)
    trace({ stage: 'normalize', input: text, tokens })
    if (!tokens.length) return ParseError('empty')

    const vocabulary = buildVocabulary(world)
    const fixes = []
    tokens = fixTypos(tokens, vocabulary, fixes)
    trace({ stage: 'typos', tokens, fixes, vocabularySize: vocabulary.size })

    if (tokens[0] in DIRECTIONS) {
      trace({ stage: 'verb', phrase: [tokens[0]], kind: 'go', shortcut: 'direction', rest: tokens.slice(1) })
      return Go(DIRECTIONS[tokens[0]])
    }

    const match = matchVerb(tokens)
    if (!match) {
      trace({ stage: 'verb', phrase: null, tried: tokens.slice(0, MAX_PHRASE_LEN) })
      return ParseError('unknown_verb', { verb: tokens[0] })
    }
    const [phrase, kind] = match
    const verb = phrase.join(' ')
    const rest = tokens.slice(phrase.length)
    trace({ stage: 'verb', phrase, kind, rest })

    switch (kind) {
      case 'look': {
        const nouns = this.strip(rest)
        return nouns.length ? this.examine(nouns) : Look()
      }
      case 'examine': return this.withNoun(verb, rest, n => this.examine(n))
      case 'go': return this.go(verb, rest)
      case 'take': return this.withNoun(verb, rest, n => this.wrap(n, Take))
      case 'drop': return this.withNoun(verb, rest, n => this.wrap(n, Drop))
      case 'open': return this.openPhrase(verb, rest)
      case 'use': return this.use(verb, rest)
      case 'talk': return this.withNoun(verb, rest, n => this.wrap(n, Talk))
      case 'traverse': return this.withNoun(verb, rest, n => this.traverse(n))
      case 'listen': {
        const nouns = this.strip(rest)
        return nouns.length ? this.wrap(nouns, Listen) : Listen()
      }
      case 'inventory':
        // "i" is also how a sentence starts: "I want to check the console" is not
        // a request for the inventory. Words left over mean it was a sentence.
        if (this.strip(rest).length) {
          this.trace({ stage: 'note', text: `“${verb}” followed by more words reads as a sentence, not the inventory command.` })
          return ParseError('unknown_verb', { verb: tokens.slice(0, 2).join(' ') })
        }
        return ShowInventory()
    }
  }

  strip(tokens) {
    const kept = tokens.filter(tok => !FILLERS.has(tok))
    if (kept.length !== tokens.length) {
      this.trace({ stage: 'fillers', before: tokens, after: kept })
    }
    return kept
  }

  wrap(nouns, build) {
    const resolved = this.resolve(nouns)
    return isParseError(resolved) ? resolved : build(resolved)
  }

  withNoun(verb, rest, build) {
    const nouns = this.strip(rest)
    if (!nouns.length) return ParseError('missing_noun', { verb })
    return build(nouns)
  }

  examine(nouns) {
    if (nouns.every(n => SELF_TOKENS.has(n))) {
      this.trace({ stage: 'note', text: `“${nouns.join(' ')}” means where you are, so this is a look.` })
      return Look()
    }
    return this.wrap(nouns, Examine)
  }

  /** 'open X' opens; 'open X with Y' uses Y on X. */
  openPhrase(verb, rest) {
    let [targetTokens, instrumentTokens, prep] = splitOn(rest, INSTRUMENT_PREPOSITIONS)
    if (instrumentTokens == null) return this.withNoun(verb, rest, n => this.wrap(n, Open))
    this.trace({ stage: 'split', preposition: prep, left: targetTokens, right: instrumentTokens,
      note: 'Opening with a tool: the tool is used on the target.' })
    targetTokens = this.strip(targetTokens)
    instrumentTokens = this.strip(instrumentTokens)
    if (!targetTokens.length || !instrumentTokens.length) return ParseError('missing_noun', { verb })
    const target = this.resolve(targetTokens)
    if (isParseError(target)) return target
    const instrument = this.resolve(instrumentTokens)
    if (isParseError(instrument)) return instrument
    return Use(instrument, target)
  }

  /** Going through something implies going to it. */
  traverse(nouns) {
    const { world } = this
    const resolved = this.resolve(nouns)
    if (typeof resolved === 'string' && resolved in world.doors) return Traverse(resolved)
    if (isParseError(resolved)) {
      if (resolved.kind === 'elsewhere' && resolved.placeId != null) return this.stepToward(resolved.placeId)
      const roomId = this.resolveRoom(nouns)
      if (roomId != null) return this.stepToward(roomId)
      return resolved
    }
    this.trace({ stage: 'note', text: 'Not a door, so going “through” it means using it.' })
    return Use(resolved)
  }

  /** Directions are matched before fillers are stripped, so 'go up' survives. */
  go(verb, rest) {
    const { world } = this
    if (!rest.length) return ParseError('missing_noun', { verb })
    for (const tok of rest) {
      if (tok in DIRECTIONS) return Go(DIRECTIONS[tok])
    }
    const nouns = this.strip(rest)
    if (nouns.length === 1 && ['back', 'backwards', 'around'].includes(nouns[0])) {
      if (world.previous_location == null) return ParseError('no_route', { noun: 'back' })
      return this.stepToward(world.previous_location)
    }
    const roomId = nouns.length ? this.resolveRoom(nouns) : null
    if (roomId != null) return this.stepToward(roomId)
    return ParseError('unknown_noun', { noun: (nouns.length ? nouns : rest).join(' ') })
  }

  /** One step along the shortest route the player actually knows. */
  stepToward(roomId) {
    const { world } = this
    const name = world.rooms[roomId].name
    if (roomId === world.player_location) return ParseError('no_route', { noun: name })
    const direction = q.firstStepToward(world, roomId)
    this.trace({ stage: 'route', destination: name, direction })
    if (direction == null) return ParseError('no_route', { noun: name })
    return Go(direction)
  }

  /** Match a phrase against room names. */
  resolveRoom(tokens) {
    const rooms = Object.values(this.world.rooms)
    const phrase = tokens.join(' ')
    const exact = rooms.filter(r => phrase === r.name.toLowerCase())
    if (exact.length === 1) return exact[0].id
    const partial = rooms.filter(r => isSubset(tokens, new Set(r.name.toLowerCase().split(/\s+/))))
    return partial.length === 1 ? partial[0].id : null
  }

  use(verb, rest) {
    const { world } = this
    const [left, right, prep] = splitOn(rest, USE_PREPOSITIONS)
    if (right != null) this.trace({ stage: 'split', preposition: prep, left, right })
    const itemTokens = this.strip(left)
    if (!itemTokens.length) return ParseError('missing_noun', { verb })
    const item = this.resolve(itemTokens)
    if (isParseError(item)) return item
    if (right == null) {
      // "use the door" is how people say "open the door".
      if (item in world.doors) return Open(item)
      return Use(item)
    }
    const targetTokens = this.strip(right)
    if (!targetTokens.length) return ParseError('missing_noun', { verb })
    const target = this.resolve(targetTokens)
    if (isParseError(target)) return target
    return Use(item, target)
  }

  /** Match a noun phrase against everything the player can currently refer to. */
  resolve(tokens) {
    const { world } = this
    const phrase = tokens.join(' ')
    const candidates = q.visibleEntities(world)
    const generic = tokens.every(tok => GENERIC_TOKENS.has(tok))

    const exact = candidates.filter(e => phrase === e.name.toLowerCase()
      || e.aliases.some(a => a.toLowerCase() === phrase))
    let matches = exact
    let method = 'exact'
    if (!matches.length && !generic) {
      matches = candidates.filter(e => isSubset(tokens, entityTokens(e)))
      method = 'words'
    }

    const step = {
      stage: 'resolve',
      phrase,
      scope: candidates.map(e => ({ id: e.id, name: e.name, kind: q.kindOf(world, e.id) })),
      method: matches.length ? method : null,
      matches: matches.map(e => e.id),
      generic,
      result: null,
    }
    this.trace(step)

    if (!matches.length) {
      const isWanted = e => phrase === e.name.toLowerCase()
        || e.aliases.some(a => a.toLowerCase() === phrase)
        || (!generic && isSubset(tokens, entityTokens(e)))
      const found = q.locateInKnownRooms(world, isWanted)
      if (found) {
        const [entity, roomId] = found
        step.elsewhere = { id: entity.id, room: world.rooms[roomId].name }
        return (step.result = ParseError('elsewhere', {
          noun: entity.name, place: world.rooms[roomId].name, placeId: roomId,
        }))
      }
      return (step.result = ParseError('unknown_noun', { noun: phrase }))
    }
    if (matches.length > 1) {
      return (step.result = ParseError('ambiguous', { noun: phrase, candidates: matches.map(q.entityRef) }))
    }
    return (step.result = matches[0].id)
  }
}

/** Lowercase, drop punctuation, split on whitespace. */
export function normalize(text) {
  const cleaned = [...text.toLowerCase()].map(ch => (PUNCTUATION.has(ch) ? ' ' : ch)).join('')
  return cleaned.split(/\s+/).filter(Boolean)
}

function matchVerb(tokens) {
  for (let len = Math.min(MAX_PHRASE_LEN, tokens.length); len > 0; len--) {
    const phrase = tokens.slice(0, len)
    const kind = VERB_PHRASES.get(phrase.join(' '))
    if (kind) return [phrase, kind]
  }
  return null
}

function splitOn(tokens, prepositions) {
  for (let i = 1; i < tokens.length; i++) {
    if (prepositions.includes(tokens[i])) return [tokens.slice(0, i), tokens.slice(i + 1), tokens[i]]
  }
  return [tokens, null, null]
}

function isSubset(tokens, set) {
  return tokens.every(tok => set.has(tok))
}

/** Every word in an entity's name and aliases, lowercased. */
export function entityTokens(entity) {
  const words = entity.name.toLowerCase().split(/\s+/)
  for (const alias of entity.aliases) words.push(...alias.toLowerCase().split(/\s+/))
  return new Set(words)
}

// --- typo tolerance ----------------------------------------------------------
//
// A word already in the world's vocabulary is NEVER altered, and a correction must
// be unambiguous — if a token sits equally close to two known words we leave it.
// Short words get no slack, and correction targets must be at least three letters.

/** Every word this world expects a player to type, right here, right now. */
export function buildVocabulary(world) {
  const words = new Set([...FILLERS, ...Object.keys(DIRECTIONS), ...SELF_TOKENS, ...QUESTION_TOKENS])
  for (const phrase of VERB_PHRASES.keys()) for (const w of phrase.split(' ')) words.add(w)
  for (const e of q.visibleEntities(world)) for (const w of entityTokens(e)) words.add(w)
  for (const room of Object.values(world.rooms)) for (const w of room.name.toLowerCase().split(/\s+/)) words.add(w)
  return words
}

/** Short words get no slack: 'gem' and 'get' mean entirely different things. */
function typoBudget(word) {
  if (word.length <= 2) return 0
  if (word.length <= 5) return 1
  return 2
}

/** Optimal string alignment distance; an adjacent swap counts as one edit. */
export function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prevPrev = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i, ...new Array(b.length).fill(0)]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + cost)
      }
    }
    if (Math.min(...cur) > limit) return limit + 1
    prevPrev = prev
    prev = cur
  }
  return prev[b.length]
}

function isTransposition(a, b) {
  if (a.length !== b.length) return false
  const diff = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i)
  return diff.length === 2 && diff[1] === diff[0] + 1
    && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]
}

/**
 * Nudge unknown words toward known ones. The first token decides what the game
 * does, so a short one is only corrected by an adjacent swap ("wake" must never
 * quietly become "take").
 */
export function fixTypos(tokens, vocabulary, fixes = []) {
  return tokens.map((token, position) => {
    if (vocabulary.has(token)) return token
    const budget = typoBudget(token)
    if (budget === 0) return token
    let best = []
    let bestDistance = budget + 1
    for (const word of vocabulary) {
      if (word.length <= 2) continue
      const d = editDistance(token, word, budget)
      if (d < bestDistance) { best = [word]; bestDistance = d }
      else if (d === bestDistance) best.push(word)
    }
    let won = bestDistance <= budget && best.length === 1
    if (won && position === 0 && token.length <= 4 && !isTransposition(token, best[0])) won = false
    if (won) fixes.push({ from: token, to: best[0], distance: bestDistance })
    else if (bestDistance <= budget) fixes.push({ from: token, to: null, rejected: best.slice(0, 4) })
    return won ? best[0] : token
  })
}
