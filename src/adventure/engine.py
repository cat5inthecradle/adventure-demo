"""The rules engine: apply(world, action) -> list[Event].

The ONLY thing that mutates WorldState, and the only source of game truth.
Never performs I/O, never uses randomness or the clock, and never raises for an
illegal player action — it returns an ActionFailed event instead.
"""

from adventure import queries
from adventure.actions import Action
from adventure.events import (
    ActionFailed,
    DoorOpened,
    EntityExamined,
    Event,
    ExitView,
    GameEnded,
    InventoryListed,
    ItemDropped,
    ItemTaken,
    ItemUsed,
    Listened,
    Moved,
    Narrated,
    NpcSpoke,
    Reason,
    RoomDescribed,
)
from adventure.models import (
    DIRECTION_ORDER,
    LOC_INVENTORY,
    Direction,
    Door,
    Effect,
    Exit,
    Item,
    NPC,
    Room,
    WorldState,
)

def apply(world: WorldState, action: Action) -> list[Event]:
    """Validate legality, mutate world in place, return events. Deterministic.
    No I/O. Never raises for illegal player actions — returns ActionFailed."""
    if world.ended:
        return [ActionFailed(reason=Reason.GAME_OVER)]

    origin = world.player_location
    # Captured before the action runs, because whatever moves the player also marks
    # the destination visited — and a room the player has stood in before must not
    # be re-read to them in full.
    seen_before = set(world.visited)

    match action.type:
        case "look":
            events = [describe_room(world)]
        case "examine":
            events = _examine(world, action.target)
        case "go":
            events = _go(world, action.direction)
        case "traverse":
            events = _traverse(world, action.target)
        case "listen":
            events = _listen(world, action.target)
        case "take":
            events = _take(world, action.item)
        case "drop":
            events = _drop(world, action.item)
        case "open":
            events = _open(world, action.target)
        case "use":
            events = _use(world, action.item, action.target)
        case "talk":
            events = _talk(world, action.npc)
        case "inventory":
            events = _inventory(world)

    if _is_only_failure(events):
        return events

    world.turn_count += 1
    # An action that put the player somewhere new owes them the new room, whether
    # they walked there or an effect threw them out of a window.
    moved = world.player_location != origin
    if moved:
        events.append(describe_room(world, world.player_location not in seen_before))
    events.extend(_run_triggers(world, moved, seen_before))
    return events


def describe_room(world: WorldState, first_visit: bool = True) -> RoomDescribed:
    """Build the RoomDescribed event for the current room (used by apply(Look)
    and by the CLI at game start / after load).

    `first_visit` is False only when the engine describes a room the player has
    already seen, on arrival. An explicit `look` always asks for the full account.
    """
    room = queries.current_room(world)
    exits: list[ExitView] = []
    for direction in DIRECTION_ORDER:
        exit_ = room.exits.get(direction)
        if exit_ is None:
            continue
        if exit_.door_id is None:
            exits.append(ExitView(direction=direction))
        else:
            door = world.doors[exit_.door_id]
            exits.append(
                ExitView(direction=direction, door=queries.entity_ref(door), door_open=door.open)
            )
    return RoomDescribed(
        first_visit=first_visit,
        room=queries.entity_ref(room),
        description=queries.resolved_description(world, room),
        exits=exits,
        items=[queries.entity_ref(item) for item in queries.items_in_room(world, room.id)],
        npcs=[queries.entity_ref(npc) for npc in queries.npcs_in_room(world, room.id)],
    )


def _run_triggers(world: WorldState, moved: bool, seen_before: set[str]) -> list[Event]:
    """The world's own turn, after the player has had theirs.

    Every matching trigger fires, in file order, each judged against the world the
    one before it left behind — so a trigger that raises a counter can arm a later
    one in the same turn. An ending stops the cascade; nothing happens after the
    last word.
    """
    events: list[Event] = []
    for trigger in world.triggers:
        if world.ended:
            break
        if trigger.once and trigger.fired:
            continue
        if trigger.when == "enter" and not moved:
            continue
        if not queries.conditions_match(world, trigger):
            continue
        trigger.fired = True
        if trigger.text:
            events.append(Narrated(trigger=trigger.id, text=trigger.text))
        here = world.player_location
        ended = _apply_effects(world, trigger.effects)
        if world.player_location != here:
            events.append(describe_room(world, world.player_location not in seen_before))
        if ended is not None:
            events.append(ended)
    return events


