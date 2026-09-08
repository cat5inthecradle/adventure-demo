"""Pure read-only helpers over WorldState. Never mutates, never performs I/O."""

from adventure.events import EntityRef
from collections import deque

from adventure.models import (
    DIRECTION_ORDER,
    LOC_INVENTORY,
    CounterCondition,
    Door,
    Item,
    NPC,
    Room,
    WorldState,
)


def current_room(world: WorldState) -> Room:
    """The room the player is standing in."""
    return world.rooms[world.player_location]


def items_in_room(world: WorldState, room_id: str) -> list[Item]:
    """Items whose location is this room, in world file order."""
    return [item for item in world.items.values() if item.location == room_id]


def npcs_in_room(world: WorldState, room_id: str) -> list[NPC]:
    """NPCs standing in this room, in world file order."""
    return [npc for npc in world.npcs.values() if npc.location == room_id]


def inventory(world: WorldState) -> list[Item]:
    """Items the player is carrying, in world file order."""
    return [item for item in world.items.values() if item.location == LOC_INVENTORY]


def doors_in_room(world: WorldState, room_id: str) -> list[Door]:
    """Doors attached to any exit of the room, deduplicated, in exit order."""
    doors: list[Door] = []
    seen: set[str] = set()
    for exit_ in world.rooms[room_id].exits.values():
        if exit_.door_id is None or exit_.door_id in seen:
            continue
        seen.add(exit_.door_id)
        doors.append(world.doors[exit_.door_id])
    return doors


def visible_entities(world: WorldState) -> list[Item | NPC | Door]:
    """Everything the player can currently refer to: items in the current room +
    inventory + NPCs here + doors here."""
    room_id = world.player_location
    entities: list[Item | NPC | Door] = []
    entities.extend(items_in_room(world, room_id))
    entities.extend(inventory(world))
    entities.extend(npcs_in_room(world, room_id))
    entities.extend(doors_in_room(world, room_id))
    return entities


def find_entity(world: WorldState, entity_id: str) -> Item | NPC | Door | Room | None:
    """Look an entity up by id across every table. Ignores visibility."""
    for table in (world.items, world.npcs, world.doors, world.rooms):
        if entity_id in table:
            return table[entity_id]
    return None


def entity_ref(entity: Item | NPC | Door | Room) -> EntityRef:
    """The (id, name) pair events carry instead of whole entities."""
    return EntityRef(id=entity.id, name=entity.name)


def resolved_description(world: WorldState, obj: Item | Room) -> str:
    """alt_description if alt_flag is set and truthy in world.flags, else description."""
    if obj.alt_flag is not None and obj.alt_description is not None:
        if world.flags.get(obj.alt_flag, False):
            return obj.alt_description
    return obj.description


def resolved_sounds(world: WorldState, room: Room) -> str | None:
    """What can be heard in this room, alt-resolved on the same flag that swaps the
    description — a ship that comes back to life should sound like it."""
    if room.alt_flag is not None and room.alt_sounds is not None:
        if world.flags.get(room.alt_flag, False):
            return room.alt_sounds
    return room.sounds


def flags_match(world: WorldState, required: dict[str, bool]) -> bool:
    """True when every required flag matches world.flags (absent counts as False)."""
    return all(world.flags.get(name, False) == wanted for name, wanted in required.items())


def counters_match(world: WorldState, required: dict[str, CounterCondition]) -> bool:
    """True when every counter sits inside its required range. An unset counter
    reads as 0, so a world need only name the counters it has moved."""
    for name, condition in required.items():
        value = world.counters.get(name, 0)
        if condition.at_least is not None and value < condition.at_least:
            return False
        if condition.at_most is not None and value > condition.at_most:
            return False
    return True


def doors_match(world: WorldState, required: dict[str, bool]) -> bool:
    """True when every named door is open (or shut) as required.

    Door state is real state, and a rule that needs a hatch open should say so
    rather than shadowing it with a flag the `open` command would never set.
    """
    return all(world.doors[door_id].open == wanted for door_id, wanted in required.items())


def conditions_match(world: WorldState, rule) -> bool:
    """The whole of a rule's guard: where the player is, then flags, counters and
    door state. Every rule shape — interaction, dialogue rule, listening rule,
    trigger — carries the same set, though only the ones that can fire in more than
    one place carry `rooms`."""
    rooms = getattr(rule, "rooms", ())
    if rooms and world.player_location not in rooms:
        return False
    return (flags_match(world, rule.requires_flags)
            and counters_match(world, rule.requires_counters)
            and doors_match(world, rule.requires_doors))


def visited_rooms(world: WorldState) -> set[str]:
    """Ground the player knows. Where they are standing always counts."""
    return set(world.visited) | {world.player_location}


def first_step_toward(world: WorldState, destination: str) -> str | None:
    """The direction of the first step along the shortest known route, or None.

    Deliberately returns one step rather than the whole path: the player asked to
    head somewhere, not to be teleported, and walking room by room keeps every
    door, every description and every event on the way intact.

    Routes may pass only through rooms the player has already visited. The
    destination itself may be somewhere they have merely heard of — you can set off
    toward the cargo bay the first time someone mentions it, but you cannot thread
    a shortcut through a corridor you have never walked.
    """
    if destination == world.player_location or destination not in world.rooms:
        return None

    known = visited_rooms(world)
    seen = {world.player_location}
    queue: deque[tuple[str, str]] = deque()
    for direction in DIRECTION_ORDER:
        exit_ = world.rooms[world.player_location].exits.get(direction)
        if exit_ is not None:
            queue.append((exit_.to, direction))

    while queue:
        room_id, first_step = queue.popleft()
        if room_id in seen:
            continue
        seen.add(room_id)
        if room_id == destination:
            return first_step
        if room_id not in known:
            continue                    # heard of, but not walked: no routing through
        for direction in DIRECTION_ORDER:
            exit_ = world.rooms[room_id].exits.get(direction)
            if exit_ is not None and exit_.to not in seen:
                queue.append((exit_.to, first_step))
    return None


def locate_in_known_rooms(world: WorldState, matches) -> tuple[Item | NPC, str] | None:
    """Find a thing the player has seen but is not standing next to.

    Searches only rooms they have actually walked, and never reveals a hidden item —
    telling someone where the power cell is before they have opened the crate would
    give away the puzzle.
    """
    known = visited_rooms(world) - {world.player_location}
    found: list[tuple[Item | NPC, str]] = []
    for item in world.items.values():
        if item.location in known and matches(item):
            found.append((item, item.location))
    for npc in world.npcs.values():
        if npc.location in known and matches(npc):
            found.append((npc, npc.location))
    return found[0] if len(found) == 1 else None
