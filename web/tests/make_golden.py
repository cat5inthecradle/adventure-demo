"""Record the Python engine's answers to scripted sessions, so the JS port can be
checked against them line for line. Run from the repo root with the venv:

    .venv/bin/python web/tests/make_golden.py
"""
import json
from pathlib import Path

from adventure.loader import load_world
from adventure.parser import ParseError, parse
from adventure.renderer import Style, render_events, render_parse_error
from adventure import engine

ROOT = Path(__file__).resolve().parents[2]

SCRIPTS = {
    "golden_path": [
        "go east", "go south", "take prybar", "go north", "go east",
        "use prybar on crate", "take power cell", "use power cell on droid",
        "talk to droid", "go west", "open door", "go north", "pull lever", "look",
    ],
    "wandering": [
        "look around", "where am i", "x manual", "read manual", "take manual", "i",
        "listen", "e", "listen at door", "open door", "go north", "enter pod",
        "go to cargo bay", "go to engine room", "go back", "take reactor",
        "take prybar", "opne crate", "open teh crate using the prybar",
        "go to the cargo bay", "take crate", "use prybar on crate", "take cell",
        "take power cell", "take power cell", "drop power cell", "drop sandwich",
        "take droid", "wake droid", "talk to droid", "xyzzy", "take", "",
        "go sideways", "take the thing", "go to the crew quarters", "examine console",
        "use console", "take prybar", "get in the pod", "inventory",
        "pick up manual", "put down manual", "jump out the window",
        "use power cell on droid", "take power cell", "use power cell on droid",
        "talk to droid", "talk to droid", "w", "s", "n", "n", "u", "d",
    ],
}

out = {}
for name, lines in SCRIPTS.items():
    world = load_world(ROOT / "worlds" / "wayfarer.json")
    steps = []
    for line in lines:
        parsed = parse(world, line)
        if isinstance(parsed, ParseError):
            steps.append({"line": line, "action": None, "text": render_parse_error(parsed),
                          "speech": None})
            continue
        events = engine.apply(world, parsed)
        steps.append({
            "line": line,
            "action": parsed.model_dump(),
            "text": render_events(events, pronouns=world.pronouns),
            "speech": render_events(events, Style.SPEECH, world.pronouns),
        })
    out[name] = {"steps": steps, "final": json.loads(world.model_dump_json())}

(ROOT / "web" / "tests" / "fixtures" / "golden.json").write_text(json.dumps(out, indent=1))
print({k: len(v["steps"]) for k, v in out.items()})
