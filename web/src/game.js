// The play session: the one place the UI touches the engine.
//
// Holds the live world, the terminal scrollback, and a record of every turn
// (its parse trace, action, events, and the world diff it caused) so the side
// panels can show any turn, not just the latest. Meta commands — help, save,
// undo, pronouns — are handled here because they are not world mutations.
//
// It also owns the world *definition* — the Wayfarer, or whatever a student
// built — so the World Builder can swap in an edited world, either restarting or
// carrying the game in progress across (engine/merge.js).

import { computed, reactive, shallowRef } from 'vue'
import wayfarer from '../../worlds/wayfarer.json'
import { loadWorld, WorldValidationError } from './engine/loader.js'
import { describeRoom } from './engine/engine.js'
import { renderEvent } from './engine/renderer.js'
import { takeTurn } from './engine/turn.js'
import * as pronounSets from './engine/pronouns.js'
import { diffWorld } from './diff.js'
import { mergeWorld } from './engine/merge.js'
import { buildStages } from './stages.js'
import { storage } from './storage.js'

const SAVE_PREFIX = 'adventure-lab:save:'
const WORLD_KEY = 'adventure-lab:world'     // the world being played, if not the Wayfarer
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

/** The last world a student applied, if this browser has one that still loads. */
function savedWorld(worldKey = WORLD_KEY) {
  if (worldKey === null) return null
  try {
    const raw = JSON.parse(storage()?.getItem(worldKey) ?? 'null')
    if (raw) loadWorld(raw)
    return raw
  } catch {
    return null
  }
}

export function createGame(options = {}) {
  const {
    interpreter = null,
    onTurn = null,
    onWorldApplied = null,
    worldKey = WORLD_KEY,
  } = options
  const worldData = options.worldData === undefined
    ? savedWorld(worldKey) ?? wayfarer
    : options.worldData
  // What is being played, as authored — also the common ancestor a live edit is
  // merged against, since it is the world the current game started from.
  const definition = shallowRef(structuredClone(worldData))
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

  /** Finish any turn still being revealed, fast-forwarding it. */
  async function settle() {
    while (inFlight) {
      skip()
      await inFlight
    }
  }

  async function submit(line) {
    // A new command while one is still being revealed fast-forwards the old one.
    await settle()
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

      if (result.understood) print(`(${result.understood})`, 'echo', id)
      print(result.text, 'output', id)
      transcript.push([line, result.text])
      if (result.outcome) {
        print(END_LINE[result.outcome].replace('{turns}', world.value.turn_count), 'system')
        print('Play again', 'restart')
        print("Or type 'undo' to step back.", 'system')
      }
      touch()
      onTurn?.(turn, world.value)
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
    world.value = loadWorld(definition.value)
    touch()
    undoStack.length = 0
    transcript.length = 0
    state.log.splice(0)
    state.turns.splice(0)
    state.selectedTurnId = null
    intro()
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

  /**
   * Play an edited world. With `restart`, from its beginning; otherwise the game in
   * progress carries across: the author's edits apply, the player's progress stays.
   * Throws WorldValidationError, unchanged, if the world does not load.
   */
  async function applyWorld(raw, { restart: fromStart = false } = {}) {
    const next = loadWorld(raw)
    await settle()
    const started = loadWorld(definition.value)
    definition.value = structuredClone(raw)
    if (worldKey !== null) {
      try {
        storage()?.setItem(worldKey, JSON.stringify(raw))
      } catch { /* storage full: the world still plays, it just won't survive a reload */ }
    }

    if (fromStart) {
      restart()
    } else {
      const merged = mergeWorld(started, world.value, next)
      world.value = merged.world
      undoStack.length = 0          // undo would step back into the old world
      touch()
      print('— The world has changed. Your game carries on from where you were. —', 'system')
      for (const note of merged.notes) print(note, 'system')
      print(renderEvent(describeRoom(world.value), undefined, pronouns()))
    }
    onWorldApplied?.(raw)
  }

  const selectedTurn = computed(() =>
    state.turns.find(t => t.id === state.selectedTurnId) ?? state.turns.at(-1) ?? null)

  intro()
  return {
    world: view, definition, state, submit, skip, selectedTurn, restart, applyWorld,
    select: id => { state.selectedTurnId = id },
  }
}
