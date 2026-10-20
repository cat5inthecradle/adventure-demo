"""T8 acceptance: the shipped adventure matches its design and starts in the right state."""

from pathlib import Path

import pytest

from adventure.loader import load_world
from adventure.models import WorldState

WAYFARER = Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json"


@pytest.fixture
def world() -> WorldState:
    return load_world(WAYFARER)


def test_world_loads_and_validates(world: WorldState) -> None:
    assert world.title == "The Wayfarer"
    assert world.player_location == "crew_quarters"
    assert world.intro.startswith("You wake on the deck of the Wayfarer")
    assert world.win_epilogue.endswith("You made it.")


def test_the_designed_content_is_all_present(world: WorldState) -> None:
    """Names what the design requires; does not count what exists.

    A headcount ("exactly 4 interactions") fails every time someone adds content,
    which punishes authoring — the one activity this project most wants to
    encourage. Removing something the game needs is a regression; adding a new
    room, item or interaction is just writing.
    """
    assert {"crew_quarters", "corridor", "cargo_bay", "engine_room",
            "escape_pod_bay"} <= set(world.rooms)
    assert "pod_door" in world.doors
    assert {"emergency_manual", "status_console", "prybar", "reactor", "supply_crate",
            "power_cell", "launch_lever", "escape_pod"} <= set(world.items)
    assert "maintenance_droid" in world.npcs
    assert {"pry_crate", "power_droid", "pull_lever"} <= {i.id for i in world.interactions}


def test_the_map_is_connected_as_designed(world: WorldState) -> None:
    assert world.rooms["crew_quarters"].exits["east"].to == "corridor"
    corridor = world.rooms["corridor"].exits
    assert {d: e.to for d, e in corridor.items()} == {
        "north": "escape_pod_bay",
        "south": "engine_room",
        "east": "cargo_bay",
        "west": "crew_quarters",
    }
    assert corridor["north"].door_id == "pod_door"
    assert world.rooms["escape_pod_bay"].exits["south"].door_id == "pod_door"


def test_power_cell_starts_hidden(world: WorldState) -> None:
    assert world.items["power_cell"].location == "hidden"


def test_pod_door_starts_locked_and_closed(world: WorldState) -> None:
    door = world.doors["pod_door"]
    assert door.locked is True and door.open is False
    assert door.unlock_flag == "power_restored"
    assert door.locked_message


def test_droid_boot_rule_is_once_and_restores_power(world: WorldState) -> None:
    rule = world.npcs["maintenance_droid"].dialogue[1]
    assert rule.once is True and rule.fired is False
    assert rule.requires_flags == {"droid_active": True, "power_restored": False}
    assert [(e.type, e.flag, e.value) for e in rule.effects] == [
        ("set_flag", "power_restored", True)
    ]


def test_the_manual_tells_the_player_the_solution(world: WorldState) -> None:
    manual = world.items["emergency_manual"].description
    assert "power cell" in manual and "supply crate" in manual


def test_puzzle_chain_is_wired_up(world: WorldState) -> None:
    by_id = {i.id: i for i in world.interactions}
    assert {"pry_crate", "power_droid", "pull_lever"} <= set(by_id)
    assert by_id["pry_crate"].effects[1].to == "cargo_bay"
    assert by_id["power_droid"].effects[0].flag == "droid_active"
    assert by_id["pull_lever"].effects[0].type == "win_game"
    # Steps that advance the game fire once; flavour responses repeat, because a
    # player who pokes the reactor twice should get an answer twice.
    puzzle_steps = ["pry_crate", "power_droid", "pull_lever"]
    assert all(by_id[key].once for key in puzzle_steps)
    assert by_id["try_reactor"].once is False
    assert by_id["try_reactor"].effects == []


def test_scenery_answers_when_you_touch_it(world: WorldState) -> None:
    """If a room names a thing, using it should say something real. 'Nothing
    happens.' is the sound of a content gap, and a real player hit this one three
    times in a row before wandering off."""
    from adventure import engine
    from adventure.actions import Use

    world.player_location = "engine_room"
    (event,) = engine.apply(world, Use(item="reactor"))
    assert event.type == "item_used"
    assert "slagged" in event.message


def test_the_crate_telegraphs_that_it_can_be_opened(world: WorldState) -> None:
    """Design rule: a refusal should tell the player the obstacle is beatable.
    A logged player tried five times against 'You can't open that.' and left."""
    from adventure import engine
    from adventure.actions import Open
    from adventure.renderer import render_event

    world.player_location = "cargo_bay"
    (event,) = engine.apply(world, Open(target="supply_crate"))
    text = render_event(event)
    assert "leverage" in text                      # hints a tool exists
    assert text != "You can't open the supply crate."

    # Carrying the prybar sharpens the hint into a nudge.
    world.items["prybar"].location = "inventory"
    (event,) = engine.apply(world, Open(target="supply_crate"))
    assert "prybar" in render_event(event)


def test_every_flag_used_is_a_flag_that_gets_set(world: WorldState) -> None:
    """No puzzle should depend on a flag nothing ever sets."""
    set_flags = {
        effect.flag
        for interaction in world.interactions
        for effect in interaction.effects
        if effect.type == "set_flag"
    } | {
        effect.flag
        for npc in world.npcs.values()
        for rule in npc.dialogue
        for effect in rule.effects
        if effect.type == "set_flag"
    }
    required = (
        {flag for i in world.interactions for flag in i.requires_flags}
        | {flag for n in world.npcs.values() for r in n.dialogue for flag in r.requires_flags}
        | {o.alt_flag for o in list(world.items.values()) + list(world.rooms.values()) if o.alt_flag}
        | {d.unlock_flag for d in world.doors.values() if d.unlock_flag}
    )
    assert required <= set_flags


# --- ambiguity budget --------------------------------------------------------


def test_no_two_visible_things_answer_to_the_same_word() -> None:
    """Design rule, enforced: nothing a player can see at once should share a word.

    This is the guard on the alias pipeline. Aliases get added from real playthrough
    logs, and a careless one ("glowing thing" once made bare "thing" match an item)
    silently taxes every phrasing that uses that word — a clarification round trip,
    forever, on every future playthrough.
    """
    import subprocess
    import sys

    script = Path(__file__).resolve().parents[1] / "scripts" / "lint_world.py"
    result = subprocess.run(
        [sys.executable, str(script), str(WAYFARER)],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, f"ambiguity found:\n{result.stdout}"
