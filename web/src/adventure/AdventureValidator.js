import ConditionsChecker from '../lab2/ConditionsChecker.js'
import { Validator } from '../lab2/ProgressManager.js'
import { normalizeWorld } from '../engine/models.js'
import { AdventureConditions } from './conditions.js'

const conditionNames = Object.values(AdventureConditions).map(condition => condition.name)
const uiConditionNames = new Set(Object.values(AdventureConditions)
  .filter(condition => condition.source === 'ui')
  .map(condition => condition.name))

const sameCondition = (left, right) =>
  left.name === right.name && Object.is(left.value, right.value) &&
  Object.hasOwn(left, 'value') === Object.hasOwn(right, 'value')

const isAuthoredMessage = value => typeof value === 'string' && value.length > 0

function findEntity(world, id) {
  if (id == null) return null
  for (const table of [world?.items, world?.npcs, world?.doors]) {
    if (table && Object.hasOwn(table, id)) return table[id]
  }
  return null
}

function entityHasWord(entity, requestedWord) {
  if (!entity || typeof requestedWord !== 'string') return false
  const word = requestedWord.trim().toLowerCase()
  if (!word) return false
  return [entity.name, ...(entity.aliases ?? [])].some(value =>
    typeof value === 'string' &&
    (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).includes(word)
  )
}

function allEntities(world) {
  if (!world) return []
  return [world.items, world.npcs, world.doors]
    .flatMap(table => Object.values(table ?? {}))
}

export default class AdventureValidator extends Validator {
  constructor() {
    super()
    this.conditionsChecker = new ConditionsChecker(conditionNames)
    this.definition = null
    this.playAndUiConditions = []
    this.examinedEntities = []
  }

  setDefinition(rawWorld) {
    this.definition = normalizeWorld(rawWorld)
  }

  recordTurn(turn, world) {
    const events = turn?.events ?? []
    const failures = events.filter(event => event.type === 'action_failed')

    if (world?.outcome === 'win') {
      this.addPlayOrUiCondition({ name: AdventureConditions.GAME_WON.name })
    }

    if (failures.length > 0) {
      this.addPlayOrUiCondition({ name: AdventureConditions.TURN_FAILED.name })
      for (const failure of failures) {
        this.addPlayOrUiCondition({
          name: AdventureConditions.TURN_FAILED.name,
          value: failure.reason,
        })
      }
    } else if (turn?.parseError && !turn.action) {
      this.addPlayOrUiCondition({ name: AdventureConditions.TURN_FAILED.name })
      this.addPlayOrUiCondition({
        name: AdventureConditions.TURN_FAILED.name,
        value: 'not_understood',
      })
    }

    for (const event of events) {
      if (event.type === 'entity_examined') {
        const entity = findEntity(world, event.entity?.id)
        if (entity) {
          this.examinedEntities.push({
            name: entity.name,
            aliases: [...(entity.aliases ?? [])],
          })
        }
      }

      if (event.type === 'action_failed') {
        this.recordRefusal(event, world)
      }

      if (event.type === 'door_opened') {
        const door = world?.doors?.[event.door?.id]
        if (door?.unlock_flag != null) {
          this.addPlayOrUiCondition({
            name: AdventureConditions.OPENED_DOOR_LOCKED_BY_FLAG.name,
          })
        }
      }
    }

    for (const [flag, value] of Object.entries(world?.flags ?? {})) {
      if (value === true) {
        this.addPlayOrUiCondition({
          name: AdventureConditions.FLAG_SET.name,
          value: flag,
        })
      }
    }

    if (turn?.route === 'interpreter') {
      this.addPlayOrUiCondition({
        name: turn.action
          ? AdventureConditions.INTERPRETER_UNDERSTOOD.name
          : AdventureConditions.INTERPRETER_CLARIFIED.name,
      })
    }
  }

  recordUiEvent(name, value) {
    if (!uiConditionNames.has(name)) return
    this.addPlayOrUiCondition({ name })
    if (value !== null && value !== undefined) {
      this.addPlayOrUiCondition({ name, value })
    }
  }

  shouldCheckConditions() {
    return true
  }

  shouldCheckNextConditionsOnly() {
    return false
  }

  checkConditions() {
    this.conditionsChecker.clear()
    for (const condition of this.playAndUiConditions) {
      this.conditionsChecker.addSatisfiedCondition(condition)
    }
    this.addDefinitionConditions()
  }

  conditionsMet(conditions) {
    for (const condition of conditions) {
      if (condition.name === AdventureConditions.EXAMINED_MATCHING.name &&
          this.examinedEntities.some(entity => entityHasWord(entity, condition.value))) {
        this.conditionsChecker.addSatisfiedCondition({
          name: AdventureConditions.EXAMINED_MATCHING.name,
          value: condition.value,
        })
      }
      if (condition.name === AdventureConditions.ENTITY_NAMED_MATCHING.name &&
          allEntities(this.definition).some(entity => entityHasWord(entity, condition.value))) {
        this.conditionsChecker.addSatisfiedCondition({
          name: AdventureConditions.ENTITY_NAMED_MATCHING.name,
          value: condition.value,
        })
      }
    }
    return this.conditionsChecker.checkRequirementConditions(conditions)
  }

  clear() {
    this.playAndUiConditions = []
    this.examinedEntities = []
    this.conditionsChecker.clear()
  }

  getValidationResults() {
    return undefined
  }

  addPlayOrUiCondition(condition) {
    if (!this.playAndUiConditions.some(current => sameCondition(current, condition))) {
      this.playAndUiConditions.push(condition)
    }
    this.conditionsChecker.addSatisfiedCondition(condition)
  }

  recordRefusal(event, world) {
    const item = world?.items?.[event.subject?.id]
    if (!item) return
    const toolHints = Object.values(item.open_refusal_with ?? {})
      .filter(isAuthoredMessage)
    const isToolHint = toolHints.includes(event.message)
    const isPlainRefusal = isAuthoredMessage(item.open_refusal) &&
      event.message === item.open_refusal

    if (isPlainRefusal || isToolHint) {
      this.addPlayOrUiCondition({
        name: AdventureConditions.SAW_CUSTOM_REFUSAL.name,
        value: item.id,
      })
    }
    if (isToolHint) {
      this.addPlayOrUiCondition({
        name: AdventureConditions.SAW_TOOL_HINT.name,
        value: item.id,
      })
    }
  }

  addDefinitionConditions() {
    if (!this.definition) return

    for (const item of Object.values(this.definition.items)) {
      if (isAuthoredMessage(item.open_refusal)) {
        this.conditionsChecker.addSatisfiedCondition({
          name: AdventureConditions.ITEM_HAS_OPEN_REFUSAL.name,
          value: item.id,
        })
      }
      if (Object.values(item.open_refusal_with).some(isAuthoredMessage)) {
        this.conditionsChecker.addSatisfiedCondition({
          name: AdventureConditions.ITEM_HAS_TOOL_HINT.name,
          value: item.id,
        })
      }
    }

    const usedDoorIds = new Set(Object.values(this.definition.rooms)
      .flatMap(room => Object.values(room.exits))
      .map(exit => exit.door_id)
      .filter(id => id != null))
    const hasFlagLockedDoor = Object.values(this.definition.doors).some(door =>
      door.locked === true && door.unlock_flag != null && usedDoorIds.has(door.id)
    )
    if (hasFlagLockedDoor) {
      this.conditionsChecker.addSatisfiedCondition({
        name: AdventureConditions.DOOR_LOCKED_BY_FLAG.name,
      })
    }
  }
}
