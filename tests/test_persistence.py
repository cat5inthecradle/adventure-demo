"""T6 acceptance: a save is a world file with progressed state, validated on the way back."""

import json
from pathlib import Path

import pytest

from adventure import engine
from adventure.actions import Take, Use
from adventure.loader import WorldValidationError, load_world
from adventure.models import WorldState
from adventure.persistence import list_saves, load_game, save_game

TINY = Path(__file__).parent / "fixtures" / "tiny_world.json"


@pytest.fixture
def world() -> WorldState:
    return load_world(TINY)


def test_save_then_load_restores_the_saved_state(world: WorldState, tmp_path: Path) -> None:
    engine.apply(world, Take(item="rock"))
    path = save_game(world, tmp_path, "quicksave")
    assert path == tmp_path / "quicksave.json"

    engine.apply(world, Use(item="rock", target="statue"))
    world.player_location = "room_b"

    restored = load_game(tmp_path, "quicksave")
    assert restored.items["rock"].location == "inventory"
    assert restored.items["gem"].location == "hidden"
    assert restored.player_location == "room_a"
    assert restored.flags == {}
    assert restored.turn_count == 1


def test_saves_are_created_in_a_missing_directory(world: WorldState, tmp_path: Path) -> None:
    save_game(world, tmp_path / "deep" / "saves", "run1")
    assert (tmp_path / "deep" / "saves" / "run1.json").is_file()


def test_fired_flags_survive_a_round_trip(world: WorldState, tmp_path: Path) -> None:
    engine.apply(world, Take(item="rock"))
    engine.apply(world, Use(item="rock", target="statue"))
    save_game(world, tmp_path, "mid")
    restored = load_game(tmp_path, "mid")
    assert restored.interactions[0].fired is True
    assert restored.items["gem"].location == "room_a"
    assert restored.flags["statue_hit"] is True


@pytest.mark.parametrize("name", ["", "has space", "../escape", "a" * 33, "bad/name", "dot.name"])
def test_bad_save_names_are_rejected(world: WorldState, tmp_path: Path, name: str) -> None:
    with pytest.raises(ValueError):
        save_game(world, tmp_path, name)


def test_missing_save_raises_file_not_found(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_game(tmp_path, "nope")


def test_tampered_save_is_rejected(world: WorldState, tmp_path: Path) -> None:
    path = save_game(world, tmp_path, "tampered")
    data = json.loads(path.read_text())
    del data["rooms"]["room_b"]
    path.write_text(json.dumps(data))
    with pytest.raises(WorldValidationError):
        load_game(tmp_path, "tampered")


def test_list_saves(world: WorldState, tmp_path: Path) -> None:
    assert list_saves(tmp_path / "missing") == []
    save_game(world, tmp_path, "beta")
    save_game(world, tmp_path, "alpha")
    assert list_saves(tmp_path) == ["alpha", "beta"]
