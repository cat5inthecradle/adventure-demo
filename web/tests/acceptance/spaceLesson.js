// The Hour of AI level properties as a student who chose the space world reads
// them: every {{placeholder}} filled from curriculum/hour-of-ai/worlds.json. Tests
// written against Drift's mug, crate and droid read the lesson through this.

import raw from '../../../curriculum/hour-of-ai/level_properties.json'
import lessonWorlds from '../../../curriculum/hour-of-ai/worlds.json'

const { terms } = lessonWorlds.worlds.space
const fill = value => JSON.parse(JSON.stringify(value)
  .replace(/\{\{([^{}]+)\}\}/g, (placeholder, name) => terms[name] ?? placeholder))

export default fill(raw)
