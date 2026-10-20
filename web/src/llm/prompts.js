// The prompts the WebLLM interpreter can use, by version. Plain functions from
// (utterance, context, transcript) to chat messages, with no WebLLM dependency,
// so the Benchmark view can show exactly what a model is sent without loading
// the runtime.

// --- prompt v1 ----------------------------------------------------------------
//
// Rules and a few inline examples in the system prompt; the scene and the
// player's words in one user message.

const V1_SYSTEM = `You translate a player's words in a text adventure into ONE game command.
Reply with a single JSON object and nothing else.

Commands:
  {"type":"look"}                          look around
  {"type":"inventory"}                     list what the player carries
  {"type":"go","direction":D}              walk north/south/east/west/up/down
  {"type":"examine","target":ID}           look closely at something
  {"type":"take","item":ID}                pick something up
  {"type":"drop","item":ID}                put down something carried
  {"type":"open","target":ID}              open a door or container
  {"type":"traverse","target":ID}          go through a door, hatch or pod
  {"type":"listen"} or {"type":"listen","target":ID}
  {"type":"use","item":ID} or {"type":"use","item":ID,"target":ID}
                                           use, pull, push, insert, give, put X in Y
  {"type":"talk","npc":ID}                 speak to someone
  {"type":"clarify","question":TEXT}       ask the player, when you cannot tell

Rules:
- IDs must be copied exactly from the lists below. Never invent one.
- Pick the single most likely command. Do not decide whether it will work; the game decides.
- If the player names a thing that is NOT in the lists, do not substitute something
  else. Use clarify and say briefly that you don't see it here.
- If the words fit nothing in the lists, use clarify with a short, friendly question.

Examples (from a different game — use the ids from the lists below, not these):
"grab that shiny key" -> {"type":"take","item":"brass_key"}
"stick the key in the lock" -> {"type":"use","item":"brass_key","target":"iron_door"}
"head out the east side" -> {"type":"go","direction":"east"}
"what am I holding" -> {"type":"inventory"}
"dance" -> {"type":"clarify","question":"Dancing won't help here. What do you want to do?"}
"take the lantern" (no lantern in the lists) -> {"type":"clarify","question":"I don't see a lantern here."}`

function describeContext(context, transcript) {
  const line = e => `  ${e.id}: ${e.name}${e.aliases.length ? ` (also: ${e.aliases.join(', ')})` : ''} [${e.kind}]`
  const parts = [
    `Room: ${context.roomName}`,
    `Exits: ${context.exits.map(d => (context.exitNames?.[d] ? `${d} (to ${context.exitNames[d]})` : d)).join(', ') || 'none'}`,
    ...(context.parserSaid ? [`The simple parser said: ${context.parserSaid}`] : []),
    'Things here:',
    ...(context.visible.length ? context.visible.map(line) : ['  nothing']),
    'Carrying:',
    ...(context.inventory.length ? context.inventory.map(line) : ['  nothing']),
  ]
  if (transcript.length) {
    parts.push('Recent turns:')
    for (const [said, reply] of transcript.slice(-3)) {
      parts.push(`  > ${said}`, `  ${reply.split('\n')[0].slice(0, 120)}`)
    }
  }
  return parts.join('\n')
}

// --- prompt v2 ----------------------------------------------------------------
//
// The same commands, but taught by demonstration: worked examples are real
// user/assistant turns in the exact layout the live question uses, which small
// instruct models imitate far more reliably than examples written into the
// system prompt. The parser's message is passed on only when it says a thing is
// absent — "I don't know the word 'stick'" told the model nothing useful.

const V2_SYSTEM = `You turn a player's words in a text adventure into ONE JSON command.

Commands:
  {"type":"look"}  {"type":"inventory"}  {"type":"listen"}
  {"type":"go","direction":"north|south|east|west|up|down"}
  {"type":"examine","target":ID}     {"type":"take","item":ID}     {"type":"drop","item":ID}
  {"type":"open","target":ID}        {"type":"traverse","target":ID}
  {"type":"use","item":ID}           {"type":"use","item":ID,"target":ID}
  {"type":"talk","npc":ID}           {"type":"clarify","question":TEXT}

Use only IDs from the "Here" and "Carrying" lists. If the player names something
not in those lists, answer with clarify. Reply with the JSON only.`

const DEMO_CONTEXT = `Room: Lighthouse Base
Exits: north (to Rocky Path), up
Here:
  brass_key: brass key (also: key) [item]
  iron_door: iron door (also: door) [door]
  keeper: old keeper (also: keeper, old man) [npc]
Carrying:
  lantern: oil lantern (also: lantern, lamp) [item]`

const DEMOS = [
  ['what have I got on me', { type: 'inventory' }],
  ['pocket the shiny key', { type: 'take', item: 'brass_key' }],
  ['try the key on the door', { type: 'use', item: 'brass_key', target: 'iron_door' }],
  ['what does the old guy look like', { type: 'examine', target: 'keeper' }],
  ['ask the old man about the storm', { type: 'talk', npc: 'keeper' }],
  ['set the lamp down', { type: 'drop', item: 'lantern' }],
  ['climb the stairs', { type: 'go', direction: 'up' }],
  ['walk back to the rocky path', { type: 'go', direction: 'north' }],
  ['light up the lamp', { type: 'use', item: 'lantern' }],
  ['grab the rope', { type: 'clarify', question: "I don't see a rope here." }],
  ['do a backflip', { type: 'clarify', question: "That won't help here. What do you want to do?" }],
  ['check this place out', { type: 'look' }],
  ['is anything making a sound', { type: 'listen' }],
]

