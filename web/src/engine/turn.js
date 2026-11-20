// One player turn, independent of how the player reached us.
//
// The routing is: dumb parser first, optional improvised words for a character or
// gap prose for an examined detail the author did not write, then an optional
// interpreter only for lines the parser could not use, the engine always deciding
// what actually happens.
// Every stage is recorded into `trace`, which the parser panel draws, so a learner
// can watch a sentence become tokens, an action, events, and finally prose.
//
// Meta commands (help, save, undo) are not handled here — they are frontend
// concerns, and the engine only ever sees world mutations.

import { apply } from './engine.js'
import { findGap, findTopic } from './gaps.js'
import { isGrounded } from './grounding.js'
import { FILLERS, isParseError, normalize, parse } from './parser.js'
import { buildContext, validateResolution } from './interpreter.js'
import { Style, renderAction, renderEvents, renderParseError, renderSpeech } from './renderer.js'
import { findEntity } from './queries.js'

// Parse failures that mean "the thing you named is not here".
const ABSENT = new Set(['unknown_noun', 'elsewhere', 'ambiguous'])

// Said when the interpreter proposed an action the request does not support.
// Observation commands must preserve intent too.
const UNGROUNDED = "I couldn't verify that interpretation, so I won't guess. What do you want to do? Name an action and object, or a direction. Type 'help' for commands."

/** A model sometimes writes an entity's id ("nav_console") where its name belongs. */
function withNames(text, world) {
  let out = String(text)
  for (const table of [world.items, world.npcs, world.doors]) {
    for (const entity of Object.values(table ?? {})) {
      if (entity.id.includes('_')) out = out.replaceAll(entity.id, entity.name)
    }
  }
  return out
}

/** Throw away an interpreter action the player's words do not support, and ask instead. */
function refuseGuess(result, action) {
  result.interpreter.status = 'rejected'
  result.interpreter.refused = { reason: 'ungrounded', action }
  result.clarifying = true
  return say(result, UNGROUNDED)
}

const UNRESOLVED = "I couldn't resolve that request. Try naming an action and object, or a direction."

// Keep a useful missing-object message only when its noun actually occurs in
// the player's words. Otherwise avoid exposing fragments produced by reparsing.
function unresolvedReply(line, error) {
  const original = ` ${normalize(line).join(' ')} `
  const noun = error?.noun && normalize(error.noun).join(' ')
  return noun && original.includes(` ${noun} `) ? renderParseError(error) : UNRESOLVED
}

const UNAVAILABLE = detail =>
  `The language assistant is unavailable (${detail}). Classic commands still work — type 'help'.`

/**
 * Route one line of input and return what happened.
 *
 * @param world        mutated in place by the engine
 * @param line         what the player typed
 * @param interpreter  optional Interpreter (see interpreter.js); null = parser only
 * @param transcript   recent [line, response] pairs, for the interpreter
 * @param aiMode       off | understand | fill_gaps | improvise
 * @param style        optional tone and theme for AI-written prose
 * @param gapCache     optional room/detail cache for consistent prose
 */
