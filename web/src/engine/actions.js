// Actions: structured player intents referencing entity ids. Never checks legality.
//
//   { type: 'look' }
//   { type: 'examine',   target }         item, npc, or door id
//   { type: 'go',        direction }      north | south | east | west | up | down
//   { type: 'traverse',  target }         door id — "go through the hatch"
//   { type: 'listen',    target? }        door id, or none for the room
//   { type: 'take',      item }
//   { type: 'drop',      item }
//   { type: 'open',      target }
//   { type: 'use',       item, target? }
//   { type: 'talk',      npc }
//   { type: 'inventory' }

export const ACTION_TYPES = [
  'look', 'examine', 'go', 'traverse', 'listen', 'take', 'drop', 'open', 'use',
  'talk', 'inventory',
]

export const Look = () => ({ type: 'look' })
export const Examine = target => ({ type: 'examine', target })
export const Go = direction => ({ type: 'go', direction })
export const Traverse = target => ({ type: 'traverse', target })
export const Listen = (target = null) => ({ type: 'listen', target })
export const Take = item => ({ type: 'take', item })
export const Drop = item => ({ type: 'drop', item })
export const Open = target => ({ type: 'open', target })
export const Use = (item, target = null) => ({ type: 'use', item, target })
export const Talk = npc => ({ type: 'talk', npc })
export const ShowInventory = () => ({ type: 'inventory' })

/** "use power_cell → maintenance_droid", for display. */
export function describeAction(action) {
  switch (action.type) {
    case 'go': return `go ${action.direction}`
    case 'use': return action.target ? `use ${action.item} → ${action.target}` : `use ${action.item}`
    case 'take': case 'drop': return `${action.type} ${action.item}`
    case 'talk': return `talk ${action.npc}`
    case 'listen': return action.target ? `listen ${action.target}` : 'listen'
    case 'examine': case 'open': case 'traverse': return `${action.type} ${action.target}`
    default: return action.type
  }
}
