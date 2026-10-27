// The World Builder's blocks, as plain data — no Blockly import here, so the
// converter and its tests can share these names without loading Blockly.
//
// Field types are Blockly's, plus two of ours that blocks.js expands:
//   { type: 'field_ref', kind, none? }  a dropdown of things in the world, by name
//                                       (kind: room | item | npc | door | entity | place)
//   { type: 'field_flag' } / { type: 'field_counter' }  a Blockly variable of that type
//
// A block that defines a room, door, thing, character or rule keeps its world id
// in block.data, so a student never types an id and renaming never breaks a link.

export const COLOURS = {
  world: '#1F1976',
  places: '#0B6FB5',
  things: '#C25200',
  people: '#B3145A',
  rules: '#4C42CF',
  conditions: '#2E7D32',
  effects: '#6A3D9A',
}

const ml = name => ({ type: 'field_multilinetext', name, text: '' })
const text = (name, value = '') => ({ type: 'field_input', name, text: value })
const ref = (name, kind, none) => ({ type: 'field_ref', name, kind, ...(none ? { none } : {}) })
const flag = name => ({ type: 'field_flag', name })
const counter = name => ({ type: 'field_counter', name })
const check = (name, checked = false) => ({ type: 'field_checkbox', name, checked })
const choose = (name, options) => ({ type: 'field_dropdown', name, options })
const statements = (name, check) => ({ type: 'input_statement', name, check })

