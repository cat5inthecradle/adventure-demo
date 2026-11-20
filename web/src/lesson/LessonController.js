import { ChallengeManager, CHALLENGE_KEY } from './challenges.js'
import { createGame } from '../game.js'
import ProgressManager from '../lab2/ProgressManager.js'
import { nextDestination, resolveCourseLevel } from '../lab2/resolveCourseLevel.js'
import AdventureValidator from '../adventure/AdventureValidator.js'
import { parseLevelProperties } from '../adventure/levelKind.js'
import { loadWorld } from '../engine/loader.js'
import { studentThing } from './addThing.js'
import { DIAL } from './dial.js'
import { EXPERIMENTS, summarizeTurn } from './experiments.js'
import { storage } from '../storage.js'
import lessonWorlds from '../../../curriculum/hour-of-ai/worlds.json'

const PROJECT_PREFIX = 'adventure-lab:project:'
const WORLD_KEY = 'adventure-lab:lesson-world'
const REAL_LIFE_KEY = 'adventure-lab:lesson-real-life'
const DIAL_KEY = 'adventure-lab:lesson-dial'
const PASSED_KEY = 'adventure-lab:lesson-passed'
const EXPERIMENT_KEY = 'adventure-lab:lesson-experiments-v1'
const LEVEL_KEY = 'adventure-lab:lesson-level'

// How long each step of "How it was understood" stays on screen in the lesson.
// With no such panel there is nothing to watch, so the reply comes at once.
const LESSON_PACE_MS = 150
// A reason has to be a few words, not "idk".
const MIN_REASON_WORDS = 3
export function isReason(text) {
  const words = new Set(String(text ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])
  const real = [...words].filter(word => word.length >= 3)
  return words.size >= MIN_REASON_WORDS && real.length >= 1    // "a b c" and "asdf asdf asdf" are not reasons
}

function substituteTerms(value, terms) {
  if (typeof value === 'string') {
    return value.replace(/\{\{([^{}]+)\}\}/g, (placeholder, name) =>
      Object.hasOwn(terms, name) ? String(terms[name]) : placeholder
    )
  }
  if (Array.isArray(value)) return value.map(entry => substituteTerms(entry, terms))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
      [key, substituteTerms(entry, terms)]
    ))
  }
  return value
}

export default class LessonController {
  constructor({
    unit,
    levelProperties,
    starters,
    worlds = lessonWorlds,
    store = storage(),
    interpreter = null,
  }) {
    this.unit = unit
    this.levelProperties = levelProperties
    this.starters = starters
    this.worlds = worlds
    this.store = store
    this.challenges = new ChallengeManager(store)
    this.interpreter = interpreter
    this.level = null
    this.properties = null
    this.lessonPosition = null
    this.levelPosition = null
    this.game = null
    this.listeners = new Set()
    this.dial = { setting: 'understand', tone: null, theme: null }
    this.dialWasSet = false
    // The dial the student pressed Save on, with their reason. The live dial
    // can be moved around to experiment; only this one goes on the card.
    this.dialSaved = null
    try {
      const saved = JSON.parse(this.store?.getItem(DIAL_KEY) ?? 'null')
      if (saved && Object.hasOwn(DIAL, saved.setting)) {
        this.dialSaved = {
          setting: saved.setting,
          tone: saved.tone ?? null,
          theme: saved.theme ?? null,
          reason: typeof saved.reason === 'string' ? saved.reason : '',
        }
        this.dial = { setting: saved.setting, tone: this.dialSaved.tone, theme: this.dialSaved.theme }
        this.dialWasSet = true
      }
    } catch { /* blocked or damaged storage: the dial starts at its default */ }
    this.passed = new Set()
    try {
      const saved = JSON.parse(this.store?.getItem(PASSED_KEY) ?? '[]')
      if (Array.isArray(saved)) this.passed = new Set(saved.map(Number))
    } catch { /* blocked or damaged storage: no levels count as passed yet */ }
    this.experiments = {}
    try {
      const saved = JSON.parse(this.store?.getItem(EXPERIMENT_KEY) ?? '{}')
      for (const [level, tasks] of Object.entries(EXPERIMENTS)) {
        this.experiments[level] = {}
        for (const { id } of tasks) {
          const entry = saved?.[level]?.[id]
          if (['live', 'recorded'].includes(entry?.route) && isReason(entry.observation) && typeof entry.evidence === 'string') {
            this.experiments[level][id] = entry
          }
        }
        // Older completion flags do not imply the new investigations were done.
        if (!this.experimentsComplete(level)) this.passed.delete(Number(level))
      }
    } catch { for (const id of Object.keys(EXPERIMENTS)) this.passed.delete(Number(id)) }
    this.realLife = {}
    try {
      const saved = JSON.parse(this.store?.getItem(REAL_LIFE_KEY) ?? 'null')
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.realLife = saved
    } catch { /* blocked or damaged storage: start with no answers */ }

    let savedWorld = null
    try {
      savedWorld = this.store?.getItem(WORLD_KEY)
    } catch { /* blocked storage falls back to the curriculum default */ }
    const orderedWorlds = [
      ...(this.worlds.order ?? []),
      ...Object.keys(this.worlds.worlds),
    ]
    this.world = [savedWorld, this.worlds.default, ...orderedWorlds]
      .find(key => this.isSelectableWorld(key))
    if (!this.world) throw new Error('The lesson has no selectable starter worlds.')

    this.validator = new AdventureValidator()
    this.progress = new ProgressManager(() => this.notify())
    this.progress.setValidator(this.validator)
  }

