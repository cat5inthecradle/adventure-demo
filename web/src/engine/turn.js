// One player turn, independent of how the player reached us.
//
// The routing is: dumb parser first, an optional interpreter only for lines the
// parser could not use, the engine always deciding what actually happens. Every
// stage is recorded into `trace`, which the parser panel draws, so a learner can
// watch a sentence become tokens, an action, events, and finally prose.
//
// Meta commands (help, save, undo) are not handled here — they are frontend
// concerns, and the engine only ever sees world mutations.

import { apply } from './engine.js'
import { isParseError, parse } from './parser.js'
import { buildContext, validateResolution } from './interpreter.js'
import { Style, renderEvents, renderParseError, renderSpeech } from './renderer.js'

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
 */
export async function takeTurn(world, line, { interpreter = null, transcript = [] } = {}) {
  const parseTrace = []
  const parsed = parse(world, line, parseTrace)
  const result = {
    line,
    parseTrace,
    route: 'parser',
    action: null,
    parseError: null,
    interpreter: null,
    events: [],
    text: '',
    speechParts: [],
    outcome: null,
    clarifying: false,
  }

  if (!isParseError(parsed)) return finish(world, result, parsed)

  result.parseError = parsed
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
        // The paraphrase names something that is not here: say so, rather than
        // let the model's forced choice of a visible id stand in for it.
        if (ABSENT.has(reread.kind)) {
          result.interpreter.status = 'clarify'
          result.interpreter.via = 'reread'
          result.clarifying = true
          return say(result, renderParseError(reread))
        }
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

function say(result, text) {
  result.text = text
  result.speechParts = [{ voice: 'narrator', speaker: null, text }]
  return result
}

function finish(world, result, action) {
  const events = apply(world, action)
  const endings = events.filter(e => e.type === 'game_ended')
  result.action = action
  result.events = events
  result.text = renderEvents(events, Style.TEXT, world.pronouns)
  result.speechParts = renderSpeech(events, world.pronouns)
  result.outcome = endings.length ? endings.at(-1).outcome : null
  return result
}
