# Adventure Lab progress

This directory is Adventure Lab's lab-specific half of the Lab2 progress system.

- `conditions.js` catalogs validation conditions, like Music Lab's `MusicConditions.ts`.
- `AdventureValidator.js` turns play, UI, and authored-world facts into Lab2 conditions, like `MusicValidator.ts`.
- `levelKind.js` defines the Zod level-property schemas used where the main repo registers a lab level kind.

## Conditions

Play:

- `game_won`, `turn_failed`, `examined_matching`
- `saw_custom_refusal`, `saw_tool_hint`, `opened_door_locked_by_flag`
- `flag_set`, `interpreter_understood`, `interpreter_clarified`

UI:

- `viewed_understood_panel`, `ai_dial_set`

Definition:

- `entity_named_matching`, `item_has_open_refusal`, `item_has_tool_hint`
- `door_locked_by_flag`
