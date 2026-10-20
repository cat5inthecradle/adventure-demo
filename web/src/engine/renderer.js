// Renders events as screen-reader-friendly prose.
//
// Prose sentences only: no box drawing, no colour codes, no emoji, and never any
// reliance on layout to carry meaning. The renderer never invents facts — every noun
// it prints came from the world data inside an event — and never mutates.

import { Reason } from './events.js'
import { apply as applyPronouns } from './pronouns.js'

const FAILURE_TEXT = {
  [Reason.NO_EXIT]: "You can't go that way.",
  [Reason.DOOR_CLOSED]: 'The {name} is closed.',
  [Reason.DOOR_LOCKED]: "The {name} won't open.",
  [Reason.ALREADY_OPEN]: 'The {name} is already open.',
  [Reason.NOT_PRESENT]: "You don't see that here.",
  [Reason.NOT_PORTABLE]: "You can't take the {name}.",
  [Reason.ALREADY_CARRYING]: 'You already have the {name}.',
  [Reason.NOT_CARRYING]: "You aren't carrying that.",
  [Reason.NOT_OPENABLE]: "You can't open the {name}.",
  [Reason.NOTHING_HAPPENS]: 'Nothing happens.',
  [Reason.GAME_OVER]: 'The game is over. Start a new one to play again.',
}

const FAILURE_FALLBACK = {
  [Reason.DOOR_CLOSED]: 'It is closed.',
  [Reason.DOOR_LOCKED]: "It won't open.",
  [Reason.ALREADY_OPEN]: 'It is already open.',
  [Reason.NOT_PORTABLE]: "You can't take that.",
  [Reason.ALREADY_CARRYING]: 'You already have that.',
  [Reason.NOT_OPENABLE]: "You can't open that.",
}

export const DEFAULT_BANNER = {
  win: '*** You have escaped. THE END ***',
  loss: '*** You have died. THE END ***',
}

const NOTHING_TO_HEAR = 'You listen, and hear nothing you can make anything of.'

/** TEXT is skimmed by an eye; SPEECH is heard once, in order. Same facts. */
export const Style = Object.freeze({ TEXT: 'text', SPEECH: 'speech' })

/** One event, one block of prose. Pronoun tokens are substituted last. */
export function renderEvent(event, style = Style.TEXT, pronouns = null) {
  return applyPronouns(render(event, style), pronouns)
}

export function renderEvents(events, style = Style.TEXT, pronouns = null) {
  return events.map(e => renderEvent(e, style, pronouns)).join('\n\n')
}

function render(e, style) {
  switch (e.type) {
    case 'room_described':
      return style === Style.SPEECH ? roomAloud(e) : room(e)
    case 'game_ended': {
      const banner = e.banner || DEFAULT_BANNER[e.outcome]
      if (style === Style.SPEECH) return `${e.epilogue} ${banner.replace(/^[* ]+|[* ]+$/g, '')}.`
      return `${e.epilogue}\n\n${banner}`
    }
    case 'entity_examined': return e.description
    case 'moved': return e.message || `You head to the ${e.to_room.name}.`
    case 'item_taken': return `You take the ${e.item.name}.`
    case 'item_dropped': return `You put down the ${e.item.name}.`
    case 'door_opened': return e.message || `You open the ${e.door.name}.`
    case 'item_used': return e.message
    case 'npc_spoke': return e.text
    case 'narrated': return e.text
    case 'listened': return e.text || NOTHING_TO_HEAR
    case 'inventory_listed':
      return e.items.length ? `You are carrying ${join(e.items.map(i => i.name))}.` : 'You are carrying nothing.'
    case 'action_failed': return failure(e)
  }
  return ''
}

// Only the quoted half of a line of dialogue is the character talking. The
// lookarounds keep apostrophes inside words out of it.
const QUOTED = /"([^"]*)"|(?<![A-Za-z])'([^']*)'(?![A-Za-z])/g

