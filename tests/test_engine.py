"""T3 acceptance: the engine is the only source of truth, and it never raises at the player."""

from pathlib import Path

import pytest

from adventure import engine
from adventure.actions import (
    Action,
    Drop,
    Examine,
    Go,
    Look,
    Open,
    ShowInventory,
    Take,
    Talk,
    Use,
)
from adventure.events import (
    ActionFailed,
    DoorOpened,
    EntityExamined,
    GameEnded,
    InventoryListed,
    ItemDropped,
    ItemTaken,
    ItemUsed,
    Moved,
    NpcSpoke,
    Reason,
    RoomDescribed,
)
from adventure.loader import load_world
from adventure.models import WorldState

TINY = Path(__file__).parent / "fixtures" / "tiny_world.json"


@pytest.fixture
def world() -> WorldState:
    return load_world(TINY)


def run(world: WorldState, *actions: Action) -> list:
    """Apply a script and return the events of the final action."""
    events: list = []
    for action in actions:
        events = engine.apply(world, action)
    return events


def open_the_door(world: WorldState) -> None:
    engine.apply(world, Open(target="door_ab"))


def reveal_gem(world: WorldState) -> None:
    engine.apply(world, Take(item="rock"))
    engine.apply(world, Use(item="rock", target="statue"))


# --- success paths, one per behaviour-table row ------------------------------


def test_look_describes_the_room(world: WorldState) -> None:
    (event,) = engine.apply(world, Look())
    assert isinstance(event, RoomDescribed)
    assert event.room.id == "room_a"
    assert [e.direction for e in event.exits] == ["east"]
    assert event.exits[0].door is not None and event.exits[0].door_open is False
    assert [i.id for i in event.items] == ["rock", "statue"]
    assert event.npcs == []


def test_examine_returns_the_resolved_description(world: WorldState) -> None:
    (event,) = engine.apply(world, Examine(target="statue"))
    assert isinstance(event, EntityExamined)
    assert event.description == world.items["statue"].description
    world.flags["statue_hit"] = True
    (event,) = engine.apply(world, Examine(target="statue"))
    assert event.description == world.items["statue"].alt_description


def test_examine_a_door_uses_its_plain_description(world: WorldState) -> None:
    (event,) = engine.apply(world, Examine(target="door_ab"))
    assert isinstance(event, EntityExamined)
    assert event.description == world.doors["door_ab"].description


def test_go_moves_and_redescribes(world: WorldState) -> None:
    open_the_door(world)
    moved, described = engine.apply(world, Go(direction="east"))
    assert isinstance(moved, Moved)
    assert (moved.from_room.id, moved.to_room.id) == ("room_a", "room_b")
    assert isinstance(described, RoomDescribed) and described.room.id == "room_b"
    assert world.player_location == "room_b"


def test_take_moves_an_item_to_inventory(world: WorldState) -> None:
    (event,) = engine.apply(world, Take(item="rock"))
    assert isinstance(event, ItemTaken) and event.item.id == "rock"
    assert world.items["rock"].location == "inventory"


def test_drop_returns_an_item_to_the_room(world: WorldState) -> None:
    engine.apply(world, Take(item="rock"))
    (event,) = engine.apply(world, Drop(item="rock"))
    assert isinstance(event, ItemDropped)
    assert world.items["rock"].location == "room_a"


def test_open_opens_a_door(world: WorldState) -> None:
    (event,) = engine.apply(world, Open(target="door_ab"))
    assert isinstance(event, DoorOpened) and event.door.id == "door_ab"
    assert world.doors["door_ab"].open is True


def test_open_unlocks_when_the_unlock_flag_is_set(world: WorldState) -> None:
    door = world.doors["door_ab"]
    door.locked = True
    door.unlock_flag = "greeted"
    world.flags["greeted"] = True
    (event,) = engine.apply(world, Open(target="door_ab"))
    assert isinstance(event, DoorOpened)
    assert door.locked is False and door.open is True


def test_use_applies_effects_in_order(world: WorldState) -> None:
    engine.apply(world, Take(item="rock"))
    (event,) = engine.apply(world, Use(item="rock", target="statue"))
    assert isinstance(event, ItemUsed)
    assert event.message == world.interactions[0].message
    assert event.target is not None and event.target.id == "statue"
    assert world.flags["statue_hit"] is True
    assert world.items["gem"].location == "room_a"


def test_talk_returns_dialogue_and_fires_effects(world: WorldState) -> None:
    open_the_door(world)
    engine.apply(world, Go(direction="east"))
    (event,) = engine.apply(world, Talk(npc="robot"))
    assert isinstance(event, NpcSpoke)
    assert event.text == world.npcs["robot"].dialogue[0].text
    assert world.flags["greeted"] is True


def test_inventory_lists_carried_items(world: WorldState) -> None:
    (event,) = engine.apply(world, ShowInventory())
    assert isinstance(event, InventoryListed) and event.items == []
    engine.apply(world, Take(item="rock"))
    (event,) = engine.apply(world, ShowInventory())
    assert [i.id for i in event.items] == ["rock"]


# --- one scenario per Reason -------------------------------------------------


