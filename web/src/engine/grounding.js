// Check a model proposal against a conservative reading of the player's request.
// This is deliberately not another model: unsupported language asks for help.
// Both action and operands must agree, even for observation commands. Merely
// mentioning a verb, an item or a room never licenses an arbitrary action.
import { VERB_PHRASES, fixTypos, isParseError, normalize, parse } from './parser.js'

// These wrappers do not change intent. Keep this list narrow: stripping arbitrary
// words can turn "don't take the manual" into permission to take it.
const PREFIX = /^(?:please|can you|could you|would you|will you|can we|could we|i want to|i would like to|i would really like to|i need to|let us|lets|just)\s+/
const VERB_WORDS = new Set([...VERB_PHRASES.keys()].flatMap(phrase => phrase.split(' ')))
const SUFFIX = /\s+(?:please|for me|with me|closely|politely|thanks)$/

// Explicit phrase equivalents, not a bag of matching words. The parser still
// resolves every operand and computes the actual route from the current room.
const PHRASES = [
  ['take a look around', 'look'], ['take a look at', 'examine'],
  ['take a look', 'look'], ['check out', 'examine'],
  ['head over to', 'go'], ['make my way', 'go'], ['leave to', 'go'],
  ['return to', 'go'], ['back to', 'go'], ['go into', 'enter'],
  ['flip through', 'examine'], ['stare at', 'examine'], ['describe', 'examine'],
  ['get me', 'take'], ['gimme', 'take'], ['snag', 'take'], ['pocket', 'take'], ['lift', 'take'],
  ['scoop up', 'take'], ['chat with', 'talk to'], ['say hi to', 'talk to'],
  ['fire up', 'use'], ['stick', 'use'], ['plug', 'use'], ['launch', 'use'],
  ['let go of', 'drop'],
]

function requestText(line) {
  let text = normalize(String(line ?? '')).join(' ')
  // Negation and multiple commands need clarification rather than a partial
  // execution (the terse parser itself is outside this interpreter guard).
  if (/\b(?:not|never|don t|dont|instead|and|then|or)\b/.test(text)) return null
  while (PREFIX.test(text)) text = text.replace(PREFIX, '')
  while (SUFFIX.test(text)) text = text.replace(SUFFIX, '')
  if (/^(?:what am i carrying|what s in my pockets|whats in my pockets)$/.test(text)) return 'inventory'
  if (text === 'is anything making noise') return 'listen'
  if (text === 'back the way i came' || text === 'go back' || text === 'return') return 'go back'
  // Positional phrasal verbs preserve the operands and their roles.
  text = text.replace(/^put (.+) down$/, 'drop $1')
    .replace(/^pry (.+) open with (.+)$/, 'open $1 with $2')
    .replace(/^what(?: s|s| is) inside (.+)$/, 'examine $1')
  // Questions about a named object preserve the noun phrase intact.
  text = text.replace(/^what does (.+) say$/, 'examine $1')
    .replace(/^what is (.+) showing$/, 'examine $1')
    .replace(/^what(?: s|s| is) wrong with (.+)$/, 'examine $1')
    .replace(/^what(?: s|s| is) (.+) for$/, 'examine $1')
    .replace(/^what(?: s|s| is) (.+)$/, 'examine $1')
  for (const [phrase, command] of PHRASES) {
    if (text === phrase || text.startsWith(`${phrase} `)) {
      text = command + text.slice(phrase.length)
      break
    }
  }
  // Size/material adjectives do not choose a different named object. Unknown
  // nouns remain intact; 'red emergency light' cannot become a manual.
  text = text.replace(/\b(?:big|heavy|metal)\s+/g, '')
  // Allow the same unique typo correction for an unknown command word without
  // changing any named operands or replacing a real verb such as 'wake'.
  const words = text.split(' ')
  if (!VERB_WORDS.has(words[0])) words[0] = fixTypos(['please', words[0]], VERB_WORDS)[1]
  text = words.join(' ')
  // A trailing generic word adds no identity, but keep 'it' unresolved.
  return text.replace(/\s+thing$/, '')
}

const FIELDS = ['type', 'item', 'target', 'npc', 'direction']
const sameAction = (a, b) => FIELDS.every(key => (a[key] ?? null) === (b[key] ?? null))

/** True only when a deterministic reading supports this exact model action. */
export function isGrounded(line, action, world) {
  if (!action) return false
  const text = requestText(line)
  if (!text) return false
  const requested = parse(world, text)
  return !isParseError(requested) && sameAction(requested, action)
}
