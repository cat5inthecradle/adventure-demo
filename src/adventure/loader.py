"""Loads and validates world JSON files. Reads files; never mutates a running world."""

import json
from pathlib import Path

from adventure.models import LOC_HIDDEN, LOC_INVENTORY, Effect, WorldState
from adventure.pronouns import SETS as PRONOUN_SETS


class WorldValidationError(Exception):
    """Raised with a human-readable message naming the offending entity."""


def load_world(path: str | Path) -> WorldState:
    """Read a world JSON file, validate it structurally and referentially."""
    text = Path(path).read_text(encoding="utf-8")
    world = WorldState.model_validate(json.loads(text))
    validate_world(world)
    return world


def validate_world(world: WorldState) -> None:
    """Check referential integrity. Raises WorldValidationError naming the offender."""
    _check_keys_match_ids(world)
    _check_ids_unique(world)
    _check_player_location(world)
    _check_exits(world)
    _check_doors_referenced(world)
    _check_item_locations(world)
    _check_open_refusals(world)
    _check_npc_locations(world)
    _check_interactions(world)
    _check_triggers(world)
    _check_effects(world)
    _check_pronouns(world)
    _check_schema_version(world)


def _fail(message: str) -> None:
    raise WorldValidationError(message)


def _check_keys_match_ids(world: WorldState) -> None:
    for kind, table in (
        ("room", world.rooms),
        ("door", world.doors),
        ("item", world.items),
        ("npc", world.npcs),
    ):
        for key, value in table.items():
            if key != value.id:
                _fail(f"{kind} key '{key}' does not match its id '{value.id}'")


def _check_ids_unique(world: WorldState) -> None:
    seen: dict[str, str] = {}
    for kind, table in (
        ("room", world.rooms),
        ("door", world.doors),
        ("item", world.items),
        ("npc", world.npcs),
    ):
        for entity_id in table:
            if entity_id in seen:
                _fail(f"duplicate id '{entity_id}': used by both {seen[entity_id]} and {kind}")
            seen[entity_id] = kind


def _check_player_location(world: WorldState) -> None:
    if world.player_location not in world.rooms:
        _fail(f"player_location '{world.player_location}' is not a room id")


def _check_exits(world: WorldState) -> None:
    for room_id, room in world.rooms.items():
        for direction, exit_ in room.exits.items():
            if exit_.to not in world.rooms:
                _fail(f"room '{room_id}' exit {direction} leads to '{exit_.to}', which is not a room id")
            if exit_.door_id is not None and exit_.door_id not in world.doors:
                _fail(f"room '{room_id}' exit {direction} names door '{exit_.door_id}', which is not a door id")


def _check_doors_referenced(world: WorldState) -> None:
    referenced = {
        exit_.door_id
        for room in world.rooms.values()
        for exit_ in room.exits.values()
        if exit_.door_id is not None
    }
    for door_id in world.doors:
        if door_id not in referenced:
            _fail(f"door '{door_id}' is not referenced by any exit")


def _check_item_locations(world: WorldState) -> None:
    for item_id, item in world.items.items():
        if item.location in (LOC_INVENTORY, LOC_HIDDEN):
            continue
        if item.location not in world.rooms:
            _fail(f"item '{item_id}' has location '{item.location}', which is not a room id, 'inventory', or 'hidden'")


def _check_open_refusals(world: WorldState) -> None:
    for item_id, item in world.items.items():
        for tool_id in item.open_refusal_with:
            if tool_id not in world.items:
                _fail(
                    f"item '{item_id}' has an open_refusal_with entry for "
                    f"'{tool_id}', which is not an item id"
                )


def _check_npc_locations(world: WorldState) -> None:
    for npc_id, npc in world.npcs.items():
        if npc.location not in world.rooms:
            _fail(f"npc '{npc_id}' has location '{npc.location}', which is not a room id")


def _check_interactions(world: WorldState) -> None:
    seen: set[str] = set()
    for interaction in world.interactions:
        if interaction.id in seen:
            _fail(f"duplicate interaction id '{interaction.id}'")
        seen.add(interaction.id)
        if not _is_entity(world, interaction.item_id):
            _fail(
                f"interaction '{interaction.id}' names '{interaction.item_id}', "
                "which is not an item, npc, or door id"
            )
        target_id = interaction.target_id
        if target_id is not None and not (
            target_id in world.items or target_id in world.npcs or target_id in world.doors
        ):
            _fail(
                f"interaction '{interaction.id}' names target '{target_id}', "
                "which is not an item, npc, or door id"
            )


def _is_entity(world: WorldState, entity_id: str) -> bool:
    """Anything a player can name and act on: an item, a person, or a door."""
    return entity_id in world.items or entity_id in world.npcs or entity_id in world.doors


def _check_triggers(world: WorldState) -> None:
    seen: set[str] = set()
    for trigger in world.triggers:
        if trigger.id in seen:
            _fail(f"duplicate trigger id '{trigger.id}'")
        seen.add(trigger.id)
        for room_id in trigger.rooms:
            if room_id not in world.rooms:
                _fail(f"trigger '{trigger.id}' names room '{room_id}', which is not a room id")
        if not trigger.text and not trigger.effects:
            _fail(f"trigger '{trigger.id}' has neither text nor effects, so it can never do anything")
        _check_counter_conditions(trigger.requires_counters, f"trigger '{trigger.id}'")
        _check_door_conditions(world, trigger.requires_doors, f"trigger '{trigger.id}'")


