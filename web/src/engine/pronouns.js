// The player character's pronouns, and the prose that has to agree with them.
//
// Prose writes a token instead of a word — "{They} {are} still in the hold." — and
// this module turns it into "He is", "She is" or "They are" at render time, never at
// load time, so a player can change their mind mid-game and the next sentence obeys.
// Verb tokens are named after their they/them form so the template reads correctly
// on the page before it is ever substituted.

export const PLURAL = 'they'
export const DEFAULT = 'they'

const set = (id, label, subject, object, possessive, possessivePronoun, reflexive) => ({
  id, label, subject, object, possessive, possessivePronoun, reflexive,
  plural: id === PLURAL,
})

export const SETS = {
  he: set('he', 'he / him', 'he', 'him', 'his', 'his', 'himself'),
  she: set('she', 'she / her', 'she', 'her', 'her', 'hers', 'herself'),
  they: set('they', 'they / them', 'they', 'them', 'their', 'theirs', 'themselves'),
}

/** Accept an id, a set, or nothing, and always return a set. Unknown ids fall back. */
export function resolve(pronouns) {
  if (pronouns && typeof pronouns === 'object') return pronouns
  return SETS[pronouns || DEFAULT] ?? SETS[DEFAULT]
}

function words(pset) {
  const plural = pset.plural
  return {
    they: pset.subject,
    them: pset.object,
    their: pset.possessive,
    theirs: pset.possessivePronoun,
    themselves: pset.reflexive,
    s: plural ? '' : 's',
    es: plural ? '' : 'es',
    are: plural ? 'are' : 'is',
    were: plural ? 'were' : 'was',
    have: plural ? 'have' : 'has',
    do: plural ? 'do' : 'does',
  }
}

// Only word-shaped braces are candidates; JSON or coordinates are left alone.
const TOKEN = /\{([A-Za-z]+)\}/g

/** Substitute pronoun tokens in one string. Unknown tokens are left visible. */
export function apply(text, pronouns = null) {
  if (!text || !text.includes('{')) return text
  const table = words(resolve(pronouns))
  return text.replace(TOKEN, (match, token) => {
    const word = table[token.toLowerCase()]
    if (word === undefined) return match
    return token[0] === token[0].toUpperCase() && word
      ? word[0].toUpperCase() + word.slice(1)
      : word
  })
}

export const EXAMPLE = 'R-6 watches {them} go. {They} {are} already looking for {their} ship.'