export async function takeTurn(world, line, {
  interpreter = null,
  transcript = [],
  aiMode = 'understand',
  style = {},
  gapCache = null,
} = {}) {
  const parseTrace = []
  const parsed = parse(world, line, parseTrace)
  const result = {
    line,
    parseTrace,
    route: 'parser',
    action: null,
    parseError: null,
    interpreter: null,
    understood: null,     // "go down" — what the game took the player to mean, when not literal
    events: [],
    text: '',
    speechParts: [],
    outcome: null,
    clarifying: false,
  }

  if (!isParseError(parsed)) return finish(world, result, parsed)

  result.parseError = parsed
  if (aiMode === 'off') interpreter = null

  const topic = aiMode === 'improvise' ? findTopic(world, parsed, parseTrace) : null
  if (topic) {
    const improvised = await improvise(world, result, topic, parsed, line, interpreter, style, gapCache)
    if (improvised) return improvised
  }

  const canFill = aiMode === 'fill_gaps' || aiMode === 'improvise'
  const proseGap = findGap(world, parsed, parseTrace)
  const gap = canFill ? proseGap : null
  if (gap) {
    const filled = await fillGap(world, result, gap, parsed, interpreter, style, gapCache)
    if (filled) return filled
    // A prose gap is not permission for the interpreter to choose a different
    // real action. If it cannot write the detail, keep the parser's old answer.
    result.route = 'unresolved'
    result.interpreter = { status: 'skipped' }
    return say(result, renderParseError(parsed))
  }

  if (!interpreter) {
    result.route = 'unresolved'
    result.interpreter = { status: 'skipped' }
    return say(result, renderParseError(parsed))
  }

  const context = { ...buildContext(world), parserSaid: renderParseError(parsed) }
  const started = performance.now()
  let answer
  try {
    answer = await interpreter.interpret(line, context, transcript)
  } catch (err) {
    answer = { kind: 'unavailable', detail: String(err?.message ?? err) }
  }
  result.route = 'interpreter'
  result.interpreter = {
    status: answer.kind,
    name: interpreter.name,
    context,
    answer,
    ms: Math.round(performance.now() - started),
  }

  switch (answer.kind) {
    case 'action': {
      // A plain-English rephrasing goes back through the parser before the model's
      // own action is trusted. Small models often say the right thing in words
      // ("look at the status console") and then pick the wrong verb; the parser
      // resolves the words deterministically. The request check below must also
      // agree; a valid paraphrase alone is not evidence of the player's intent.
      if (answer.rephrased) {
        const trace = []
        const rephrased = withNames(answer.rephrased, world)
        const reread = parse(world, rephrased, trace)
        result.interpreter.reread = { text: rephrased, trace, result: reread }
        if (!isParseError(reread)) {
          result.interpreter.via = 'reread'
          if (!isGrounded(line, reread, world)) return refuseGuess(result, reread)
          return finish(world, result, reread)
        }
        const rereadGap = canFill ? findGap(world, reread, trace) : null
        if (rereadGap) {
          const filled = await fillGap(world, result, rereadGap, reread, interpreter, style, gapCache)
          if (filled) return filled
        }
        // The paraphrase names something that is not here: say so, rather than
        // let the model's forced choice of a visible id stand in for it.
        if (ABSENT.has(reread.kind)) {
          result.interpreter.status = 'unresolved'
          result.interpreter.via = 'reread'
          return say(result, unresolvedReply(line, parsed))
        }
      }
      // If the player explicitly named something absent, a model action naming a
      // different visible entity is not a translation. Only a rephrasing that the
      // parser can ground may move past this error.
      if (proseGap) {
        result.interpreter.status = 'unresolved'
        return say(result, unresolvedReply(line, parsed))
      }
      const action = validateResolution(context, answer.action)
      if (!action) {
        result.interpreter.status = 'rejected'
        result.clarifying = true
        return say(result, "I'm not sure what you mean. Could you say it another way?")
      }
      if (!isGrounded(line, action, world)) return refuseGuess(result, action)
      return finish(world, result, action)
    }
    case 'clarify':
      // A model can put a statement in its question field. Preserve the text,
      // but do not tell the lesson that a question was asked.
      result.clarifying = typeof answer.question === 'string' && answer.question.includes('?')
      if (!result.clarifying) result.interpreter.status = 'unresolved'
      return say(result, answer.question)
    default: {
      const detail = (answer.detail || 'no detail').trim().split('\n')[0].slice(0, 80)
      return say(result, `${UNAVAILABLE(detail)}\n${unresolvedReply(line, parsed)}`)
    }
  }
}