def test_reason_no_exit(world: WorldState) -> None:
    (event,) = engine.apply(world, Go(direction="north"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.NO_EXIT


def test_reason_door_closed(world: WorldState) -> None:
    (event,) = engine.apply(world, Go(direction="east"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.DOOR_CLOSED
    assert event.subject is not None and event.subject.id == "door_ab"
    assert world.player_location == "room_a"


def test_reason_door_locked_carries_the_world_message(world: WorldState) -> None:
    door = world.doors["door_ab"]
    door.locked = True
    door.locked_message = "The door refuses you."
    (event,) = engine.apply(world, Open(target="door_ab"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.DOOR_LOCKED
    assert event.message == "The door refuses you."
    assert door.open is False


def test_reason_already_open(world: WorldState) -> None:
    open_the_door(world)
    (event,) = engine.apply(world, Open(target="door_ab"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.ALREADY_OPEN


def test_reason_not_present(world: WorldState) -> None:
    (event,) = engine.apply(world, Examine(target="robot"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.NOT_PRESENT


def test_reason_not_portable(world: WorldState) -> None:
    (event,) = engine.apply(world, Take(item="statue"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.NOT_PORTABLE


def test_reason_already_carrying(world: WorldState) -> None:
    engine.apply(world, Take(item="rock"))
    (event,) = engine.apply(world, Take(item="rock"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.ALREADY_CARRYING


def test_reason_not_carrying(world: WorldState) -> None:
    (event,) = engine.apply(world, Drop(item="rock"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.NOT_CARRYING


def test_reason_not_openable(world: WorldState) -> None:
    (event,) = engine.apply(world, Open(target="statue"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.NOT_OPENABLE


def test_reason_nothing_happens(world: WorldState) -> None:
    engine.apply(world, Take(item="rock"))
    (event,) = engine.apply(world, Use(item="rock", target="door_ab"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.NOTHING_HAPPENS


def test_reason_game_over(world: WorldState) -> None:
    reveal_gem(world)
    engine.apply(world, Take(item="gem"))
    engine.apply(world, Use(item="gem"))
    assert world.won is True
    (event,) = engine.apply(world, Look())
    assert isinstance(event, ActionFailed) and event.reason is Reason.GAME_OVER


# --- sequencing, gating, and bookkeeping -------------------------------------


def test_closed_door_blocks_go_until_opened(world: WorldState) -> None:
    (blocked,) = engine.apply(world, Go(direction="east"))
    assert isinstance(blocked, ActionFailed) and blocked.reason is Reason.DOOR_CLOSED
    open_the_door(world)
    events = engine.apply(world, Go(direction="east"))
    assert isinstance(events[0], Moved) and world.player_location == "room_b"


def test_a_once_interaction_only_fires_once(world: WorldState) -> None:
    reveal_gem(world)
    (event,) = engine.apply(world, Use(item="rock", target="statue"))
    assert isinstance(event, ActionFailed) and event.reason is Reason.NOTHING_HAPPENS


def test_talking_twice_falls_through_to_the_catch_all(world: WorldState) -> None:
    open_the_door(world)
    engine.apply(world, Go(direction="east"))
    (first,) = engine.apply(world, Talk(npc="robot"))
    (second,) = engine.apply(world, Talk(npc="robot"))
    assert isinstance(first, NpcSpoke) and isinstance(second, NpcSpoke)
    assert first.text == world.npcs["robot"].dialogue[0].text
    assert second.text == world.npcs["robot"].dialogue[1].text


def test_using_the_gem_wins_the_game(world: WorldState) -> None:
    reveal_gem(world)
    engine.apply(world, Take(item="gem"))
    used, won = engine.apply(world, Use(item="gem"))
    assert isinstance(used, ItemUsed) and used.target is None
    assert isinstance(won, GameEnded) and won.outcome == "win"
    assert won.epilogue == world.win_epilogue
    assert world.won is True


def test_turn_count_ignores_pure_failures(world: WorldState) -> None:
    engine.apply(world, Look())
    assert world.turn_count == 1
    engine.apply(world, Go(direction="north"))
    assert world.turn_count == 1
    engine.apply(world, Take(item="rock"))
    assert world.turn_count == 2


def test_apply_is_deterministic() -> None:
    script: list[Action] = [
        Look(),
        Take(item="rock"),
        Use(item="rock", target="statue"),
        Take(item="gem"),
        Open(target="door_ab"),
        Go(direction="east"),
        Talk(npc="robot"),
        Talk(npc="robot"),
        ShowInventory(),
        Use(item="gem"),
    ]
    runs = []
    for _ in range(2):
        world = load_world(TINY)
        events = [event for action in script for event in engine.apply(world, action)]
        runs.append(([e.model_dump() for e in events], world.model_dump()))
    assert runs[0] == runs[1]
    assert any(e["type"] == "game_ended" for e in runs[0][0])


def test_taking_an_npc_says_you_cannot_rather_than_that_it_is_absent(
    world: WorldState,
) -> None:
    """From two logged sessions: players try to take the droid with them, and got
    "You don't see that here." about something standing in front of them."""
    from adventure.renderer import render_event

    world.player_location = "room_b"          # the robot is here
    (event,) = engine.apply(world, Take(item="robot"))
    assert event.reason is Reason.NOT_PORTABLE
    assert render_event(event) == "You can't take the robot."


def test_taking_an_npc_that_is_elsewhere_is_still_not_present(world: WorldState) -> None:
    (event,) = engine.apply(world, Take(item="robot"))   # player is in room_a
    assert event.reason is Reason.NOT_PRESENT
