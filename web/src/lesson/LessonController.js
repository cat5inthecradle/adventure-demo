import { createGame } from '../game.js'
import ProgressManager from '../lab2/ProgressManager.js'
import { nextDestination, resolveCourseLevel } from '../lab2/resolveCourseLevel.js'
import AdventureValidator from '../adventure/AdventureValidator.js'
import { parseLevelProperties } from '../adventure/levelKind.js'
import { loadWorld } from '../engine/loader.js'
import { storage } from '../storage.js'

const PROJECT_PREFIX = 'adventure-lab:project:'
const LIBRARY_PREFIX = 'adventure-lab:lesson-library:'

export default class LessonController {
  constructor({ unit, levelProperties, starters, store = storage(), interpreter = null }) {
    this.unit = unit
    this.levelProperties = levelProperties
    this.starters = starters
    this.store = store
    this.interpreter = interpreter
    this.level = null
    this.properties = null
    this.game = null
    this.listeners = new Set()

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
    const properties = parseLevelProperties(level.properties)
    const structureLevel = this.unit.lessons
      .find(lesson => lesson.position === lessonPosition)
      ?.levels.find(candidate => candidate.position === levelPosition)
    level.progression = structureLevel?.progression
    level.progressionDisplayName = structureLevel?.progression_display_name

    this.level = level
    this.properties = properties

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

    this.validator.setDefinition(worldData)
    this.progress.onLevelChange(properties.validations)
    this.progress.updateProgress()
    this.notify()
    return this.level
  }

  loadProject(template) {
    if (!template || !this.store) return null
    try {
      const raw = JSON.parse(this.store.getItem(PROJECT_PREFIX + template) ?? 'null')
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
        this.store?.setItem(PROJECT_PREFIX + template, JSON.stringify(raw))
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
    if (this.game) this.game.state.interpreter = interpreter
  }

  get libraryKey() {
    const template = this.properties?.projectTemplateLevelName
    return template ? LIBRARY_PREFIX + template : null
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