def _is_only_failure(events: list[Event]) -> bool:
    return len(events) == 1 and isinstance(events[0], ActionFailed)


def _not_present(world: WorldState, entity_id: str) -> ActionFailed:
    entity = queries.find_entity(world, entity_id)
    subject = queries.entity_ref(entity) if entity is not None else None
    return ActionFailed(reason=Reason.NOT_PRESENT, subject=subject)


def _examine(world: WorldState, target_id: str) -> list[Event]:
    visible = {entity.id: entity for entity in queries.visible_entities(world)}
    entity = visible.get(target_id)
    if entity is None:
        return [_not_present(world, target_id)]
    description = (
        queries.resolved_description(world, entity)
        if isinstance(entity, Item)
        else entity.description
    )
    return [EntityExamined(entity=queries.entity_ref(entity), description=description)]


def _go(world: WorldState, direction: Direction) -> list[Event]:
    room = queries.current_room(world)
    exit_ = room.exits.get(direction)
    if exit_ is None:
        return [ActionFailed(reason=Reason.NO_EXIT)]
    door = world.doors[exit_.door_id] if exit_.door_id is not None else None
    if door is not None and not door.open:
        return [ActionFailed(reason=Reason.DOOR_CLOSED, subject=queries.entity_ref(door))]
    return _pass_through(world, room, exit_, door)


def _traverse(world: WorldState, door_id: str) -> list[Event]:
    """Go through a named portal.

    Naming the door is a different request from naming a direction, and it carries
    more intent: "go out the window" already means "open it and go". So an
    unlocked door that merely happens to be shut opens on the way — a shut latch
    was never the puzzle. A LOCKED one still refuses, in the world's own words,
    which is more than plain movement has ever managed to say.
    """
    room = queries.current_room(world)
    door = world.doors.get(door_id)
    if door is None:
        return [_not_present(world, door_id)]
    way = next(
        (exit_ for direction in DIRECTION_ORDER
         if (exit_ := room.exits.get(direction)) is not None and exit_.door_id == door_id),
        None,
    )
    if way is None:
        return [ActionFailed(reason=Reason.NOT_PRESENT, subject=queries.entity_ref(door))]

    events: list[Event] = []
    if not door.open:
        if door.locked:
            unlocked = door.unlock_flag is not None and world.flags.get(door.unlock_flag, False)
            if not unlocked:
                return [
                    ActionFailed(
                        reason=Reason.DOOR_LOCKED,
                        subject=queries.entity_ref(door),
                        message=door.locked_message,
                    )
                ]
            door.locked = False
        door.open = True
        events.append(DoorOpened(door=queries.entity_ref(door), message=door.open_message))
    return events + _pass_through(world, room, way, door)


def _pass_through(
    world: WorldState, room: Room, way: Exit, door: Door | None
) -> list[Event]:
    """The move itself, however the player asked for it. An exit with something to
    say about being walked gets to say it here."""
    _relocate_player(world, way.to)
    return [
        Moved(
            from_room=queries.entity_ref(room),
            to_room=queries.entity_ref(world.rooms[way.to]),
            through=queries.entity_ref(door) if door is not None else None,
            message=way.pass_message,
        )
    ]


def _relocate_player(world: WorldState, room_id: str) -> None:
    """Put the player in a room, and take their companions with them.

    The one place player movement happens, so walking through a door and being
    thrown out of a window leave the world in the same shape.
    """
    if world.player_location not in world.visited:
        world.visited.append(world.player_location)
    followers = [npc for npc in world.npcs.values()
                 if npc.follows_player and npc.location == world.player_location]
    world.previous_location = world.player_location
    world.player_location = room_id
    for npc in followers:
        npc.location = room_id
    if room_id not in world.visited:
        world.visited.append(room_id)