  /** Clear only this lesson's saved work; the caller must reload immediately.
   * Reload also discards transcripts, model context and in-flight game state.
   * Model downloads live outside these keys and are intentionally retained.
   */
  clearSavedLesson() {
    const keys = new Set([WORLD_KEY, REAL_LIFE_KEY, DIAL_KEY, PASSED_KEY, LEVEL_KEY, EXPERIMENT_KEY, CHALLENGE_KEY])
    const projectPrefixes = [...new Set(Object.values(this.levelProperties)
      .map(level => level.projectTemplateLevelName).filter(Boolean))]
      .map(template => PROJECT_PREFIX + template)
    for (const prefix of projectPrefixes) {
      keys.add(prefix) // Legacy/default-world project.
      for (const world of Object.keys(this.worlds.worlds)) keys.add(`${prefix}:${world}`)
    }
    // Also cover old world variants of this lesson's templates, without
    // deleting projects belonging to other lessons or any named game saves.
    for (let i = 0; i < (this.store?.length ?? 0); i++) {
      const key = this.store.key(i)
      if (key && projectPrefixes.some(prefix => key.startsWith(`${prefix}:`))) keys.add(key)
    }
    try {
      for (const key of keys) this.store?.removeItem(key)
    } catch {
      throw new Error('Could not clear all saved lesson work. Check browser storage permissions and try again.')
    }
    // A late model reply must not write the old session back before reload.
    this.resetting = true
    this.challenges.clear()
    return `#learn/${this.unit.name}/1/1`
  }

  goTo(lessonPosition, levelPosition) {
    const level = resolveCourseLevel(
      this.unit,
      this.levelProperties,
      lessonPosition,
      levelPosition
    )
    const parsedProperties = parseLevelProperties(level.properties)
    const terms = this.worlds.worlds[this.world].terms
    const properties = substituteTerms(parsedProperties, terms)
    const structureLevel = this.unit.lessons
      .find(lesson => lesson.position === lessonPosition)
      ?.levels.find(candidate => candidate.position === levelPosition)
    level.progression = structureLevel?.progression
    level.progressionDisplayName = structureLevel?.progression_display_name

    this.level = level
    this.properties = properties
    this.lessonPosition = lessonPosition
    this.levelPosition = levelPosition
    try {
      this.store?.setItem(LEVEL_KEY, String(levelPosition))
    } catch { /* blocked storage only prevents picking up where they left off */ }

    const template = properties.projectTemplateLevelName
    const worldData = this.loadProject(template) ??
      this.starters[properties.levelData.startWorld]
    this.game = createGame({
      worldData,
      interpreter: this.interpreter,
      worldKey: null,
      onTurn: (turn, world) => this.onTurn(turn, world),
      onWorldApplied: raw => this.onWorldApplied(raw),
    })
    this.game.state.pace = properties.levelData.panels.includes('understood') ? LESSON_PACE_MS : 0
    if (properties.levelData.aiDial) {
      if (!this.dialWasSet) {
        this.dial = {
          setting: properties.levelData.aiDial.default,
          tone: null,
          theme: null,
        }
      }
      this.applyDial(this.dial)
    } else {
      this.applyDial({ setting: 'understand', tone: null, theme: null })
    }

    this.validator.setDefinition(worldData)
    this.progress.onLevelChange(properties.validations)
    this.noteRealLife()
    this.noteExperiments()
    this.progress.updateProgress()
    this.notePassed()
    this.notify()
    return this.level
  }

