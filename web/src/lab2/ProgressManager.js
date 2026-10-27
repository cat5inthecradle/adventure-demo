// Lab-agnostic progress tracking for levels with validation conditions.

export class Validator {
  shouldCheckConditions() {
    throw new Error('Validator.shouldCheckConditions() must be implemented')
  }

  shouldCheckNextConditionsOnly() {
    throw new Error('Validator.shouldCheckNextConditionsOnly() must be implemented')
  }

  checkConditions() {
    throw new Error('Validator.checkConditions() must be implemented')
  }

  /** @param {{name: string, value?: *}[]} conditions */
  conditionsMet(conditions) {
    throw new Error('Validator.conditionsMet() must be implemented')
  }

  /** @param {boolean} [isChangingLevels] */
  clear(isChangingLevels) {
    throw new Error('Validator.clear() must be implemented')
  }

  getValidationResults() {
    throw new Error('Validator.getValidationResults() must be implemented')
  }
}

export function getInitialValidationState() {
  return {
    hasConditions: false,
    satisfied: false,
    message: null,
    callout: undefined,
    index: 0,
  }
}

export default class ProgressManager {
  /** @param {() => void} onProgressChange */
  constructor(onProgressChange) {
    this.currentValidations = undefined
    this.validator = undefined
    this.onProgressChange = onProgressChange
    this.currentValidationState = getInitialValidationState()
  }

  /** @param {Array<Object>} [validations] */
  onLevelChange(validations) {
    this.currentValidations = validations
    this.resetValidation(true)
  }

  /** @param {Validator} validator */
  setValidator(validator) {
    this.validator = validator
  }

  getCurrentState() {
    return this.currentValidationState
  }

  updateProgress() {
    if (!this.validator) return
    if (!this.currentValidations?.length) return
    if (!this.validator.shouldCheckConditions()) return

    this.validator.checkConditions()

    for (const validation of this.currentValidations) {
      if (this.validator.shouldCheckNextConditionsOnly() && !validation.next) {
        continue
      }

      if (validation.conditions) {
        this.currentValidationState.validationResults =
          this.validator.getValidationResults()

        if (this.validator.conditionsMet(validation.conditions)) {
          if (!this.currentValidationState.satisfied) {
            this.currentValidationState.satisfied = validation.next
            this.currentValidationState.message = validation.message
            this.currentValidationState.callout = validation.callout
            this.onProgressChange()
          }
          return
        }
      } else {
        this.currentValidationState.message = validation.message
      }
    }

    this.onProgressChange()
  }

  /** @param {boolean} [isChangingLevels=false] */
  resetValidation(isChangingLevels = false) {
    if (this.validator) {
      this.validator.clear(isChangingLevels)
    }

    this.currentValidationState = {
      hasConditions: Boolean(this.currentValidations?.length),
      satisfied: false,
      message: null,
      callout: undefined,
      index: this.currentValidationState.index + 1,
    }

    this.onProgressChange()
  }
}
