import { firstStepToward } from '../engine/queries.js'

// Hints read the current world; asking for one never changes it.
export function lessonHint(controller) {
  const world = controller.game?.world.value
  const terms = controller.worlds.worlds[controller.world].terms
  const level = controller.levelPosition
  const result = (goal, clue, command) => ({ key: `${level}:${command}`, goal, clue, command })
  if (level === 1 && world) {
    if (world.outcome === 'win') return result('You solved the puzzle.', 'Continue to find out how the game understood you.', null)
    const opening = world.interactions[0], ending = world.interactions[1]
    const tool = world.items[opening.item_id], container = world.items[opening.target_id]
    const prize = world.items[ending.item_id], target = world.items[ending.target_id]
    const opened = Object.keys(opening.requires_flags).some(flag => world.flags[flag])
    let destination, command, clue
    if (!opened && tool.location !== 'inventory') {
      destination = tool.location; command = `take ${tool.name}`
      clue = `${tool.description} Find it in the ${world.rooms[destination]?.name ?? terms.startRoom}.`
    } else if (!opened) {
      destination = container.location; command = `use ${tool.name} on ${container.name}`
      clue = `You have the ${tool.name}. Try using it on the ${container.name}.`
    } else if (prize.location !== 'inventory') {
      destination = prize.location; command = `take ${prize.name}`
      clue = `The ${container.name} is open. Collect the ${prize.name}.`
    } else {
      destination = target.location; command = `use ${prize.name} on ${target.name}`
      clue = `You have the ${prize.name}. Bring it to the ${target.name}.`
    }
    if (destination !== world.player_location) {
      const direction = firstStepToward(world, destination)
      command = direction ? `go ${direction}` : 'look'
    }
    return result(`Your goal is to ${terms.goal}.`, clue, command)
  }
  if (level === 2) return result('Compare the room description with the objects the game knows.', `The story mentions a ${terms.detailShort}. Examine it, then choose Inspect latest command.`, `examine ${terms.detailShort}`)
  if (level === 3) return result('Compare two requests and explain what the AI and game did.', 'Try an ordinary request and an impossible one. Review experiments saves your observations; recorded examples work without a model.', 'can you grab the ' + terms.toolShort + ' for me')
  if (level === 4) return result('Compare interpretation, generated scenery, and invented dialogue.', 'Use Review experiments to see what remains. Recorded examples can cover any missing result. Save a dial preference and reason separately.', null)
  if (level === 5) return result('Make the missing detail into an object with rules.', `Give the ${terms.detailShort} a description in Add a thing and apply it. Then examine it in the game.`, `examine ${terms.detailShort}`)
  return result('Choose how much AI each app should be allowed to do.', 'For each app, select a setting and write a reason. Explain a consequence, such as what could happen if the AI invented information.', null)
}
