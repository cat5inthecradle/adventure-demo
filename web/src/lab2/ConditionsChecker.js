// Accumulates satisfied conditions and checks them against requirements.

/**
 * @param {*} left
 * @param {*} right
 * @returns {boolean}
 */
function isDeepEqual(left, right) {
  if (Object.is(left, right)) return true
  if (left === null || right === null) return false
  if (typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every(key =>
    Object.prototype.hasOwnProperty.call(right, key) &&
    isDeepEqual(left[key], right[key])
  )
}

export default class ConditionsChecker {
  /** @param {string[]} conditionNames */
  constructor(conditionNames) {
    this.currentSatisfiedConditions = []
    this.conditionNames = conditionNames
  }

  clear() {
    this.currentSatisfiedConditions = []
  }

  /** @param {{name: string, value?: *}} condition */
  addSatisfiedCondition(condition) {
    if (!this.hasCondition(condition)) {
      this.currentSatisfiedConditions.push(condition)
    }
  }

  /**
   * @param {{name: string, value?: *}} condition
   * @returns {boolean}
   */
  hasCondition(condition) {
    return this.currentSatisfiedConditions.some(currentCondition =>
      isDeepEqual(currentCondition, condition)
    )
  }

  /**
   * @param {{name: string, value?: *}[]} requiredConditions
   * @returns {boolean}
   */
  checkRequirementConditions(requiredConditions) {
    for (const requiredCondition of requiredConditions) {
      if (!this.conditionNames.includes(requiredCondition.name)) continue
      if (!this.hasCondition(requiredCondition)) return false
    }

    return true
  }
}