  experimentsComplete(level = this.properties?.id) {
    return Boolean(EXPERIMENTS[level]?.every(task => this.experiments[level]?.[task.id]))
  }

  experimentTasks() {
    return EXPERIMENTS[this.properties?.id] ?? []
  }

  liveEvidence(id) {
    const turns = this.game?.state.turns ?? []
    const previous = this.experiments[this.properties?.id]?.[id]
    const savedEvidence = previous?.route === 'live' ? previous.evidence : null
    if (id === 'interpret' || id === 'boundary') {
      const candidates = turns.filter(t => t.route === 'interpreter')
      const turn = id === 'interpret' ? candidates[0] : candidates.find(t => t.line !== candidates[0]?.line)
      return turn ? summarizeTurn(turn) : savedEvidence
    }
    if (id === 'compare') {
      const off = turns.find(t => t.ai?.aiMode === 'off' && turns.some(u => u.ai?.aiMode === 'understand' && u.line.trim().toLowerCase() === t.line.trim().toLowerCase()))
      const understand = off && turns.find(t => t.ai?.aiMode === 'understand' && t.line.trim().toLowerCase() === off.line.trim().toLowerCase())
      return off ? `Off:\n${summarizeTurn(off)}\n\nUnderstand:\n${summarizeTurn(understand)}` : savedEvidence
    }
    const turn = turns.find(t => t.route === (id === 'scenery' ? 'filled' : 'improvised'))
    return turn ? summarizeTurn(turn) : savedEvidence
  }

  saveExperiment(id, route, observation) {
    if (this.resetting) return
    const task = this.experimentTasks().find(t => t.id === id)
    const evidence = task && (route === 'recorded' ? task.recorded : route === 'live' ? this.liveEvidence(id) : null)
    if (!evidence) throw new Error('Try the experiment first, or inspect the recorded example.')
    const why = String(observation ?? '').trim().slice(0, 400)
    if (!isReason(why)) throw new Error('Write a few words about the evidence you noticed.')
    const level = this.properties.id
    this.experiments[level] = { ...this.experiments[level], [id]: { route, evidence, observation: why, world: route === 'live' ? this.world : 'space' } }
    try { this.store?.setItem(EXPERIMENT_KEY, JSON.stringify(this.experiments)) } catch { /* available for this visit */ }
    this.noteExperiments()
    this.progress.updateProgress()
    this.notify()
  }

  noteExperiments() {
    for (const task of this.experimentTasks()) {
      if (this.experiments[this.properties.id]?.[task.id]) this.validator.recordUiEvent('ai_experiment_reviewed', task.id)
    }
    if (this.experimentsComplete()) this.validator.recordUiEvent('ai_experiments_reviewed')
    if (this.dialSaved && isReason(this.dialSaved.reason)) this.validator.recordUiEvent('ai_dial_set', this.dialSaved.setting)
  }

  loadProject(template) {
    if (!template || !this.store) return null
    try {
      const raw = JSON.parse(this.store.getItem(this.projectKey(template)) ?? 'null')
      if (!raw) return null
      loadWorld(raw)
      return raw
    } catch {
      return null
    }
  }

  onTurn(turn, world) {
    if (this.resetting) return
    this.validator.recordTurn(turn, world)
    this.progress.updateProgress()
    this.notePassed()
  }

  onWorldApplied(raw) {
    if (this.resetting) return
    const template = this.properties?.projectTemplateLevelName
    if (template) {
      try {
        this.store?.setItem(this.projectKey(template), JSON.stringify(raw))
      } catch { /* full or blocked: the lesson can still continue */ }
    }
    this.validator.setDefinition(raw)
    this.progress.updateProgress()
    this.notePassed()
  }

  recordUiEvent(name, value) {
    this.validator.recordUiEvent(name, value)
    this.progress.updateProgress()
    this.notePassed()
  }

  state() {
    return this.progress.getCurrentState()
  }

  steps() {
    this.validator.checkConditions()
    return (this.properties?.levelData.steps ?? []).map(step => {
      const checkable = step.conditions.length > 0
      return {
        text: step.text,
        checkable,
        done: checkable && this.validator.conditionsMet(step.conditions),
      }
    })
  }