def _listen(world: WorldState, target_id: str | None) -> list[Event]:
    """Hearing cascades. A portal with something to say says it; everything else —
    an unnamed listen, a plain door, a chair — gives the room's own sound.

    That cascade is the point. If only the doors that hide something answered, then
    getting an answer at all would be the tell, and the world would leak its
    ambushes by having content. Every door sounds like the room until it doesn't.
    """
    room = queries.current_room(world)
    ambient = Listened(text=queries.resolved_sounds(world, room))
    if target_id is None:
        return [ambient]

    visible = {entity.id: entity for entity in queries.visible_entities(world)}
    subject = visible.get(target_id)
    if subject is None:
        return [_not_present(world, target_id)]
    ambient.subject = queries.entity_ref(subject)
    if not isinstance(subject, Door):
        return [ambient]

    for rule in subject.listening:
        if rule.once and rule.fired:
            continue
        if not queries.conditions_match(world, rule):
            continue
        rule.fired = True
        events: list[Event] = [
            Listened(subject=queries.entity_ref(subject), text=rule.text)
        ]
        ended = _apply_effects(world, rule.effects)
        if ended is not None:
            events.append(ended)
        return events
    return [ambient]


def _take(world: WorldState, item_id: str) -> list[Event]:
    item = world.items.get(item_id)
    if item is None:
        # A player who says "take droid" is looking straight at it. Telling them
        # they cannot see it is worse than useless — it is wrong, and it sends them
        # hunting for something that is right there. Two logged sessions ran into
        # this trying to bring R-6 along.
        npc = world.npcs.get(item_id)
        if npc is not None and npc.location == world.player_location:
            return [ActionFailed(reason=Reason.NOT_PORTABLE,
                                 subject=queries.entity_ref(npc))]
        return [_not_present(world, item_id)]
    if item.location != world.player_location:
        reason = (
            Reason.ALREADY_CARRYING if item.location == LOC_INVENTORY else Reason.NOT_PRESENT
        )
        return [ActionFailed(reason=reason, subject=queries.entity_ref(item))]
    if not item.portable:
        return [ActionFailed(reason=Reason.NOT_PORTABLE, subject=queries.entity_ref(item))]
    item.location = LOC_INVENTORY
    return [ItemTaken(item=queries.entity_ref(item))]


def _drop(world: WorldState, item_id: str) -> list[Event]:
    item = world.items.get(item_id)
    if item is None or item.location != LOC_INVENTORY:
        subject = queries.entity_ref(item) if item is not None else None
        return [ActionFailed(reason=Reason.NOT_CARRYING, subject=subject)]
    item.location = world.player_location
    return [ItemDropped(item=queries.entity_ref(item))]


def _open(world: WorldState, target_id: str) -> list[Event]:
    entity = queries.find_entity(world, target_id)
    if entity is None:
        return [_not_present(world, target_id)]
    if not isinstance(entity, Door):
        return [
            ActionFailed(
                reason=Reason.NOT_OPENABLE,
                subject=queries.entity_ref(entity),
                message=_open_refusal(world, entity),
            )
        ]
    if entity.id not in {door.id for door in queries.doors_in_room(world, world.player_location)}:
        return [ActionFailed(reason=Reason.NOT_PRESENT, subject=queries.entity_ref(entity))]
    if entity.open:
        return [ActionFailed(reason=Reason.ALREADY_OPEN, subject=queries.entity_ref(entity))]
    if entity.locked:
        unlocked = entity.unlock_flag is not None and world.flags.get(entity.unlock_flag, False)
        if not unlocked:
            return [
                ActionFailed(
                    reason=Reason.DOOR_LOCKED,
                    subject=queries.entity_ref(entity),
                    message=entity.locked_message,
                )
            ]
        entity.locked = False
    entity.open = True
    return [DoorOpened(door=queries.entity_ref(entity), message=entity.open_message)]


def _open_refusal(world: WorldState, entity: Item | NPC) -> str | None:
    """The world's own words for why this will not open, if it has any.

    An item may sharpen its hint once the player carries the tool that works —
    that is the difference between a dead end and a puzzle.
    """
    if not isinstance(entity, Item):
        return None
    for item_id, message in entity.open_refusal_with.items():
        if world.items[item_id].location == LOC_INVENTORY:
            return message
    return entity.open_refusal


