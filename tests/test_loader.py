"""T2 acceptance: world files load, broken ones are rejected by name, queries read correctly."""

from pathlib import Path

import pytest

from adventure import queries
from adventure.loader import WorldValidationError, load_world
from adventure.models import WorldState

FIXTURES = Path(__file__).parent / "fixtures"
TINY = FIXTURES / "tiny_world.json"


@pytest.fixture
def world() -> WorldState:
    return load_world(TINY)


def test_tiny_world_loads(world: WorldState) -> None:
    assert world.title == "Tiny Test World"
    assert world.player_location == "room_a"
    assert set(world.rooms) == {"room_a", "room_b"}
    assert world.items["gem"].location == "hidden"
    assert world.doors["door_ab"].open is False
    assert world.turn_count == 0 and world.won is False


@pytest.mark.parametrize(
    ("filename", "offending_id"),
    [
        ("bad_exit_target.json", "room_c"),
        ("orphan_door.json", "door_xy"),
        ("duplicate_id.json", "robot"),
        ("bad_item_location.json", "room_z"),
        ("interaction_missing_item.json", "hammer"),
        ("effect_missing_field.json", "hit_statue"),
    ],
)
def test_invalid_worlds_are_rejected(filename: str, offending_id: str) -> None:
    with pytest.raises(WorldValidationError) as excinfo:
        load_world(FIXTURES / "invalid" / filename)
    assert offending_id in str(excinfo.value)


def test_visible_entities_are_scoped_to_the_current_room(world: WorldState) -> None:
    assert [e.id for e in queries.visible_entities(world)] == ["rock", "statue", "door_ab"]


def test_visible_entities_include_inventory_and_npcs(world: WorldState) -> None:
    world.items["rock"].location = "inventory"
    world.player_location = "room_b"
    assert [e.id for e in queries.visible_entities(world)] == ["rock", "robot", "door_ab"]


def test_room_and_item_queries(world: WorldState) -> None:
    assert queries.current_room(world).id == "room_a"
    assert [i.id for i in queries.items_in_room(world, "room_a")] == ["rock", "statue"]
    assert [n.id for n in queries.npcs_in_room(world, "room_b")] == ["robot"]
    assert queries.inventory(world) == []
    assert [d.id for d in queries.doors_in_room(world, "room_a")] == ["door_ab"]
    assert queries.find_entity(world, "gem") is world.items["gem"]
    assert queries.find_entity(world, "nope") is None
    assert queries.entity_ref(world.items["rock"]).name == "rock"


def test_resolved_description_follows_alt_flag(world: WorldState) -> None:
    statue = world.items["statue"]
    assert queries.resolved_description(world, statue) == statue.description
    world.flags["statue_hit"] = True
    assert queries.resolved_description(world, statue) == statue.alt_description
    assert queries.resolved_description(world, world.rooms["room_b"]) == world.rooms["room_b"].description


def test_flags_match_treats_absent_as_false(world: WorldState) -> None:
    assert queries.flags_match(world, {"greeted": False})
    assert not queries.flags_match(world, {"greeted": True})
    world.flags["greeted"] = True
    assert queries.flags_match(world, {"greeted": True})
    assert queries.flags_match(world, {})