export const BLOCKS = [
  // --- the story --------------------------------------------------------------
  {
    type: 'world',
    message0: 'Story %1',
    args0: [text('TITLE', 'My adventure')],
    message1: 'the player starts in %1',
    args1: [ref('START', 'room')],
    message2: 'refer to the player as %1',
    args2: [choose('PRONOUNS', [['they / them', 'they'], ['she / her', 'she'], ['he / him', 'he']])],
    message3: 'opening words %1',
    args3: [ml('INTRO')],
    message4: 'winning words %1',
    args4: [ml('WIN')],
    colour: COLOURS.world,
    tooltip: 'The whole story: what it’s called, where it begins, and its first and last words.',
  },

  // --- places -----------------------------------------------------------------
  {
    type: 'room',
    message0: 'Room %1',
    args0: [text('NAME', 'new room')],
    message1: 'description %1',
    args1: [ml('DESCRIPTION')],
    message2: 'sounds %1',
    args2: [ml('SOUNDS')],
    message3: 'exits %1',
    args3: [statements('EXITS', 'Exit')],
    message4: 'changes %1',
    args4: [statements('ALT', 'RoomAlt')],
    colour: COLOURS.places,
    tooltip: 'A place the player can stand. Add exits to connect it to other rooms.',
  },
  {
    type: 'exit',
    message0: 'go %1 to %2 through %3',
    args0: [
      choose('DIR', [['north', 'north'], ['south', 'south'], ['east', 'east'], ['west', 'west'], ['up', 'up'], ['down', 'down']]),
      ref('TO', 'room'),
      ref('DOOR', 'door', '(no door)'),
    ],
    message1: 'say on the way %1',
    args1: [ml('MESSAGE')],
    previousStatement: 'Exit',
    nextStatement: 'Exit',
    colour: COLOURS.places,
    tooltip: 'A way out of this room. Exits go one way: add one in the other room to come back.',
  },
  {
    type: 'room_alt',
    message0: 'once %1 is true',
    args0: [flag('FLAG')],
    message1: 'describe it as %1',
    args1: [ml('DESCRIPTION')],
    message2: 'and it sounds like %1',
    args2: [ml('SOUNDS')],
    previousStatement: 'RoomAlt',
    colour: COLOURS.places,
    tooltip: 'A second description, used once a flag is true — the lights come back on.',
  },
  {
    type: 'door',
    message0: 'Door %1',
    args0: [text('NAME', 'new door')],
    message1: 'also called %1',
    args1: [text('ALIASES')],
    message2: 'description %1',
    args2: [ml('DESCRIPTION')],
    message3: 'starts %1',
    args3: [choose('OPEN', [['closed', 'closed'], ['open', 'open']])],
    message4: 'lock %1',
    args4: [statements('LOCK', 'Lock')],
    message5: 'if it won’t open, say %1',
    args5: [ml('LOCKED_MSG')],
    message6: 'when it opens, say %1',
    args6: [ml('OPEN_MSG')],
    colour: COLOURS.places,
    tooltip: 'Something an exit can pass through. Use it in an exit’s “through” slot.',
  },
  {
    type: 'lock_until',
    message0: 'locked until %1 is true',
    args0: [flag('FLAG')],
    previousStatement: 'Lock',
    colour: COLOURS.places,
    tooltip: 'The door opens normally once this flag is true.',
  },
  {
    type: 'lock_fixed',
    message0: 'locked — only a rule can unlock it',
    previousStatement: 'Lock',
    colour: COLOURS.places,
    tooltip: 'Stays locked until a rule changes it with a “make door unlocked” block.',
  },

  // --- things -----------------------------------------------------------------
  {
    type: 'item',
    message0: 'Thing %1',
    args0: [text('NAME', 'new thing')],
    message1: 'also called %1',
    args1: [text('ALIASES')],
    message2: 'description %1',
    args2: [ml('DESCRIPTION')],
    message3: 'starts %1',
    args3: [ref('LOCATION', 'place')],
    message4: 'can be picked up %1',
    args4: [check('PORTABLE', true)],
    message5: 'changes %1',
    args5: [statements('ALT', 'ItemAlt')],
    message6: 'if someone tries to open it, say %1',
    args6: [ml('REFUSAL')],
    message7: 'unless they carry %1',
    args7: [statements('REFUSAL_WITH', 'RefusalWith')],
    colour: COLOURS.things,
    tooltip: 'An object in the world. Things that can’t be picked up are scenery.',
  },
  {
    type: 'item_alt',
    message0: 'once %1 is true',
    args0: [flag('FLAG')],
    message1: 'describe it as %1',
    args1: [ml('DESCRIPTION')],
    previousStatement: 'ItemAlt',
    colour: COLOURS.things,
  },
  {
    type: 'refusal_with',
    message0: '%1 then say %2',
    args0: [ref('ITEM', 'item'), ml('MESSAGE')],
    previousStatement: 'RefusalWith',
    nextStatement: 'RefusalWith',
    colour: COLOURS.things,
    tooltip: 'A sharper hint once the player is carrying the right tool.',
  },

  // --- people -----------------------------------------------------------------
  {
    type: 'npc',
    message0: 'Character %1',
    args0: [text('NAME', 'new character')],
    message1: 'also called %1',
    args1: [text('ALIASES')],
    message2: 'description %1',
    args2: [ml('DESCRIPTION')],
    message3: 'starts in %1',
    args3: [ref('LOCATION', 'room')],
    message4: 'follows the player %1',
    args4: [check('FOLLOWS')],
    message5: 'when talked to %1',
    args5: [statements('SAYS', 'Says')],
    colour: COLOURS.people,
    tooltip: 'Someone to talk to. “starts in” is where they begin; a rule can move them later. The first “says” whose conditions hold is the one used.',
  },
  {
    type: 'says',
    message0: 'only if %1',
    args0: [statements('IF', 'Condition')],
    message1: 'say %1',
    args1: [ml('TEXT')],
    message2: 'only once %1',
    args2: [check('ONCE')],
    message3: 'then %1',
    args3: [statements('THEN', 'Effect')],
    previousStatement: 'Says',
    nextStatement: 'Says',
    colour: COLOURS.people,
    tooltip: 'One thing a character can say. Put the most specific first and a catch-all last.',
  },

  // --- rules ------------------------------------------------------------------
  {
    type: 'use_rule',
    message0: 'When the player uses %1 on %2',
    args0: [ref('ITEM', 'entity'), ref('TARGET', 'entity', '(nothing)')],
    message1: 'only if %1',
    args1: [statements('IF', 'Condition')],
    message2: 'say %1',
    args2: [ml('MESSAGE')],
    message3: 'only once %1',
    args3: [check('ONCE')],
    message4: 'then %1',
    args4: [statements('THEN', 'Effect')],
    colour: COLOURS.rules,
    tooltip: 'What happens when the player uses something — “use prybar on crate”, “pull lever”.',
  },
  {
    type: 'trigger_rule',
    message0: '%1',
    args0: [choose('WHEN', [['When the player enters a room', 'enter'], ['Every turn', 'turn']])],
    message1: 'only if %1',
    args1: [statements('IF', 'Condition')],
    message2: 'say %1',
    args2: [ml('TEXT')],
    message3: 'only once %1',
    args3: [check('ONCE')],
    message4: 'then %1',
    args4: [statements('THEN', 'Effect')],
    colour: COLOURS.rules,
    tooltip: 'Something the world does on its own. Add “the player is in” to say where.',
  },

  // --- conditions -------------------------------------------------------------
  {
    type: 'cond_flag',
    message0: '%1 is %2',
    args0: [flag('FLAG'), choose('VALUE', [['true', 'true'], ['false', 'false']])],
    previousStatement: 'Condition',
    nextStatement: 'Condition',
    colour: COLOURS.conditions,
  },
  {
    type: 'cond_counter',
    message0: '%1 is %2 %3',
    args0: [counter('COUNTER'), choose('OP', [['at least', 'at_least'], ['at most', 'at_most']]), { type: 'field_number', name: 'N', value: 1 }],
    previousStatement: 'Condition',
    nextStatement: 'Condition',
    colour: COLOURS.conditions,
  },
  {
    type: 'cond_door',
    message0: '%1 is %2',
    args0: [ref('DOOR', 'door'), choose('STATE', [['open', 'open'], ['closed', 'closed']])],
    previousStatement: 'Condition',
    nextStatement: 'Condition',
    colour: COLOURS.conditions,
  },
  {
    type: 'cond_room',
    message0: 'the player is in %1',
    args0: [ref('ROOM', 'room')],
    previousStatement: 'Condition',
    nextStatement: 'Condition',
    colour: COLOURS.conditions,
    tooltip: 'Where the player must be. With more than one of these, any of the rooms counts.',
  },

  // --- effects ----------------------------------------------------------------
  {
    type: 'eff_flag',
    message0: 'set %1 to %2',
    args0: [flag('FLAG'), choose('VALUE', [['true', 'true'], ['false', 'false']])],
    previousStatement: 'Effect',
    nextStatement: 'Effect',
    colour: COLOURS.effects,
  },
  {
    type: 'eff_move_item',
    message0: 'move %1 to %2',
    args0: [ref('ITEM', 'item'), ref('TO', 'place')],
    previousStatement: 'Effect',
    nextStatement: 'Effect',
    colour: COLOURS.effects,
  },
  {
    type: 'eff_move_npc',
    message0: 'move %1 to %2',
    args0: [ref('NPC', 'npc'), ref('TO', 'room')],
    previousStatement: 'Effect',
    nextStatement: 'Effect',
    colour: COLOURS.effects,
  },
  {
    type: 'eff_move_player',
    message0: 'move the player to %1',
    args0: [ref('TO', 'room')],
    previousStatement: 'Effect',
    nextStatement: 'Effect',
    colour: COLOURS.effects,
  },
  {
    type: 'eff_counter',
    message0: 'change %1 by %2',
    args0: [counter('COUNTER'), { type: 'field_number', name: 'DELTA', value: 1 }],
    previousStatement: 'Effect',
    nextStatement: 'Effect',
    colour: COLOURS.effects,
  },
  {
    type: 'eff_door',
    message0: 'make %1 %2',
    args0: [ref('DOOR', 'door'), choose('STATE', [['open', 'open'], ['closed', 'closed'], ['locked', 'locked'], ['unlocked', 'unlocked']])],
    previousStatement: 'Effect',
    nextStatement: 'Effect',
    colour: COLOURS.effects,
  },
  {
    type: 'eff_end',
    message0: 'end the game: the player %1',
    args0: [choose('OUTCOME', [['wins', 'win'], ['loses', 'loss']])],
    message1: 'last words %1',
    args1: [ml('EPILOGUE')],
    previousStatement: 'Effect',
    nextStatement: 'Effect',
    colour: COLOURS.effects,
    tooltip: 'Leave “last words” empty on a win to use the story’s winning words. A loss needs its own.',
  },
]

