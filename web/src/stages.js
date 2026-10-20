// The phases one turn went through, in order, as the parser panel draws them.
//
// Shared by the panel (to draw them) and the game session (to pace their reveal),
// so the two always agree on how many phases a turn has.

import { isParseError } from './engine/parser.js'

export function buildStages(turn) {
  if (!turn) return []
  const trace = turn.parseTrace
  const first = stage => trace.find(s => s.stage === stage)
  const out = []
  const add = (kind, fields) => out.push({ key: `${kind}${out.length}`, kind, ...fields })

  add('tokens', { title: 'Tokenize', hint: 'Lowercase, strip punctuation, split on spaces.', tokens: first('normalize').tokens })

  const typos = first('typos')
  if (typos) {
    add('typos', {
      title: 'Fix typos',
      hint: `Unknown words are nudged toward the ${typos.vocabularySize} words this room knows — only when exactly one is close.`,
      fixes: typos.fixes,
    })
  }

  const verb = first('verb')
  if (verb) {
    add('verb', {
      title: 'Match verb',
      hint: verb.phrase ? 'The longest known verb phrase at the start wins.' : 'No known verb phrase starts this sentence.',
      verb,
    })
  }

  for (const s of trace) {
    if (s.stage === 'fillers') add('fillers', { title: 'Drop filler words', hint: 'Words like “the” and “at” carry no meaning for the game.', fillers: s })
    if (s.stage === 'split') add('split', { title: 'Split on preposition', hint: s.note ?? 'Instrument first, then what it is used on.', split: s })
    if (s.stage === 'resolve') add('resolve', { title: `Resolve “${s.phrase}”`, hint: 'Match the words against everything you can see or carry.', resolve: s })
    if (s.stage === 'route') add('route', { title: 'Plan a route', hint: 'Only through rooms you have walked. One step at a time.', route: s })
    if (s.stage === 'note') add('note', { title: 'Rule applied', hint: s.text })
  }

  const parsed = first('result')?.result
  add('parsed', { title: 'Parser result', status: isParseError(parsed) ? 'fail' : 'ok', parsed })
  add('interp', { title: 'Interpreter', interp: turn.interpreter })

  if (turn.action) {
    add('action', { title: 'Action', hint: 'The only thing the engine ever receives.', action: turn.action })
    add('events', { title: 'Engine events', hint: 'Structured facts. The engine decides; nothing else does.', events: turn.events })
    add('changes', { title: 'World changes', hint: 'Every value this turn changed in the world state.', changes: turn.changes })
  }

  add('prose', { title: 'Render', hint: 'The renderer turns events into sentences on the main screen.', text: turn.text })
  return out
}
