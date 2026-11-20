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

  add('tokens', { title: 'Split into words', hint: 'Make it lowercase, drop the punctuation, split at the spaces.', tokens: first('normalize').tokens })

  const typos = first('typos')
  if (typos) {
    add('typos', {
      title: 'Fix typos',
      hint: `A word the game does not know is swapped for one of the ${typos.vocabularySize} words it does know here, but only when exactly one is close.`,
      fixes: typos.fixes,
    })
  }

  const verb = first('verb')
  if (verb) {
    add('verb', {
      title: 'Find the command word',
      hint: verb.phrase ? 'The game looks for a command it knows at the start of the line.' : 'The line does not start with a command the game knows.',
      verb,
    })
  }

  for (const s of trace) {
    if (s.stage === 'fillers') add('fillers', { title: 'Skip small words', hint: 'Words like “the” and “at” mean nothing to the game.', fillers: s })
    if (s.stage === 'split') add('split', { title: 'Split in two', hint: s.note ?? 'First the thing you use, then the thing you use it on.', split: s })
    if (s.stage === 'resolve') add('resolve', { title: `Look for “${s.phrase}”`, hint: 'Compare your words with the names of everything you can see or carry.', resolve: s })
    if (s.stage === 'route') add('route', { title: 'Plan a route', hint: 'Only through rooms you have walked. One step at a time.', route: s })
    if (s.stage === 'note') add('note', { title: 'Rule applied', hint: s.text })
  }

  const parsed = first('result')?.result
  add('parsed', { title: 'What the game understood', status: isParseError(parsed) ? 'fail' : 'ok', parsed })
  add('interp', { title: 'AI command interpretation', interp: turn.interpreter })

  if (turn.action) {
    add('action', { title: 'The command', hint: 'The one thing the game’s rules ever receive.', action: turn.action })
    add('events', { title: 'What happened', hint: 'Facts decided by the game’s rules, and by nothing else.', events: turn.events })
    add('changes', { title: 'What changed', hint: 'Every value this turn changed in the world.', changes: turn.changes })
  }

  if (turn.filled) {
    add('filled', {
      title: 'AI filled a gap',
      hint: 'The author never built this detail. The AI wrote words, and the world did not change.',
      filled: turn.filled,
    })
  }

  if (turn.improvised) {
    add('improvised', {
      title: 'AI improvised a reply',
      hint: 'The author never wrote this line. The AI wrote it in the character’s voice, and the world did not change.',
      improvised: turn.improvised,
    })
  }

  add('prose', { title: 'Write the reply', hint: 'What happened is turned into sentences on the screen.', text: turn.text })
  return out
}
