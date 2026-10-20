// The play session: the one place the UI touches the engine.
//
// Holds the live world, the terminal scrollback, and a record of every turn
// (its parse trace, action, events, and the world diff it caused) so the side
// panels can show any turn, not just the latest. Meta commands — help, save,
// undo, pronouns — are handled here because they are not world mutations.

import { computed, reactive, shallowRef } from 'vue'
import wayfarer from '../../worlds/wayfarer.json'
import { loadWorld, WorldValidationError } from './engine/loader.js'
import { describeRoom } from './engine/engine.js'
import { renderEvent } from './engine/renderer.js'
import { takeTurn } from './engine/turn.js'
import * as pronounSets from './engine/pronouns.js'
import { diffWorld } from './diff.js'
import { buildStages } from './stages.js'

const SAVE_PREFIX = 'adventure-lab:save:'
const TRANSCRIPT_PAIRS = 6
const UNDO_DEPTH = 50

export const HELP_TEXT = `Commands
  Looking around:  look (l) · examine X (x X, inspect X, read X)
  Moving:          go north (n, s, e, w, up, down) · go to <room> · go back
  Carrying:        take X (get, grab, pick up) · drop X (put down) · inventory (i)
  Doors:           open X
  Going through:   enter X (get in X, board X) · go through X (jump out X)
  Using things:    use X · pull/push/press X · use X on Y (put X in Y, give X to Y)
  Talking:         talk to X (speak to X, ask X)
  Listening:       listen · listen at X

Meta commands
  help             show this list
  undo             take back the last turn
  restart          start the story over
  save [name]      save in this browser (default: quicksave)
  load [name]      load a save
  saves            list saves
  pronouns [set]   show or change your character's pronouns (he, she, they)`

const END_LINE = { win: 'Escaped in {turns} turns.', loss: 'You lasted {turns} turns.' }

let nextId = 1