def _use(world: WorldState, item_id: str, target_id: str | None) -> list[Event]:
    """`use` is the engine's catch-all interaction verb, so its subject is anything
    the player can currently refer to — not only items. Listening at a door and
    taking someone by the arm are the same shape of act as slotting in a power cell,
    and the target side has always allowed doors and people."""
    visible = {entity.id: entity for entity in queries.visible_entities(world)}
    subject = visible.get(item_id)
    if subject is None:
        return [_not_present(world, item_id)]

    target: Item | NPC | Door | None = None
    if target_id is not None:
        target = visible.get(target_id)
        if target is None:
            return [_not_present(world, target_id)]

    for interaction in world.interactions:
        if interaction.item_id != item_id or interaction.target_id != target_id:
            continue
        if interaction.once and interaction.fired:
            continue
        if not queries.conditions_match(world, interaction):
            continue
        interaction.fired = True
        events: list[Event] = [
            ItemUsed(
                item=queries.entity_ref(subject),
                target=queries.entity_ref(target) if target is not None else None,
                message=interaction.message,
            )
        ]
        ended = _apply_effects(world, interaction.effects)
        if ended is not None:
            events.append(ended)
        return events

    return [ActionFailed(reason=Reason.NOTHING_HAPPENS, subject=queries.entity_ref(subject))]


def _talk(world: WorldState, npc_id: str) -> list[Event]:
    npc = world.npcs.get(npc_id)
    if npc is None or npc.location != world.player_location:
        return [_not_present(world, npc_id)]

    for rule in npc.dialogue:
        if rule.once and rule.fired:
            continue
        if not queries.conditions_match(world, rule):
            continue
        rule.fired = True
        events: list[Event] = [NpcSpoke(npc=queries.entity_ref(npc), text=rule.text)]
        ended = _apply_effects(world, rule.effects)
        if ended is not None:
            events.append(ended)
        return events

    return [ActionFailed(reason=Reason.NOTHING_HAPPENS, subject=queries.entity_ref(npc))]


def _inventory(world: WorldState) -> list[Event]:
    return [InventoryListed(items=[queries.entity_ref(item) for item in queries.inventory(world)])]


def _apply_effects(world: WorldState, effects: list[Effect]) -> GameEnded | None:
    """Apply every effect in order (no short-circuiting). Returns the ending one of
    them declared, if any — the last word wins when a rule declares more than one."""
    ending: GameEnded | None = None
    for effect in effects:
        result = _apply_effect(world, effect)
        if result is not None:
            ending = result
    return ending


def _apply_effect(world: WorldState, effect: Effect) -> GameEnded | None:
    """Apply one effect. Returns a GameEnded event if it ended the game."""
    match effect.type:
        case "set_flag":
            assert effect.flag is not None and effect.value is not None
            world.flags[effect.flag] = effect.value
        case "adjust_counter":
            assert effect.counter is not None and effect.delta is not None
            world.counters[effect.counter] = world.counters.get(effect.counter, 0) + effect.delta
        case "move_item":
            assert effect.item_id is not None and effect.to is not None
            world.items[effect.item_id].location = effect.to
        case "move_npc":
            assert effect.npc_id is not None and effect.to is not None
            world.npcs[effect.npc_id].location = effect.to
        case "move_player":
            assert effect.to is not None
            _relocate_player(world, effect.to)
        case "set_door":
            assert effect.door_id is not None
            door = world.doors[effect.door_id]
            if effect.open is not None:
                door.open = effect.open
            if effect.locked is not None:
                door.locked = effect.locked
        case "end_game" | "win_game":
            # `win_game` is the older, narrower spelling: always a win, and its
            # epilogue can only be the world-wide one.
            outcome = effect.outcome or "win"
            world.outcome = outcome
            return GameEnded(
                outcome=outcome,
                epilogue=effect.epilogue if effect.epilogue is not None else world.win_epilogue,
                banner=effect.banner,
            )
    return None
