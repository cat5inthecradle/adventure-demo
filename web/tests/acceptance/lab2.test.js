// Acceptance tests for src/lab2/: the lab-agnostic progress system and level
// resolution, ported from Code.org's Lab2 (apps/src/lab2/progress) and Studio
// (frontend/apps/studio/src/modules/labs/router/resolveCourseLevel.ts).

import { describe, expect, it, vi } from 'vitest'
import ProgressManager, { Validator, getInitialValidationState } from '../../src/lab2/ProgressManager.js'
import ConditionsChecker from '../../src/lab2/ConditionsChecker.js'
import { CourseLevelNotFoundError, nextDestination, resolveCourseLevel } from '../../src/lab2/resolveCourseLevel.js'

describe('ConditionsChecker', () => {
  it('requires every known condition, by exact name and value', () => {
    const checker = new ConditionsChecker(['a', 'b'])
    checker.addSatisfiedCondition({ name: 'a', value: 2 })
    expect(checker.checkRequirementConditions([{ name: 'a', value: 2 }])).toBe(true)
    expect(checker.checkRequirementConditions([{ name: 'a', value: 3 }])).toBe(false)
    expect(checker.checkRequirementConditions([{ name: 'a' }])).toBe(false)
    expect(checker.checkRequirementConditions([{ name: 'a', value: 2 }, { name: 'b' }])).toBe(false)
  })

  it('skips conditions it does not know', () => {
    const checker = new ConditionsChecker(['a'])
    expect(checker.checkRequirementConditions([{ name: 'not_built_yet', value: 1 }])).toBe(true)
    expect(checker.checkRequirementConditions([{ name: 'a' }, { name: 'not_built_yet' }])).toBe(false)
  })

  it('stores a condition once and forgets everything on clear', () => {
    const checker = new ConditionsChecker(['a'])
    checker.addSatisfiedCondition({ name: 'a' })
    checker.addSatisfiedCondition({ name: 'a' })
    expect(checker.checkRequirementConditions([{ name: 'a' }])).toBe(true)
    checker.clear()
    expect(checker.checkRequirementConditions([{ name: 'a' }])).toBe(false)
  })
})

/** A validator whose satisfied conditions the test sets directly. */
class FakeValidator extends Validator {
  constructor() {
    super()
    this.checker = new ConditionsChecker(['done', 'half', 'other'])
    this.checking = true
    this.checks = 0
    this.cleared = []
  }
  shouldCheckConditions() { return this.checking }
  shouldCheckNextConditionsOnly() { return false }
  checkConditions() { this.checks++ }
  conditionsMet(conditions) { return this.checker.checkRequirementConditions(conditions) }
  clear(isChangingLevels) { this.cleared.push(isChangingLevels); this.checker.clear() }
  getValidationResults() { return undefined }
  satisfy(name) { this.checker.addSatisfiedCondition({ name }) }
}

const VALIDATIONS = [
  { key: 'win', conditions: [{ name: 'done' }], message: 'You did it!', next: true },
  { key: 'partway', conditions: [{ name: 'half' }], message: 'Halfway there.', next: false },
]

function setup(validations = VALIDATIONS) {
  const onChange = vi.fn()
  const manager = new ProgressManager(onChange)
  const validator = new FakeValidator()
  manager.setValidator(validator)
  manager.onLevelChange(validations)
  return { manager, validator, onChange }
}

