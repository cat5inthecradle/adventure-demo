"""Find ambiguity a player could actually hit, before they hit it.

Two things a player can see at the same time should never answer to the same word.
When they do, every phrasing that uses that word costs a round trip: the offline
parser returns "which do you mean?", and the language model spends a call asking the
same question. It is the cheapest class of bug to fix at authoring time and the most
expensive to leave in, because it taxes every future playthrough.

Scope is per room, and deliberately pessimistic: anything that can ever be in the
room (including items moved there by an interaction), plus every portable item in
the game — because the player may be carrying it — plus the NPCs and doors there.

Usage:  python scripts/lint_world.py [worlds/wayfarer.json]
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from adventure.loader import load_world                              # noqa: E402
from adventure.models import LOC_INVENTORY, WorldState               # noqa: E402
from adventure.parser import GENERIC_TOKENS, _entity_tokens          # noqa: E402
from adventure.pronouns import TOKENS, unknown_tokens                 # noqa: E402


def reachable_rooms_for_item(world: WorldState, item_id: str) -> set[str]:
    """Where an item can be: its start location plus anywhere an effect moves it."""
    places = set()
    start = world.items[item_id].location
    if start not in (LOC_INVENTORY, "hidden"):
        places.add(start)
    effects = [e for i in world.interactions for e in i.effects]
    effects += [e for n in world.npcs.values() for r in n.dialogue for e in r.effects]
    for effect in effects:
        if effect.type == "move_item" and effect.item_id == item_id:
            if effect.to not in (LOC_INVENTORY, "hidden"):
                places.add(effect.to)
    return places


def scope_for_room(world: WorldState, room_id: str) -> list:
    """Everything the player could be able to refer to while standing here."""
    entities = []
    for item in world.items.values():
        if room_id in reachable_rooms_for_item(world, item.id) or item.portable:
            entities.append(item)
    entities += [n for n in world.npcs.values() if n.location == room_id]
    entities += [world.doors[e.door_id] for e in world.rooms[room_id].exits.values()
                 if e.door_id]
    return entities


def handles(entity) -> list[str]:
    return [entity.name.lower()] + [a.lower() for a in entity.aliases]


def resolve(phrase: str, candidates: list) -> list:
    """Mirror the parser: exact match wins outright, token subset is the fallback."""
    exact = [e for e in candidates if phrase in handles(e)]
    if exact:
        return exact
    tokens = set(phrase.split())
    if tokens <= GENERIC_TOKENS:
        return []
    return [e for e in candidates if tokens <= _entity_tokens(e)]


def bad_tokens(world: WorldState) -> list[tuple[str, str]]:
    """Brace tokens no renderer will substitute, and where they are.

    `{their}` becomes a word; `{thier}` reaches the player as four characters of
    punctuation in the middle of a sentence. The renderer deliberately leaves
    unknown tokens alone rather than blanking them, which makes them visible — but
    visible in a playthrough is late, and this is the same finding at authoring time.
    """
    found: list[tuple[str, str]] = []

    def walk(node, path: str) -> None:
        if isinstance(node, str):
            found.extend((path, token) for token in unknown_tokens(node))
        elif isinstance(node, dict):
            for key, value in node.items():
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]")

    walk(world.model_dump(), "world")
    return found


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("world", nargs="?", default="worlds/wayfarer.json", type=Path)
    args = ap.parse_args()
    world = load_world(args.world)

    findings: list[tuple[str, str, str, list[str]]] = []
    for room_id in world.rooms:
        candidates = scope_for_room(world, room_id)
        seen: set[str] = set()
        for entity in candidates:
            for phrase in handles(entity):
                if phrase in seen:
                    continue
                seen.add(phrase)
                matches = resolve(phrase, candidates)
                if len(matches) > 1:
                    severity = "COLLISION" if len(set(handles(m)[0] for m in matches)) > 1 else "DUP"
                    findings.append((severity, room_id, phrase, [m.id for m in matches]))
        # Single words a player would plausibly try, drawn from every handle here.
        words = {w for e in candidates for h in handles(e) for w in h.split()}
        for word in sorted(words - GENERIC_TOKENS):
            if word in seen:
                continue
            matches = resolve(word, candidates)
            if len(matches) > 1:
                findings.append(("WORD", room_id, word, [m.id for m in matches]))

    print(f"\n{args.world}: {len(world.rooms)} rooms, "
          f"{len(world.items)} items, {len(world.npcs)} npcs, {len(world.doors)} doors")

    # Listening at an ordinary door falls back to the room's own sound. If some
    # rooms have no sound, listening answers in one place and shrugs in another —
    # and "the game said something" becomes the tell for where the secrets are.
    if any(door.listening for door in world.doors.values()):
        silent = [r.name for r in world.rooms.values() if not r.sounds]
        if silent:
            print(f"\nThis world uses listening, but {len(silent)} room(s) have no "
                  f"'sounds': {', '.join(silent)}.")
            print("Listening there falls through to a generic line, so the rooms that "
                  "do answer stand out — which tells players where to look.\n")
    tokens = bad_tokens(world)
    if tokens:
        print(f"\n{len(tokens)} unrecognised pronoun token(s). These reach the player "
              "as literal braces:\n")
        for path, token in tokens:
            print(f"  [TOKEN] {path}: {token}")
        print("\nThe tokens are: " + ", ".join("{" + t + "}" for t in TOKENS) + ".\n")

    if not findings:
        if not tokens:
            print("\nNo ambiguity found. Every phrase a player can type in a room "
                  "identifies exactly one thing.\n")
            return
        sys.exit(1)

    print(f"\n{len(findings)} ambiguous phrase(s) — each one costs a clarification "
          "every time a player uses it:\n")
    for severity, room_id, phrase, ids in findings:
        room = world.rooms[room_id].name
        print(f"  [{severity}] in {room}: \"{phrase}\" matches {len(ids)} things: "
              f"{', '.join(ids)}")
    print("\nFix by renaming one of them, or by removing the shared alias. "
          "Two things a player sees at once should never answer to the same word.\n")
    sys.exit(1)


if __name__ == "__main__":
    main()
