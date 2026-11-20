import { createGame } from '../game.js'
import { loadWorld } from '../engine/loader.js'
import wayfarer from '../../../worlds/wayfarer.json'

export const CHALLENGE_KEY = 'adventure-lab:lesson-challenges'
export const CHALLENGES = [
  {
    id: 'interpreter', title: 'Test the interpreter', duration: '5–8 minutes', level: 3,
    goal: 'Find out when different wording leads to the same action.',
    steps: [
      'Choose one action and write three different ways to request it. Predict which ones the game will understand.',
      'Try each request and inspect the action, reply, and world changes. Repeat from the same starting state when comparing an action that changes the world.',
      'Try one impossible request. Explain a disagreement between your prediction and the result. If a model is unavailable, compare the recorded examples below instead.',
    ],
    reflection: 'Which wording or recorded result surprised you? What evidence changed your prediction?',
  },
  {
    id: 'object', title: 'Make your object foolproof', duration: '5–10 minutes', level: 5,
    goal: 'Make an object that behaves the way another player expects.',
    steps: [
      'Use the practice copy of your lesson object, or add an object here. Give it two aliases in Also called, separated by commas.',
      'Choose whether players can pick it up. Predict what examine and take will do, then test the name and both aliases.',
      'Try an unexpected name, or ask a partner to try one. Revise the object based on what happened and test again.',
    ],
    reflection: 'Which names did you test? How did the pickup rule compare with your prediction?',
  },
  {
    id: 'wayfarer', title: 'Investigate The Wayfarer', duration: '10–15 minutes', level: 6,
    goal: 'Find two clues and explain how one puzzle depends on another.',
    steps: [
      'Explore with look, examine, and talk. Find two clues and note what each suggests you should do.',
      'Solve one dependency: something you need to do before another action can work. Inspect a command to see how the game interpreted it; AI is optional.',
      'Explain the dependency using what changed in the world. Finishing the whole game is optional. If you escape early, compare an action that worked with one the rules refused.',
    ],
    reflection: 'What were your two clues? What had to happen first, and which command gave you evidence?',
  },
]

// Separate practice worlds and notes never satisfy core lesson validations.
export class ChallengeManager {
  constructor(store) {
    this.store = store
    this.sessions = new Map()
    this.saved = {}
    this.cleared = false
    try {
      const saved = JSON.parse(store?.getItem(CHALLENGE_KEY) ?? '{}')
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.saved = saved
    } catch { /* damaged storage: start with fresh practice sessions */ }
  }

  open(id, world, source) {
    if (!CHALLENGES.some(c => c.id === id)) throw new Error('Unknown challenge.')
    const key = `${world}:${id}`
    if (this.sessions.has(key)) return this.sessions.get(key)
    const saved = this.saved[key]
    let definition = id === 'wayfarer' ? wayfarer : source
    let position = null
    try {
      if (saved?.definition) { loadWorld(saved.definition); definition = saved.definition }
      if (saved?.position) { loadWorld(saved.position); position = saved.position }
    } catch { definition = id === 'wayfarer' ? wayfarer : source; position = null }
    const session = {
      key,
      note: typeof saved?.note === 'string' ? saved.note.slice(0, 600) : '',
      reviewed: saved?.reviewed === true,
      game: createGame({ worldData: definition, initialState: position, worldKey: null }),
    }
    session.game.state.pace = 0
    this.sessions.set(key, session)
    return session
  }

  persist(session) {
    if (this.cleared) return false
    this.saved[session.key] = {
      definition: session.game.definition.value,
      position: session.game.world.value,
      note: session.note.slice(0, 600),
      reviewed: session.reviewed,
    }
    try {
      if (!this.store) return false
      this.store.setItem(CHALLENGE_KEY, JSON.stringify(this.saved))
      return true
    } catch { return false }
  }

  clear() {
    this.cleared = true
    this.saved = {}
    this.sessions.clear()
  }
}