def _check_rule_rooms(world: WorldState, rooms: list[str], where: str) -> None:
    for room_id in rooms:
        if room_id not in world.rooms:
            _fail(f"{where}: rooms names '{room_id}', which is not a room id")


def _check_door_conditions(world: WorldState, required: dict[str, bool], where: str) -> None:
    for door_id in required:
        if door_id not in world.doors:
            _fail(f"{where}: requires_doors names '{door_id}', which is not a door id")


def _check_counter_conditions(required, where: str) -> None:
    """An impossible range is always a mistake, and a silent one — the rule simply
    never fires, and the author is left hunting for a typo somewhere else."""
    for name, condition in required.items():
        if condition.at_least is None and condition.at_most is None:
            _fail(f"{where}: counter '{name}' has neither 'at_least' nor 'at_most'")
        if (condition.at_least is not None and condition.at_most is not None
                and condition.at_least > condition.at_most):
            _fail(
                f"{where}: counter '{name}' requires at_least {condition.at_least} and "
                f"at_most {condition.at_most}, which nothing can satisfy"
            )


def _check_effects(world: WorldState) -> None:
    for interaction in world.interactions:
        where = f"interaction '{interaction.id}'"
        _check_counter_conditions(interaction.requires_counters, where)
        _check_door_conditions(world, interaction.requires_doors, where)
        for index, effect in enumerate(interaction.effects):
            _check_effect(world, effect, f"{where} effect {index}")
    for npc_id, npc in world.npcs.items():
        for rule_index, rule in enumerate(npc.dialogue):
            where = f"npc '{npc_id}' dialogue rule {rule_index}"
            _check_rule_rooms(world, rule.rooms, where)
            _check_counter_conditions(rule.requires_counters, where)
            _check_door_conditions(world, rule.requires_doors, where)
            for index, effect in enumerate(rule.effects):
                _check_effect(world, effect, f"{where} effect {index}")
    for door_id, door in world.doors.items():
        for rule_index, rule in enumerate(door.listening):
            where = f"door '{door_id}' listening rule {rule_index}"
            _check_rule_rooms(world, rule.rooms, where)
            _check_counter_conditions(rule.requires_counters, where)
            _check_door_conditions(world, rule.requires_doors, where)
            for index, effect in enumerate(rule.effects):
                _check_effect(world, effect, f"{where} effect {index}")
    for trigger in world.triggers:
        for index, effect in enumerate(trigger.effects):
            _check_effect(world, effect, f"trigger '{trigger.id}' effect {index}")


def _check_effect(world: WorldState, effect: Effect, where: str) -> None:
    match effect.type:
        case "set_flag":
            if effect.flag is None or effect.value is None:
                _fail(f"{where}: set_flag requires 'flag' and 'value'")
        case "move_item":
            if effect.item_id is None or effect.to is None:
                _fail(f"{where}: move_item requires 'item_id' and 'to'")
            if effect.item_id not in world.items:
                _fail(f"{where}: move_item names item '{effect.item_id}', which is not an item id")
            if effect.to not in (LOC_INVENTORY, LOC_HIDDEN) and effect.to not in world.rooms:
                _fail(
                    f"{where}: move_item destination '{effect.to}' is not a room id, 'inventory', or 'hidden'"
                )
        case "set_door":
            if effect.door_id is None:
                _fail(f"{where}: set_door requires 'door_id'")
            if effect.open is None and effect.locked is None:
                _fail(f"{where}: set_door requires at least one of 'open' or 'locked'")
            if effect.door_id not in world.doors:
                _fail(f"{where}: set_door names door '{effect.door_id}', which is not a door id")
        case "move_npc":
            if effect.npc_id is None or effect.to is None:
                _fail(f"{where}: move_npc requires 'npc_id' and 'to'")
            if effect.npc_id not in world.npcs:
                _fail(f"{where}: move_npc names npc '{effect.npc_id}', which is not an npc id")
            if effect.to not in world.rooms:
                _fail(f"{where}: move_npc destination '{effect.to}' is not a room id")
        case "move_player":
            if effect.to is None:
                _fail(f"{where}: move_player requires 'to'")
            if effect.to not in world.rooms:
                _fail(f"{where}: move_player destination '{effect.to}' is not a room id")
        case "adjust_counter":
            if effect.counter is None or effect.delta is None:
                _fail(f"{where}: adjust_counter requires 'counter' and 'delta'")
        case "end_game":
            if effect.outcome is None:
                _fail(f"{where}: end_game requires 'outcome' ('win' or 'loss')")
            if effect.outcome == "loss" and not effect.epilogue:
                _fail(f"{where}: a losing end_game needs its own 'epilogue' — "
                      "win_epilogue is the wrong last word for a death")
        case "win_game":
            pass


def _check_pronouns(world: WorldState) -> None:
    if world.pronouns not in PRONOUN_SETS:
        _fail(f"'pronouns' is '{world.pronouns}', which is not one of: "
              f"{', '.join(PRONOUN_SETS)}")


def _check_schema_version(world: WorldState) -> None:
    if world.schema_version != 1:
        _fail(f"unsupported schema_version {world.schema_version}; this build reads version 1")