/** Split dialogue into [voice, fragment] pairs: narration, then speech, then narration. */
export function splitQuoted(text) {
  const parts = []
  let cursor = 0
  for (const m of text.matchAll(QUOTED)) {
    const before = text.slice(cursor, m.index).trim()
    if (before) parts.push(['narrator', before])
    const spoken = (m[1] ?? m[2]).trim()
    if (spoken) parts.push(['npc', spoken])
    cursor = m.index + m[0].length
  }
  const tail = text.slice(cursor).trim()
  if (tail) parts.push(['narrator', tail])
  return parts.length ? parts : [['narrator', text]]
}

/** The spoken turn, split by who is talking, so a client can give the droid its own voice. */
export function renderSpeech(events, pronouns = null) {
  const parts = []
  for (const event of events) {
    const text = renderEvent(event, Style.SPEECH, pronouns)
    if (!text) continue
    if (event.type === 'npc_spoke') {
      for (const [voice, fragment] of splitQuoted(text)) {
        parts.push({ voice, speaker: voice === 'npc' ? event.npc.name : null, text: fragment })
      }
    } else {
      parts.push({ voice: 'narrator', speaker: null, text })
    }
  }
  return parts
}

/** Friendly, actionable text for input the dumb parser could not use. */
export function renderParseError(err) {
  switch (err.kind) {
    case 'unknown_verb': return `I don't know the word '${err.verb}'. Type 'help' for commands.`
    case 'unknown_noun': return `I don't see any '${err.noun}' here.`
    case 'ambiguous': return `Which do you mean: ${join((err.candidates ?? []).map(c => c.name), 'or')}?`
    case 'missing_noun': return `${titleCase(err.verb ?? '')} what?`
    case 'elsewhere': return `The ${err.noun} isn't here — you last saw it in the ${err.place}.`
    case 'no_route':
      return err.noun
        ? `You don't know a way to the ${err.noun} from here yet.`
        : "You don't know a way back from here."
    case 'empty': return "Please type a command, or 'help'."
  }
  return ''
}

function room(e) {
  const lines = [`== ${e.room.name} ==`, e.description]
  if (e.exits.length) {
    const parts = e.exits.map(x => x.door == null
      ? x.direction
      : `${x.direction} (through the ${x.door.name}, ${x.door_open ? 'open' : 'closed'})`)
    lines.push(`Exits: ${parts.join(', ')}.`)
  } else {
    lines.push('Exits: none.')
  }
  if (e.items.length) lines.push(`You see ${join(e.items.map(i => i.name))} here.`)
  for (const npc of e.npcs) lines.push(`${npc.name} is here.`)
  return lines.join('\n')
}

/** A room, spoken: no decoration, blocked ways as sentences, repeat visits abbreviated. */
function roomAloud(e) {
  const parts = [`${e.room.name}.`]
  if (e.first_visit && e.description) parts.push(e.description)
  const openWays = e.exits.filter(x => x.door == null || x.door_open).map(x => x.direction)
  if (openWays.length) parts.push(`You can go ${join(openWays, 'or')}.`)
  for (const x of e.exits) {
    if (x.door != null && !x.door_open) parts.push(`The ${x.door.name} to the ${x.direction} is closed.`)
  }
  if (!e.exits.length) parts.push('There is no way out of here.')
  if (e.items.length) parts.push(`You can see ${join(e.items.map(i => withArticle(i.name)))}.`)
  for (const npc of e.npcs) parts.push(`${capitalize(withArticle(npc.name))} is here.`)
  return parts.join(' ')
}

function withArticle(name) {
  if (name[0] && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) return name
  return `${'aeiou'.includes(name[0]?.toLowerCase()) ? 'an' : 'a'} ${name}`
}

// Lowercases the rest, so "A Maintenance Droid" reads "A maintenance droid".
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
const titleCase = s => s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase())

function failure(e) {
  if (e.message) return e.message
  const template = FAILURE_TEXT[e.reason]
  if (template.includes('{name}')) {
    if (e.subject == null) return FAILURE_FALLBACK[e.reason]
    return template.replace('{name}', e.subject.name)
  }
  return template
}

/** 'a', 'a and b', 'a, b and c'. */
export function join(names, conjunction = 'and') {
  if (!names.length) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names.at(-1)}`
}
