export function understandingSummary(turn) {
  if (!turn) return ''
  const changed = turn.changes?.length ? 'The world changed; Details shows exactly what changed.' : 'The world did not change.'
  if (turn.route === 'filled') return `AI wrote a description for a missing detail. It did not create an object. ${changed}`
  if (turn.route === 'improvised') return `AI invented this character’s reply. The words are not new game rules. ${changed}`
  const status = turn.interpreter?.status
  if (status === 'rejected') return `The game stopped an AI proposal it could not support. Read the question and name an action and object. ${changed}`
  if (status === 'clarify') return `The AI asked a question instead of choosing an action. ${changed}`
  if (status === 'unavailable') return `The AI could not answer. Try a short command, or use recorded examples in the lesson. ${changed}`
  if (status === 'unresolved') return `The AI reply did not resolve your request. Try naming an action and object. ${changed}`
  const failed = turn.events?.some(event => event.type === 'action_failed')
  if (turn.action) return `${status === 'action' ? 'The game accepted an AI interpretation.' : 'The game understood your command without AI interpretation.'} ${failed ? 'A game rule stopped the action; the reply explains why.' : 'The game rules produced the reply.'} ${changed}`
  if (turn.parseError?.kind === 'unknown_noun') return `The game could not find “${turn.parseError.noun}” among the objects it can use here. A name in the story does not always mean an object exists. ${changed}`
  return `The game could not resolve this command. Try “help” for command examples. ${changed}`
}