/** The toolbox, by category. Buttons run registered callbacks (blocks.js). */
export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Story', colour: COLOURS.world, contents: [{ kind: 'block', type: 'world' }] },
    {
      kind: 'category', name: 'Places', colour: COLOURS.places, contents: [
        { kind: 'block', type: 'room' }, { kind: 'block', type: 'exit' }, { kind: 'block', type: 'room_alt' },
        { kind: 'block', type: 'door' }, { kind: 'block', type: 'lock_until' }, { kind: 'block', type: 'lock_fixed' },
      ],
    },
    {
      kind: 'category', name: 'Things', colour: COLOURS.things, contents: [
        { kind: 'block', type: 'item' }, { kind: 'block', type: 'item_alt' }, { kind: 'block', type: 'refusal_with' },
      ],
    },
    {
      kind: 'category', name: 'People', colour: COLOURS.people, contents: [
        { kind: 'block', type: 'npc' }, { kind: 'block', type: 'says' },
      ],
    },
    {
      kind: 'category', name: 'Rules', colour: COLOURS.rules, contents: [
        { kind: 'block', type: 'use_rule' }, { kind: 'block', type: 'trigger_rule' },
      ],
    },
    {
      kind: 'category', name: 'Conditions', colour: COLOURS.conditions, contents: [
        { kind: 'button', text: 'Create a flag…', callbackKey: 'createFlag' },
        { kind: 'button', text: 'Create a counter…', callbackKey: 'createCounter' },
        { kind: 'block', type: 'cond_flag' }, { kind: 'block', type: 'cond_counter' },
        { kind: 'block', type: 'cond_door' }, { kind: 'block', type: 'cond_room' },
      ],
    },
    {
      kind: 'category', name: 'Effects', colour: COLOURS.effects, contents: [
        { kind: 'block', type: 'eff_flag' }, { kind: 'block', type: 'eff_counter' },
        { kind: 'block', type: 'eff_move_item' }, { kind: 'block', type: 'eff_move_npc' },
        { kind: 'block', type: 'eff_move_player' }, { kind: 'block', type: 'eff_door' },
        { kind: 'block', type: 'eff_end' },
      ],
    },
  ],
}

export function filterToolbox(blocks) {
  if (blocks == null) return TOOLBOX

  const allowed = new Set(blocks)
  const keepFlagButton = allowed.has('cond_flag') || allowed.has('eff_flag')
  const keepCounterButton = allowed.has('cond_counter') || allowed.has('eff_counter')
  const keep = item => {
    if (item.kind === 'block') return allowed.has(item.type)
    if (item.callbackKey === 'createFlag') return keepFlagButton
    if (item.callbackKey === 'createCounter') return keepCounterButton
    return true
  }

  return {
    ...TOOLBOX,
    contents: TOOLBOX.contents
      .map(category => ({
        ...category,
        contents: category.contents.filter(keep),
      }))
      .filter(category => category.contents.length > 0),
  }
}
