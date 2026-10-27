/** Thrown when the requested course, lesson, or level has no match. */
export class CourseLevelNotFoundError extends Error {}

/**
 * @param {Object} structure
 * @param {Object.<string, Object>} levelPropertiesMap
 * @param {number} lessonPosition
 * @param {number} levelPosition
 * @returns {Object}
 */
export function resolveCourseLevel(
  structure,
  levelPropertiesMap,
  lessonPosition,
  levelPosition
) {
  const lesson = structure.lessons.find(l => l.position === lessonPosition)
  if (!lesson) {
    throw new CourseLevelNotFoundError(
      `Lesson not found at position ${lessonPosition} in "${structure.name}"`
    )
  }

  const levels = lesson.levels.map(level => ({
    position: level.position,
    levelId: parseInt(level.activeId, 10),
    scriptLevelId: level.id,
    path: level.path,
  }))

  const structureLevel = lesson.levels.find(
    level => level.position === levelPosition
  )
  if (!structureLevel) {
    throw new CourseLevelNotFoundError(
      `Level not found at position ${levelPosition} in lesson ${lessonPosition}`
    )
  }

  const activeId = structureLevel.activeId
  const properties = levelPropertiesMap[activeId]
  if (!properties) {
    throw new CourseLevelNotFoundError(
      `Level properties not found for level ${activeId} (position ${levelPosition})`
    )
  }

  return {
    levelId: parseInt(activeId, 10),
    scriptLevelId: structureLevel.id,
    position: levelPosition,
    totalLevels: lesson.levels.length,
    scriptName: lesson.script_name,
    scriptTitle: structure.title ?? structure.name,
    finishLink: lesson.finishLink,
    properties,
    levels,
  }
}

/**
 * @param {Object} resolved
 * @returns {{to: string}|{href: string}}
 */
export function nextDestination(resolved) {
  const currentIndex = resolved.levels.findIndex(
    level => level.position === resolved.position
  )
  const nextLevel = resolved.levels[currentIndex + 1]
  if (nextLevel) return { to: nextLevel.path }

  return {
    href: resolved.properties.finishUrl ??
      resolved.finishLink ??
      `/s/${resolved.scriptName}`,
  }
}