async function improvise(world, result, topic, parseError, line, interpreter, style, gapCache) {
  const topicWords = topic.topic.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const normalized = topicWords.filter(word => !FILLERS.has(word)).join(' ')
  const cacheKey = `npc:${topic.npc}:${normalized}`
  const cached = gapCache?.get(cacheKey)
  const character = world.npcs[topic.npc]
  const npc = {
    id: character.id,
    name: character.name,
    description: character.description,
    lines: character.dialogue.map(rule => rule.text),
  }
  const context = { ...buildContext(world), parserSaid: renderParseError(parseError) }
  const requestedStyle = { tone: style?.tone ?? null, theme: style?.theme ?? null }
  let answer = cached == null ? null : { kind: 'text', text: cached }

  if (!answer && interpreter?.speak) {
    try {
      answer = await interpreter.speak({ npc, topic: topic.topic, line, context, style: requestedStyle })
    } catch {
      return null
    }
  }
  if (answer?.kind !== 'text' || !answer.text?.trim()) return null

  const reply = answer.text.trim()
  if (cached == null && gapCache) gapCache.set(cacheKey, reply)
  // A proper name stands alone; a common noun gets an article: “Mira says”, “The droid says”.
  const speaker = /^\p{Lu}/u.test(character.name) ? character.name : `The ${character.name}`
  const text = `${speaker} says, '${reply}'`
  result.route = 'improvised'
  result.action = null
  result.events = []
  result.aiWritten = true
  result.improvised = {
    npc: topic.npc,
    character: character.name,
    topic: topic.topic,
    text: reply,
    name: interpreter?.name,
    meta: answer.meta,
  }
  result.text = text
  result.speechParts = [
    { voice: 'narrator', speaker: null, text: `${speaker} says,` },
    { voice: 'npc', speaker: character.name, text: reply },
  ]
  return result
}

async function fillGap(world, result, gap, parseError, interpreter, style, gapCache) {
  const lastWord = gap.noun.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.at(-1)
  const cacheKey = lastWord ? `${world.player_location}:${lastWord}` : null
  const cached = cacheKey == null ? undefined : gapCache?.get(cacheKey)
  const context = { ...buildContext(world), parserSaid: renderParseError(parseError) }
  const requestedStyle = { tone: style?.tone ?? null, theme: style?.theme ?? null }
  let answer = cached == null ? null : { kind: 'text', text: cached }

  if (!answer && interpreter?.describe) {
    try {
      answer = await interpreter.describe({ noun: gap.noun, context, style: requestedStyle })
    } catch {
      return null
    }
  }
  if (answer?.kind !== 'text' || !answer.text?.trim()) return null

  const text = answer.text.trim()
  if (cached == null && cacheKey != null && gapCache) gapCache.set(cacheKey, text)
  result.route = 'filled'
  result.action = null
  result.events = []
  result.aiWritten = true
  result.filled = {
    noun: gap.noun,
    text,
    name: interpreter?.name,
    meta: answer.meta,
  }
  return say(result, text)
}

function say(result, text) {
  result.text = text
  result.speechParts = [{ voice: 'narrator', speaker: null, text }]
  return result
}

/**
 * Whether the player should be told what the game took them to mean. Yes when
 * the words were not taken literally — a language model interpreted them, a
 * typo was corrected, or "go to <room>" became one step of a route — because
 * otherwise a reply like "You can't go that way." leaves them guessing which
 * way. A plain "take prybar" needs no echo.
 */
function needsEcho(result) {
  if (result.route === 'interpreter') return true
  return result.parseTrace.some(s => (s.stage === 'typos' && s.fixes.some(f => f.to))
    || s.stage === 'route')
}

function finish(world, result, action) {
  // Named before the engine runs, while every entity is still where the player saw it.
  if (needsEcho(result)) {
    result.understood = renderAction(action, id => findEntity(world, id)?.name)
  }
  const events = apply(world, action)
  const endings = events.filter(e => e.type === 'game_ended')
  result.action = action
  result.events = events
  result.text = renderEvents(events, Style.TEXT, world.pronouns)
  result.speechParts = renderSpeech(events, world.pronouns)
  result.outcome = endings.length ? endings.at(-1).outcome : null
  return result
}