describe('ProgressManager', () => {
  it('starts empty', () => {
    expect(getInitialValidationState()).toEqual({
      hasConditions: false, satisfied: false, message: null, callout: undefined, index: 0,
    })
  })

  it('reports whether a level has conditions', () => {
    expect(setup().manager.getCurrentState().hasConditions).toBe(true)
    expect(setup([]).manager.getCurrentState().hasConditions).toBe(false)
  })

  it('does nothing without a validator', () => {
    const manager = new ProgressManager(() => {})
    manager.onLevelChange(VALIDATIONS)
    expect(() => manager.updateProgress()).not.toThrow()
    expect(manager.getCurrentState().message).toBeNull()
  })

  it('shows feedback for a validation that does not pass the level', () => {
    const { manager, validator, onChange } = setup()
    validator.satisfy('half')
    onChange.mockClear()
    manager.updateProgress()
    expect(validator.checks).toBe(1)
    expect(manager.getCurrentState()).toMatchObject({ satisfied: false, message: 'Halfway there.' })
    expect(onChange).toHaveBeenCalled()
  })

  it('uses the first validation, in order, whose conditions are met', () => {
    const { manager, validator } = setup()
    validator.satisfy('half')
    validator.satisfy('done')
    manager.updateProgress()
    expect(manager.getCurrentState()).toMatchObject({ satisfied: true, message: 'You did it!' })
  })

  it('stays satisfied once a level is passed', () => {
    const { manager, validator } = setup([
      { key: 'win', conditions: [{ name: 'done' }], message: 'You did it!', next: true },
      { key: 'other', conditions: [{ name: 'other' }], message: 'Something else.', next: false },
    ])
    validator.satisfy('done')
    manager.updateProgress()
    validator.checker.clear()
    validator.satisfy('other')
    manager.updateProgress()
    expect(manager.getCurrentState()).toMatchObject({ satisfied: true, message: 'You did it!' })
  })

  it('does not check while the validator says not to', () => {
    const { manager, validator } = setup()
    validator.checking = false
    validator.satisfy('done')
    manager.updateProgress()
    expect(validator.checks).toBe(0)
    expect(manager.getCurrentState().satisfied).toBe(false)
  })

  it('shows the message of a validation that has no conditions', () => {
    const { manager } = setup([{ key: 'hint', message: 'Try opening the crate.', next: false }])
    manager.updateProgress()
    expect(manager.getCurrentState().message).toBe('Try opening the crate.')
  })

  it('resets on a level change, clears the validator, and bumps the index', () => {
    const { manager, validator } = setup()
    validator.satisfy('done')
    manager.updateProgress()
    const before = manager.getCurrentState().index
    manager.onLevelChange([{ key: 'x', conditions: [{ name: 'other' }], message: 'x', next: true }])
    expect(validator.cleared.at(-1)).toBe(true)
    expect(manager.getCurrentState()).toMatchObject({ satisfied: false, message: null, hasConditions: true })
    expect(manager.getCurrentState().index).toBe(before + 1)
  })
})

const STRUCTURE = {
  id: 1,
  name: 'hoai-adventure',
  title: 'Adventure Lab: Hour of AI',
  lessons: [{
    id: 10,
    position: 1,
    name: 'Adventure Lab',
    script_name: 'hoai-adventure',
    levels: [
      { id: '101', ids: ['9001'], activeId: '9001', position: 1, path: '#learn/hoai-adventure/1/1' },
      { id: '102', ids: ['9002'], activeId: '9002', position: 2, path: '#learn/hoai-adventure/1/2' },
    ],
  }],
}
const PROPERTIES = {
  9001: { id: 9001, name: 'one', appName: 'adventure' },
  9002: { id: 9002, name: 'two', appName: 'adventure' },
}

describe('resolveCourseLevel', () => {
  it('finds the level, its properties and its neighbours', () => {
    const resolved = resolveCourseLevel(STRUCTURE, PROPERTIES, 1, 2)
    expect(resolved).toMatchObject({
      levelId: 9002,
      scriptLevelId: '102',
      position: 2,
      totalLevels: 2,
      scriptName: 'hoai-adventure',
      scriptTitle: 'Adventure Lab: Hour of AI',
      properties: PROPERTIES[9002],
    })
    expect(resolved.levels.map(l => l.path)).toEqual(['#learn/hoai-adventure/1/1', '#learn/hoai-adventure/1/2'])
  })

  it('names what is missing', () => {
    expect(() => resolveCourseLevel(STRUCTURE, PROPERTIES, 2, 1)).toThrow(CourseLevelNotFoundError)
    expect(() => resolveCourseLevel(STRUCTURE, PROPERTIES, 1, 3)).toThrow(CourseLevelNotFoundError)
    expect(() => resolveCourseLevel(STRUCTURE, { 9001: PROPERTIES[9001] }, 1, 2)).toThrow(/9002/)
  })
})

describe('nextDestination', () => {
  it('goes to the next level, then to the finish link', () => {
    expect(nextDestination(resolveCourseLevel(STRUCTURE, PROPERTIES, 1, 1))).toEqual({ to: '#learn/hoai-adventure/1/2' })
    const last = resolveCourseLevel(STRUCTURE, PROPERTIES, 1, 2)
    expect(nextDestination(last)).toEqual({ href: '/s/hoai-adventure' })
    expect(nextDestination({ ...last, finishLink: '#done' })).toEqual({ href: '#done' })
    expect(nextDestination({ ...last, properties: { finishUrl: '#celebrate' } })).toEqual({ href: '#celebrate' })
  })
})