  canContinue() {
    // A level passed earlier stays passed when the student comes back to it.
    const passedBefore = this.properties && this.passed.has(Number(this.properties.id))
    return Boolean(this.properties?.freePlay || this.state().satisfied || passedBefore)
  }

  next() {
    return nextDestination(this.level)
  }

  onChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify() {
    if (this.resetting) return
    this.notePassed()
    for (const listener of this.listeners) listener()
  }

  /** Remember a level once its checks are met, so progress shows what was done, not what was visited. */
  notePassed() {
    if (this.resetting) return
    if (!this.properties || this.properties.freePlay) return
    const id = Number(this.properties.id)
    if (this.passed.has(id) || !this.progress.getCurrentState().satisfied) return
    this.passed.add(id)
    try {
      this.store?.setItem(PASSED_KEY, JSON.stringify([...this.passed]))
    } catch { /* full or blocked: progress still shows for this visit */ }
  }

  /** The level to open when someone arrives without asking for one: where they left off, or the first. */
  resumeLevel() {
    const count = this.unit.lessons[0]?.levels.length ?? 1
    let saved = NaN
    try {
      saved = Number(this.store?.getItem(LEVEL_KEY))
    } catch { /* blocked storage: start at the beginning */ }
    return Number.isInteger(saved) && saved >= 1 && saved <= count ? saved : 1
  }

  /** One entry per level of the lesson: 'passed', 'here', 'skipped' (behind, not passed) or 'ahead'. */
  levelStatuses() {
    this.notePassed()
    return (this.level?.levels ?? []).map(level => {
      if (this.passed.has(level.levelId)) return 'passed'
      if (level.position === this.levelPosition) return 'here'
      return level.position < this.levelPosition ? 'skipped' : 'ahead'
    })
  }

  setInterpreter(interpreter) {
    this.interpreter = interpreter
    if (this.game) this.game.setAi({ interpreter })
    this.notify()
  }

  isSelectableWorld(key) {
    return typeof key === 'string' &&
      Object.hasOwn(this.worlds.worlds, key) &&
      Object.hasOwn(this.starters, key)
  }

  setWorld(key) {
    if (!this.isSelectableWorld(key)) {
      throw new Error(`The lesson world '${key}' is not available.`)
    }
    this.world = key
    try {
      this.store?.setItem(WORLD_KEY, key)
    } catch { /* blocked storage only prevents remembering the choice */ }
    if (this.level) {
      this.goTo(this.lessonPosition, this.levelPosition)
    } else {
      this.notify()
    }
  }

  setDial({ setting, tone, theme }) {
    const config = this.properties?.levelData.aiDial
    if (config?.locked.includes(setting)) {
      throw new Error(`The '${setting}' AI dial setting is locked.`)
    }
    this.dial = {
      setting,
      tone: tone === undefined ? this.dial.tone : tone,
      theme: theme === undefined ? this.dial.theme : theme,
    }
    this.dialWasSet = true
    this.applyDial(this.dial)
    this.notify()
  }

  /**
   * The student's decision: the dial as it stands now, with their reason.
   * This is what the card reports; experiments are tracked separately. Throws when
   * there is no real reason, in words a student can act on.
   */
  saveDialChoice(reason) {
    const why = String(reason ?? '').trim().slice(0, 200)
    if (!isReason(why)) throw new Error('Write a reason first: a few words on why this setting fits.')
    this.dialSaved = { ...this.dial, reason: why }
    this.dialWasSet = true
    try {
      this.store?.setItem(DIAL_KEY, JSON.stringify(this.dialSaved))
    } catch { /* full or blocked: the choice still holds for this visit */ }
    this.recordUiEvent('ai_dial_set', this.dial.setting)
    this.notify()
  }