function v2Context(context, transcript) {
  const line = e => `  ${e.id}: ${e.name}${e.aliases.length ? ` (also: ${e.aliases.join(', ')})` : ''} [${e.kind}]`
  const absent = context.parserSaid && /don't see|isn't here/.test(context.parserSaid)
  return [
    ...(transcript.length
      ? ['Just happened:', ...transcript.slice(-2).map(([said, reply]) => `  > ${said}: ${reply.split('\n')[0].slice(0, 100)}`)]
      : []),
    `Room: ${context.roomName}`,
    `Exits: ${context.exits.map(d => (context.exitNames?.[d] ? `${d} (to ${context.exitNames[d]})` : d)).join(', ') || 'none'}`,
    'Here:',
    ...(context.visible.length ? context.visible.map(line) : ['  nothing']),
    'Carrying:',
    ...(context.inventory.length ? context.inventory.map(line) : ['  nothing']),
    ...(absent ? [`Note: ${context.parserSaid}`] : []),
  ].join('\n')
}

// --- prompt v3 ----------------------------------------------------------------
//
// v2, plus a paraphrase first: every answer starts with "means", a few words on
// what the player wants, before the verb and ids. Committing to a verb first was
// v2's main failure — "stick the battery in the robot" became "use prybar". Two
// more two-object demos, because dropping the target was the other one.

const V3_SYSTEM = V2_SYSTEM.replace('Reply with the JSON only.',
  'Start every answer with "means": a few plain words saying what the player wants. Reply with the JSON only.')

const V3_DEMOS = [
  ['what have I got on me', 'list what I carry', { type: 'inventory' }],
  ['pocket the shiny key', 'pick up the brass key', { type: 'take', item: 'brass_key' }],
  ['try the key on the door', 'use the brass key on the iron door', { type: 'use', item: 'brass_key', target: 'iron_door' }],
  ['what does the old guy look like', 'look closely at the keeper', { type: 'examine', target: 'keeper' }],
  ['ask the old man about the storm', 'speak to the keeper', { type: 'talk', npc: 'keeper' }],
  ['set the lamp down', 'put down the lantern', { type: 'drop', item: 'lantern' }],
  ['hand the lamp to the old man', 'give the lantern to the keeper', { type: 'use', item: 'lantern', target: 'keeper' }],
  ['climb the stairs', 'go up', { type: 'go', direction: 'up' }],
  ['walk back to the rocky path', 'go north to the rocky path', { type: 'go', direction: 'north' }],
  ['light up the lamp', 'use the lantern', { type: 'use', item: 'lantern' }],
  ['bash the door with the lamp', 'use the lantern on the iron door', { type: 'use', item: 'lantern', target: 'iron_door' }],
  ['grab the rope', 'take a rope, but there is no rope here', { type: 'clarify', question: "I don't see a rope here." }],
  ['check this place out', 'look around the room', { type: 'look' }],
  ['is anything making a sound', 'listen', { type: 'listen' }],
  ['do a backflip', 'nothing in this scene', { type: 'clarify', question: "That won't help here. What do you want to do?" }],
]

/** The prompts the interpreter can use, by name — the bench compares them. */
export const PROMPTS = {
  v1: (utterance, context, transcript) => [
    { role: 'system', content: V1_SYSTEM },
    { role: 'user', content: `${describeContext(context, transcript)}\n\nPlayer says: "${utterance}"` },
  ],
  v2: (utterance, context, transcript) => [
    { role: 'system', content: V2_SYSTEM },
    ...DEMOS.flatMap(([said, answer], n) => [
      { role: 'user', content: `${n === 0 ? `${DEMO_CONTEXT}\n\n` : ''}Player says: "${said}"` },
      { role: 'assistant', content: JSON.stringify(answer) },
    ]),
    { role: 'user', content: `New scene.\n${v2Context(context, transcript)}\n\nPlayer says: "${utterance}"` },
  ],
  v3: (utterance, context, transcript) => [
    { role: 'system', content: V3_SYSTEM },
    ...V3_DEMOS.flatMap(([said, means, answer], n) => [
      { role: 'user', content: `${n === 0 ? `${DEMO_CONTEXT}\n\n` : ''}Player says: "${said}"` },
      { role: 'assistant', content: JSON.stringify({ means, ...answer }) },
    ]),
    { role: 'user', content: `New scene.\n${v2Context(context, transcript)}\n\nPlayer says: "${utterance}"` },
  ],
}

// Prompts whose answers open with a "means" paraphrase.
export const EXPLAINS = new Set(['v3'])
export const DEFAULT_PROMPT = 'v3'

/** One-line descriptions, for menus. */
export const PROMPT_LABELS = {
  v1: 'v1 · rules + inline examples',
  v2: 'v2 · worked example turns',
  v3: 'v3 · v2 + paraphrase first',
}
