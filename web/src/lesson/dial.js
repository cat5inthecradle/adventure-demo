// The AI dial's settings, in order, with the words the lesson uses for them.
// `name` is the full label on the game's dial, `short` the one-word form used
// where space is tight, and `meaning` what the setting lets the AI do in the game.

export const DIAL = {
  off: { name: 'Off', short: 'Off', meaning: 'commands only' },
  understand: { name: 'Understand', short: 'Understand', meaning: 'the AI turns your words into commands' },
  fill_gaps: { name: 'Fill gaps', short: 'Fill gaps', meaning: "the AI writes when you didn't" },
  improvise: { name: 'Improvise', short: 'Improvise', meaning: 'the AI talks beyond your lines' },
  invent: { name: 'Invent', short: 'Invent', meaning: 'the AI decides what happens' },
}

export const DIAL_ORDER = Object.keys(DIAL)
