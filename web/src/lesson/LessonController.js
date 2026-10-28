import { createGame } from '../game.js'
import ProgressManager from '../lab2/ProgressManager.js'
import { nextDestination, resolveCourseLevel } from '../lab2/resolveCourseLevel.js'
import AdventureValidator from '../adventure/AdventureValidator.js'
import { parseLevelProperties } from '../adventure/levelKind.js'
import { loadWorld } from '../engine/loader.js'
import { storage } from '../storage.js'
import lessonWorlds from '../../../curriculum/hour-of-ai/worlds.json'

const PROJECT_PREFIX = 'adventure-lab:project:'
const LIBRARY_PREFIX = 'adventure-lab:lesson-library:'
const WORLD_KEY = 'adventure-lab:lesson-world'

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
    this.interpreter = interpreter
    this.level = null
    this.properties = null
    this.lessonPosition = null
    this.levelPosition = null
    this.game = null
    this.listeners = new Set()
    this.dial = { setting: 'understand', tone: null, theme: null }
    this.dialWasSet = false

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
    this.progress.updateProgress()
    this.notify()
    return this.level
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
    this.validator.recordTurn(turn, world)
    this.progress.updateProgress()
  }

  onWorldApplied(raw) {
    const template = this.properties?.projectTemplateLevelName
    if (template) {
      try {
        this.store?.setItem(this.projectKey(template), JSON.stringify(raw))
      } catch { /* full or blocked: the lesson can still continue */ }
    }
    this.validator.setDefinition(raw)
    this.progress.updateProgress()
  }

  recordUiEvent(name, value) {
    this.validator.recordUiEvent(name, value)
    this.progress.updateProgress()
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
    return Boolean(this.properties?.freePlay || this.state().satisfied)
  }

  next() {
    return nextDestination(this.level)
  }

  onChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  notify() {
    for (const listener of this.listeners) listener()
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
        dialWasSet: this.dialWasSet,
      },
    })
  }

  get libraryKey() {
    const template = this.properties?.projectTemplateLevelName
    if (!template) return null
    const suffix = this.world === 'space' ? '' : `:${this.world}`
    return LIBRARY_PREFIX + template + suffix
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
