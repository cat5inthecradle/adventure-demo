// One player turn, independent of how the player reached us.
//
// The routing is: dumb parser first, optional gap prose for an examined detail the
// author mentioned but did not build, then an optional interpreter only for lines
// the parser could not use, the engine always deciding what actually happens.
// Every stage is recorded into `trace`, which the parser panel draws, so a learner
// can watch a sentence become tokens, an action, events, and finally prose.
//
// Meta commands (help, save, undo) are not handled here — they are frontend
// concerns, and the engine only ever sees world mutations.

import { apply } from './engine.js'
import { findGap } from './gaps.js'
import { isParseError, parse } from './parser.js'
import { buildContext, validateResolution } from './interpreter.js'
import { Style, renderAction, renderEvents, renderParseError, renderSpeech } from './renderer.js'
import { findEntity } from './queries.js'

// Parse failures that mean "the thing you named is not here".
const ABSENT = new Set(['unknown_noun', 'elsewhere', 'ambiguous'])

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
      // grounds the words deterministically. Measured on the bench: 59% → 80%.
      if (answer.rephrased) {
        const trace = []
        const reread = parse(world, answer.rephrased, trace)
        result.interpreter.reread = { text: answer.rephrased, trace, result: reread }
        if (!isParseError(reread)) {
          result.interpreter.via = 'reread'
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
          result.interpreter.status = 'clarify'
          result.interpreter.via = 'reread'
          result.clarifying = true
          return say(result, renderParseError(reread))
        }
      }
      // If the player explicitly named something absent, a model action naming a
      // different visible entity is not a translation. Only a rephrasing that the
      // parser can ground may move past this error.
      if (proseGap) {
        result.interpreter.status = 'clarify'
        result.clarifying = true
        return say(result, renderParseError(parsed))
      }
      const action = validateResolution(context, answer.action)
      if (!action) {
        result.interpreter.status = 'rejected'
        result.clarifying = true
        return say(result, "I'm not sure what you mean. Could you say it another way?")
      }
      return finish(world, result, action)
    }
    case 'clarify':
      result.clarifying = true
      return say(result, answer.question)
    default: {
      const detail = (answer.detail || 'no detail').trim().split('\n')[0].slice(0, 80)
      return say(result, `${UNAVAILABLE(detail)}\n${renderParseError(parsed)}`)
    }
  }
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
