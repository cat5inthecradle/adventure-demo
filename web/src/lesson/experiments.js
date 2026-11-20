// Captured in Drift with Qwen2.5 1.5B, 2026-11-17. Source:
// docs/playtests/second-opinion/2026-11-17-maya.md, tables 3 and 4.
// These are historical observations, never responses to a player's live input.
export const EXPERIMENTS = {
  9006: [
    { id: 'interpret', title: 'A request becomes a command', question: 'What action and object did the AI propose? What did the game do?',
      recorded: 'Request: can you grab the prybar for me\nAI proposal: take the prybar\nGame reply: You take the prybar.\nEvidence: the prybar moved from the cockpit to inventory; turn 0 → 1.' },
    { id: 'boundary', title: 'A guess meets a boundary', question: 'Who stopped this proposal? What evidence shows whether the world changed?',
      recorded: "Request: fly to the moon\nAI proposal: go south\nGame reply: What do you want to do? I can't do that here, and I won't guess. Type 'help' to see the commands I know.\nEvidence: the game rejected the proposal; the player did not move." },
  ],
  9007: [
    { id: 'compare', title: 'Compare Off and Understand', question: 'Did either setting carry out the request? How can you tell? Two unsuccessful replies are a valid result.',
      recorded: "Same request: could you get me the prybar\nOff: I don't know the word 'could'. Type 'help' for commands.\nUnderstand: Could you get me the prybar?\nEvidence: the AI returned a clarification question. Neither attempt took the prybar." },
    { id: 'scenery', title: 'Words without an object', question: 'What did the AI add? Does this evidence show a new object in the world?',
      recorded: "Fill gaps request: examine the mug\nAI wrote this: You find the forgotten coffee mug, its handle cool and smooth.\nEvidence: the inspector showed a missing mug and no world changes. The text did not create an object. An empty inventory alone would not prove that." },
    { id: 'dialogue', title: 'A character invents a line', question: 'Which words were generated? What would you check before trusting the character?',
      recorded: "In the Cargo Bay, Improvise request: ask the droid about the ship\nAI wrote this: The maintenance droid says, 'The ship is alright, but it's not what I'm here for.'\nEvidence: the inspector showed improvised dialogue and no world changes. A later look still showed the crate and droid." },
  ],
}

export function summarizeTurn(turn) {
  return `Request: ${turn.input ?? turn.line ?? ''}\nReply: ${turn.text}\nProposed command: ${turn.understood ?? JSON.stringify(turn.interpreter?.refused?.action ?? turn.action) ?? 'none'}\nAI interpretation: ${turn.interpreter?.status ?? 'not used'}\nReply route: ${turn.route}\nWorld changes: ${turn.changes?.length ? turn.changes.map(c => `${c.path}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`).join('; ') : 'none'}`
}
