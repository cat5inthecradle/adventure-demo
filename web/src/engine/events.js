// Events: structured facts the engine emits, never formatted prose.
//
// Each event is a plain object discriminated by `type`. Entity references are
// `{id, name}` pairs.
//
//   room_described   { room, description, exits:[{direction, door, door_open}], items, npcs, first_visit }
//   entity_examined  { entity, description }
//   moved            { from_room, to_room, through, message }
//   item_taken       { item }
//   item_dropped     { item }
//   door_opened      { door, message }
//   item_used        { item, target, message, interaction }
//   npc_spoke        { npc, text }
//   listened         { subject, text }
//   inventory_listed { items }
//   narrated         { trigger, text }
//   game_ended       { outcome: 'win'|'loss', epilogue, banner }
//   action_failed    { reason, subject, message }

export const Reason = Object.freeze({
  NO_EXIT: 'no_exit',                 // no exit in that direction
  DOOR_CLOSED: 'door_closed',         // exit exists but door is shut
  DOOR_LOCKED: 'door_locked',         // open attempt failed; door is locked
  ALREADY_OPEN: 'already_open',
  NOT_PRESENT: 'not_present',         // entity not visible here
  NOT_PORTABLE: 'not_portable',
  ALREADY_CARRYING: 'already_carrying',
  NOT_CARRYING: 'not_carrying',       // drop target not in inventory
  NOT_OPENABLE: 'not_openable',       // open target isn't a door
  NOTHING_HAPPENS: 'nothing_happens', // no matching interaction / dialogue
  GAME_OVER: 'game_over',             // action after the game has ended
})