export function createGame({ worldData = wayfarer, interpreter = null } = {}) {
  const world = shallowRef(loadWorld(worldData))
  const state = reactive({
    log: [],            // { id, kind: 'input'|'output'|'system', text, turnId? }
    turns: [],          // turn records, oldest first
    selectedTurnId: null,
    interpreter,        // see engine/interpreter.js — null means parser only
    busy: false,
    pace: 500,          // ms between revealed phases; 0 = instant
  })
  const undoStack = []
  const transcript = []

  // Panels draw from a copy, refreshed after every change: they can never mutate
  // the live world, and a fresh object is what tells Vue to redraw them.
  const view = shallowRef(structuredClone(world.value))
  const touch = () => { view.value = structuredClone(world.value) }
  const pronouns = () => world.value.pronouns
  const print = (text, kind = 'output', turnId = null) => {
    state.log.push({ id: nextId++, kind, text, turnId })
  }

  function intro() {
    const w = world.value
    print(w.title, 'title')
    print(pronounSets.apply(w.intro, pronouns()))
    print(renderEvent(describeRoom(w), undefined, pronouns()))
    print("Type 'help' for commands. Click any command you typed to inspect how it was understood.", 'system')
  }

  // Slow motion. Each turn is computed at once (the engine is deterministic and
  // instant), then its phases are revealed in the parser panel one at a time,
  // `state.pace` ms apart; the main screen and world panel update last.
  let inFlight = null
  let fast = false
  let wake = null
  let timer = null

  function pause() {
    if (fast || state.pace <= 0) return null
    return new Promise(resolve => {
      wake = resolve
      timer = setTimeout(resolve, state.pace)
    })
  }

  /** Finish revealing the current turn immediately. */
  function skip() {
    fast = true
    clearTimeout(timer)
    wake?.()
  }

  async function submit(line) {
    // A new command while one is still being revealed fast-forwards the old one.
    while (inFlight) {
      skip()
      await inFlight
    }
    inFlight = run(line)
    try {
      return await inFlight
    } finally {
      inFlight = null
    }
  }

  async function run(line) {
    const trimmed = line.trim()
    print(`> ${line}`, 'input')
    if (handleMeta(trimmed)) return

    state.busy = true
    fast = false
    const before = structuredClone(world.value)
    try {
      const result = await takeTurn(world.value, line, {
        interpreter: state.interpreter,
        transcript: transcript.slice(-TRANSCRIPT_PAIRS),
      })
      const changes = diffWorld(before, world.value)
      if (changes.length) {
        undoStack.push(before)
        if (undoStack.length > UNDO_DEPTH) undoStack.shift()
      }
      const id = nextId++
      state.turns.push({ id, ...result, changes, turnNumber: world.value.turn_count, revealed: 0 })
      const turn = state.turns.at(-1)      // the reactive copy, so reveals redraw
      state.selectedTurnId = id
      state.log.at(-1).turnId = id

      const phases = buildStages(turn).length
      for (let shown = 1; shown <= phases; shown++) {
        turn.revealed = shown
        await pause()
      }
      turn.revealed = null

      print(result.text, 'output', id)
      transcript.push([line, result.text])
      if (result.outcome) {
        print(END_LINE[result.outcome].replace('{turns}', world.value.turn_count), 'system')
        print("Type 'restart' to play again, or 'undo' to step back.", 'system')
      }
      touch()
      return turn
    } finally {
      state.busy = false
    }
  }

  function handleMeta(line) {
    const [command, ...rest] = line.split(/\s+/)
    const arg = rest[0]
    switch ((command || '').toLowerCase()) {
      case 'help': print(HELP_TEXT, 'system'); return true
      case 'undo': undo(); return true
      case 'restart': restart(); return true
      case 'save': save(arg || 'quicksave'); return true
      case 'load': load(arg || 'quicksave'); return true
      case 'saves': listSaves(); return true
      case 'pronouns': setPronouns(arg); return true
    }
    return false
  }

  function undo() {
    const previous = undoStack.pop()
    if (!previous) return print('There is nothing to undo.', 'system')
    world.value = previous
    touch()
    print('Undone. You are back where you were.', 'system')
    print(renderEvent(describeRoom(world.value), undefined, pronouns()))
  }

  function restart() {
    world.value = loadWorld(worldData)
    touch()
    undoStack.length = 0
    transcript.length = 0
    state.log.splice(0)
    state.turns.splice(0)
    state.selectedTurnId = null
    intro()
  }

  function storage() {
    try { return window.localStorage } catch { return null }
  }

  function save(name) {
    const store = storage()
    if (!store) return print('This browser will not let the game save.', 'system')
    store.setItem(SAVE_PREFIX + name, JSON.stringify(world.value))
    print(`Saved as '${name}'.`, 'system')
  }

  function load(name) {
    const raw = storage()?.getItem(SAVE_PREFIX + name)
    if (!raw) return print(`There is no save called '${name}'. Type 'saves' to see what you have.`, 'system')
    try {
      world.value = loadWorld(JSON.parse(raw))
    } catch (err) {
      const why = err instanceof WorldValidationError ? err.message : 'it could not be read'
      return print(`That save is not valid: ${why}`, 'system')
    }
    touch()
    undoStack.length = 0
    print('Loaded.', 'system')
    print(renderEvent(describeRoom(world.value), undefined, pronouns()))
  }

  function listSaves() {
    const store = storage()
    const names = store
      ? Object.keys(store).filter(k => k.startsWith(SAVE_PREFIX)).map(k => k.slice(SAVE_PREFIX.length))
      : []
    print(names.length ? `Saved games: ${names.join(', ')}.` : 'You have no saved games.', 'system')
  }

  function setPronouns(choice) {
    if (!choice) {
      const current = pronounSets.resolve(pronouns())
      const other = Object.keys(pronounSets.SETS).find(id => id !== current.id)
      return print(`Your character uses ${current.label}. Type 'pronouns ${other}' to change it.`, 'system')
    }
    const id = choice.toLowerCase()
    if (!(id in pronounSets.SETS)) {
      return print(`I don't know the pronouns '${choice}'. Try one of: ${Object.keys(pronounSets.SETS).join(', ')}.`, 'system')
    }
    world.value.pronouns = id
    touch()
    const set = pronounSets.SETS[id]
    print(`Your character uses ${set.label}. ${pronounSets.apply(pronounSets.EXAMPLE, set)}`, 'system')
  }

  const selectedTurn = computed(() =>
    state.turns.find(t => t.id === state.selectedTurnId) ?? state.turns.at(-1) ?? null)

  intro()
  return { world: view, state, submit, skip, selectedTurn, select: id => { state.selectedTurnId = id } }
}