  /**
   * What the student decided and made in the lesson, for the "My AI rules"
   * card: their game's dial, the thing they made real, and the dial they set
   * for each real-life app. Parts they have not done yet come back empty.
   */
  card() {
    const all = Object.values(this.levelProperties)
    const terms = this.worlds.worlds[this.world].terms
    const starter = this.starters[terms.world ?? this.world]
    const template = all.find(p => p.levelData?.addThing)?.projectTemplateLevelName
    const thing = studentThing(this.loadProject(template), starter)
    const scenarios = all.find(p => p.levelData?.realLife)?.levelData.realLife.scenarios ?? []
    const experiments = Object.entries(EXPERIMENTS).flatMap(([level, tasks]) => tasks.map(task => ({
      title: task.title, ...this.experiments[level]?.[task.id],
    })))
    const activity = (this.unit.lessons[0]?.levels ?? []).map(level => {
      const id = Number(level.activeId)
      let completed = this.passed.has(id)
      if (EXPERIMENTS[id]) completed = this.experimentsComplete(id) && (id !== 9007 || Boolean(this.dialSaved && isReason(this.dialSaved.reason)))
      if (id === 9003) completed = completed && Boolean(thing)
      if (id === 9009) completed = scenarios.every(s => this.realLifeAnswered(s.id))
      const routes = [...new Set(Object.values(this.experiments[id] ?? {}).map(e => e.route))]
      return { title: this.levelProperties[id]?.displayName ?? String(id), completed,
        route: routes.length === 2 ? 'live and recorded' : routes[0] === 'recorded' ? 'recorded examples' : routes[0] === 'live' ? 'live attempts' : null }
    })
    return {
      title: starter.title,
      activity,
      observedExample: experiments.find(e => e.evidence && e.observation) ?? null,
      experiments,
      dial: this.dialSaved
        ? { ...this.dialSaved, name: DIAL[this.dialSaved.setting].name, meaning: DIAL[this.dialSaved.setting].meaning }
        : null,
      thing: thing
        ? { name: thing.name, description: thing.description, portable: thing.portable !== false, aliases: [...(thing.aliases ?? [])] }
        : null,
      realLife: scenarios.map(scenario => {
        const answer = this.realLife[scenario.id]
        const setting = answer?.setting ?? null
        return {
          id: scenario.id,
          title: scenario.title,
          setting,
          name: setting ? DIAL[setting].short : null,
          means: setting ? scenario.options[setting] : null,
          reason: answer?.reason ?? '',
        }
      }),
    }
  }

  /** Record the student's dial setting, and reason, for one real-life scenario. */
  setRealLife(id, { setting, reason }) {
    const scenario = this.properties?.levelData.realLife?.scenarios.find(s => s.id === id)
    if (!scenario) throw new Error(`This level has no scenario '${id}'.`)
    const answer = { setting: null, reason: '', ...this.realLife[id] }
    if (setting !== undefined) {
      if (!Object.hasOwn(scenario.options, setting)) {
        throw new Error(`'${setting}' is not a setting for '${id}'.`)
      }
      answer.setting = setting
    }
    if (reason !== undefined) answer.reason = String(reason).slice(0, 200)
    this.realLife = { ...this.realLife, [id]: answer }
    try {
      this.store?.setItem(REAL_LIFE_KEY, JSON.stringify(this.realLife))
    } catch { /* full or blocked: the answers still count for this visit */ }
    this.noteRealLife()
    this.noteExperiments()
    this.progress.updateProgress()
    this.notePassed()
    this.notify()
  }

  /** A scenario counts once it has both a setting and a reason. */
  realLifeAnswered(id) {
    const answer = this.realLife[id]
    return Boolean(answer?.setting) && isReason(answer.reason)
  }

  noteRealLife() {
    const scenarios = this.properties?.levelData.realLife?.scenarios
    if (scenarios?.every(s => this.realLifeAnswered(s.id))) {
      this.validator.recordUiEvent('real_life_dials_set')
    }
  }

  applyDial({ setting, tone, theme }) {
    if (!this.game) return
    this.game.setAi({ aiMode: setting, style: { tone, theme } })
  }

  exportLog() {
    return this.game.exportLog({
      lesson: {
        unit: this.unit.name ?? this.unit.id,
        lesson: this.lessonPosition,
        level: this.levelPosition,
        levelId: Number(this.properties.id),
        levelName: this.properties.name,
        world: this.world,
        dial: { ...this.dial },
        dialSaved: this.dialSaved ? { ...this.dialSaved } : null,
        dialWasSet: this.dialWasSet,
        realLife: structuredClone(this.realLife),
        experiments: structuredClone(this.experiments),
      },
    })
  }

  projectKey(template) {
    const suffix = this.world === 'space' ? '' : `:${this.world}`
    return PROJECT_PREFIX + template + suffix
  }

  static parseRoute(hash) {
    const match = /^#learn\/([^/]+)\/(\d+)\/(\d+)$/.exec(hash)
    if (!match) return null
    return {
      unit: match[1],
      lesson: Number(match[2]),
      level: Number(match[3]),
    }
  }
}
