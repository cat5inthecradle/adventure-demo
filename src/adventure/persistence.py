"""Saves and loads WorldState snapshots as JSON.

A save file IS a world file with progressed state — same schema, same validation on
the way back in. This module performs file I/O; it never applies game rules.
"""

import json
import re
from pathlib import Path

from adventure.loader import validate_world
from adventure.models import WorldState

SAVE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,32}$")


def save_game(world: WorldState, save_dir: Path, name: str) -> Path:
    """Writes {save_dir}/{name}.json (mkdir -p). `name` must match
    ^[a-zA-Z0-9_-]{1,32}$ else raise ValueError. Returns the path."""
    _check_name(name)
    save_dir.mkdir(parents=True, exist_ok=True)
    path = save_dir / f"{name}.json"
    path.write_text(world.model_dump_json(indent=2), encoding="utf-8")
    return path


def load_game(save_dir: Path, name: str) -> WorldState:
    """Reads, model-validates, and runs loader.validate_world before returning.
    Raises FileNotFoundError / WorldValidationError accordingly."""
    _check_name(name)
    path = save_dir / f"{name}.json"
    world = WorldState.model_validate(json.loads(path.read_text(encoding="utf-8")))
    validate_world(world)
    return world


def list_saves(save_dir: Path) -> list[str]:
    """Save names present in save_dir, alphabetically. Missing directory means none."""
    if not save_dir.is_dir():
        return []
    return sorted(path.stem for path in save_dir.glob("*.json"))


def _check_name(name: str) -> None:
    if not SAVE_NAME_PATTERN.match(name):
        raise ValueError(
            f"invalid save name '{name}': use 1-32 letters, digits, underscores, or hyphens"
        )
