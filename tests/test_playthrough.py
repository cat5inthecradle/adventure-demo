"""T9 acceptance: the shipped adventure is completable, correctly gated, and saveable.

These tests drive parser + engine directly — no CLI, no I/O beyond loading the world.
"""

from pathlib import Path

import pytest

from adventure import engine
from adventure.actions import Action, Examine, Go, Open, Take, Use
from adventure.events import Event, Reason
from adventure.loader import load_world
from adventure.models import WorldState
from adventure.parser import ParseError, parse
from adventure.persistence import load_game, save_game
from adventure.renderer import render_event

WAYFARER = Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json"

# The designed solution. 13 commands: the plan's "14" counts the win itself.
GOLDEN_PATH = [
    "go east",
    "go south",
    "take prybar",
    "go north",
    "go east",
    "use prybar on crate",
    "take power cell",
    "use power cell on droid",
    "talk to droid",
    "go west",
    "open door",
    "go north",
    "pull lever",
]


@pytest.fixture
def world() -> WorldState:
    return load_world(WAYFARER)


def run_script(world: WorldState, lines: list[str]) -> list[Event]:
    """Feed lines through parse + apply, asserting each one parses. Returns all events."""
    events: list[Event] = []
    for line in lines:
        action = parse(world, line)
        assert not isinstance(action, ParseError), f"{line!r} did not parse: {action}"
        events.extend(engine.apply(world, action))
    return events


def last_event(world: WorldState, action: Action) -> Event:
    (event,) = engine.apply(world, action)
    return event


# --- 1. the game is winnable -------------------------------------------------


def test_golden_path_wins(world: WorldState) -> None:
    events = run_script(world, GOLDEN_PATH)
    assert events[-1].type == "game_ended"
    assert world.won is True
    assert world.turn_count == len(GOLDEN_PATH) == 13


# --- 2. the escape pod is gated behind main power ----------------------------


def test_pod_door_is_locked_until_power_is_restored(world: WorldState) -> None:
    run_script(world, ["go east"])
    failed = last_event(world, Open(target="pod_door"))
    assert failed.type == "action_failed" and failed.reason is Reason.DOOR_LOCKED
    assert render_event(failed) == world.doors["pod_door"].locked_message


def test_a_closed_door_blocks_the_pod_bay(world: WorldState) -> None:
    run_script(world, ["go east"])
    failed = last_event(world, Go(direction="north"))
    assert failed.type == "action_failed" and failed.reason is Reason.DOOR_CLOSED
    assert world.player_location == "corridor"


# --- 3. the puzzle chain cannot be short-circuited ---------------------------


def test_the_power_cell_does_not_exist_until_the_crate_is_pried(world: WorldState) -> None:
    run_script(world, ["go east", "go east"])
    assert world.player_location == "cargo_bay"

    # The parser cannot even name a hidden item...
    assert isinstance(parse(world, "take power cell"), ParseError)
    # ...and the engine refuses the action if something else produces it.
    failed = last_event(world, Take(item="power_cell"))
    assert failed.reason is Reason.NOT_PRESENT

    failed = last_event(world, Use(item="power_cell", target="maintenance_droid"))
    assert failed.reason is Reason.NOT_PRESENT
    assert world.flags.get("droid_active", False) is False


def test_the_droid_stays_dark_until_it_is_powered(world: WorldState) -> None:
    events = run_script(world, ["go east", "go east", "talk to droid"])
    assert events[-1].text == world.npcs["maintenance_droid"].dialogue[0].text
    assert world.flags.get("power_restored", False) is False


# --- 4. the world describes itself differently once power is back ------------


def test_state_dependent_descriptions(world: WorldState) -> None:
    run_script(world, ["go east"])
    console_before = last_event(world, Examine(target="status_console")).description
    corridor_before = engine.describe_room(world).description

    world.flags["power_restored"] = True
    console_after = last_event(world, Examine(target="status_console")).description
    corridor_after = engine.describe_room(world).description

    assert "OFFLINE" in console_before and "ONLINE" in console_after
    assert corridor_before != corridor_after
    assert "emergency glow" in corridor_before and "White light" in corridor_after


# --- 5. loose natural phrasing still lands, offline --------------------------


def test_casual_phrasing_resolves_through_aliases(world: WorldState) -> None:
    run_script(world, ["go east", "go south", "take prybar", "go north", "go east",
                       "use prybar on crate"])
    assert parse(world, "grab that battery") == Take(item="power_cell")
    run_script(world, ["take power cell"])
    assert parse(world, "insert cell into droid") == Use(
        item="power_cell", target="maintenance_droid"
    )
    assert parse(world, "give the glowing battery to r-6") == Use(
        item="power_cell", target="maintenance_droid"
    )


def test_phrasing_the_dumb_parser_cannot_reach_fails_cleanly(world: WorldState) -> None:
    """This is the sentence the optional LLM layer exists to handle (T11)."""
    error = parse(world, "hmm, I should probably see what's in this room")
    assert isinstance(error, ParseError) and error.kind == "unknown_verb"


# --- 6. saving mid-game preserves the whole puzzle chain ---------------------


def test_save_midway_then_finish_from_the_save(world: WorldState, tmp_path: Path) -> None:
    first_half, second_half = GOLDEN_PATH[:7], GOLDEN_PATH[7:]

    run_script(world, first_half)
    save_game(world, tmp_path, "midway")

    run_script(world, second_half)
    assert world.won is True

    reloaded = load_game(tmp_path, "midway")
    assert reloaded.won is False
    assert reloaded.turn_count == len(first_half)
    assert reloaded.items["power_cell"].location == "inventory"

    events = run_script(reloaded, second_half)
    assert events[-1].type == "game_ended"
    assert reloaded.model_dump() == world.model_dump()
