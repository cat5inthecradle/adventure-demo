export const AdventureConditions = {
  GAME_WON: {
    name: 'game_won',
    description: 'Checks whether the player has won the game.',
    source: 'play',
  },
  TURN_FAILED: {
    name: 'turn_failed',
    valueType: 'string',
    description: 'Checks whether a turn failed, optionally for a specific reason.',
    source: 'play',
  },
  EXAMINED_MATCHING: {
    name: 'examined_matching',
    valueType: 'string',
    description: 'Checks whether the player examined an entity with the given word in its name or aliases.',
    source: 'play',
  },
  SAW_CUSTOM_REFUSAL: {
    name: 'saw_custom_refusal',
    valueType: 'string',
    description: 'Checks whether the player saw an authored opening refusal for the given item.',
    source: 'play',
  },
  SAW_TOOL_HINT: {
    name: 'saw_tool_hint',
    valueType: 'string',
    description: 'Checks whether the player saw an authored tool hint for the given item.',
    source: 'play',
  },
  OPENED_DOOR_LOCKED_BY_FLAG: {
    name: 'opened_door_locked_by_flag',
    description: 'Checks whether the player opened a door configured to unlock with a flag.',
    source: 'play',
  },
  FLAG_SET: {
    name: 'flag_set',
    valueType: 'string',
    description: 'Checks whether the given world flag became true during play.',
    source: 'play',
  },
  INTERPRETER_UNDERSTOOD: {
    name: 'interpreter_understood',
    description: 'Checks whether a model proposal passed the request check and was sent to the game rules.',
    source: 'play',
  },
  INTERPRETER_GUESSED: {
    name: 'interpreter_guessed',
    description: 'Legacy condition retained for older curriculum; unrelated guesses are now rejected.',
    source: 'play',
  },
  INTERPRETER_CLARIFIED: {
    name: 'interpreter_clarified',
    description: 'Checks whether the model or the game asked a clarification question instead of executing a model proposal.',
    source: 'play',
  },
  AI_FILLED_GAP: {
    name: 'ai_filled_gap',
    valueType: 'string',
    description: 'Checks whether the AI wrote prose for a named detail the author mentioned but did not build.',
    source: 'play',
  },
  AI_IMPROVISED: {
    name: 'ai_improvised',
    valueType: 'string',
    description: 'Checks whether the AI wrote a line in a character’s voice that the author did not write.',
    source: 'play',
  },
  VIEWED_UNDERSTOOD_PANEL: {
    name: 'viewed_understood_panel',
    description: 'Checks whether the player viewed the understood panel.',
    source: 'ui',
  },
  AI_EXPERIMENT_REVIEWED: {
    name: 'ai_experiment_reviewed',
    valueType: 'string',
    description: 'Checks whether one investigation has reviewed evidence and an observation.',
    source: 'ui',
  },
  AI_EXPERIMENTS_REVIEWED: {
    name: 'ai_experiments_reviewed',
    description: 'Checks whether the AI experiments have evidence and observations.',
    source: 'ui',
  },
  AI_DIAL_SET: {
    name: 'ai_dial_set',
    valueType: 'string',
    description: 'Checks whether the player set the AI dial, optionally to a specific setting.',
    source: 'ui',
  },
  REAL_LIFE_DIALS_SET: {
    name: 'real_life_dials_set',
    description: 'Checks whether the student chose a dial setting for every real-life scenario.',
    source: 'ui',
  },
  ENTITY_NAMED_MATCHING: {
    name: 'entity_named_matching',
    valueType: 'string',
    description: 'Checks whether an authored entity has the given word in its name or aliases.',
    source: 'definition',
  },
  ITEM_HAS_OPEN_REFUSAL: {
    name: 'item_has_open_refusal',
    valueType: 'string',
    description: 'Checks whether the given authored item has a custom opening refusal.',
    source: 'definition',
  },
  ITEM_HAS_TOOL_HINT: {
    name: 'item_has_tool_hint',
    valueType: 'string',
    description: 'Checks whether the given authored item has at least one opening tool hint.',
    source: 'definition',
  },
  DOOR_LOCKED_BY_FLAG: {
    name: 'door_locked_by_flag',
    description: 'Checks whether an authored exit uses a locked door configured to unlock with a flag.',
    source: 'definition',
  },
}
