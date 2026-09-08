"""The terminal REPL frontend: input routing, meta commands, and all player-facing I/O.

This is the only module that talks to a terminal. It never decides game outcomes —
it routes a line to the parser, hands the resulting Action to the engine, and prints
whatever the renderer makes of the returned events. Meta commands (help, save, load,
saves, quit) are handled here because they are not world mutations.
"""

import argparse
import os
from dataclasses import dataclass, field
from pathlib import Path

from adventure import engine
from adventure.loader import WorldValidationError, load_world
from adventure.journal import Journal, build_sink, turn_record
from adventure.models import WorldState
from adventure.nlu import DEFAULT_MODEL, NLUProvider
from adventure.persistence import list_saves, load_game, save_game
from adventure import pronouns as pronoun_sets
from adventure.renderer import render_event
from adventure.turn import take_turn

DEFAULT_WORLD = "worlds/wayfarer.json"
DEFAULT_SAVE_DIR = "./saves"
DEFAULT_SAVE_NAME = "quicksave"
DOTENV_PATH = Path(".env")
DEFAULT_LOG = "logs/playthroughs.jsonl"
TRANSCRIPT_PAIRS = 6

# The stat line after the last word. Not part of the story, so it lives here rather
# than in the world file.
END_LINE = {
    "win": "Escaped in {turns} turns.",
    "loss": "You lasted {turns} turns.",
}

HELP_TEXT = """Commands
  Looking around:  look (l) · examine X (x X, inspect X, read X)
  Moving:          go north (n, s, e, w, up, down) · walk/move/head north
  Carrying:        take X (get X, grab X, pick up X) · drop X (put down X) · inventory (i)
  Doors:           open X
  Going through:   enter X (get in X, board X, climb into X) · go through X
                   (go out X, jump out X, leap through X, climb out X)
  Using things:    use X · pull/push/press X · use X on Y (use X with Y, put X in Y,
                   insert X into Y, give X to Y)
  Talking:         talk to X (speak to X, ask X)
  Listening:       listen · listen at X (listen to X, listen through X)

When the language assistant is on, you can also just say what you mean in ordinary
words, and it will be translated into one of the commands above.

Meta commands
  help             show this list
  save [name]      save the game (default name: quicksave)
  load [name]      load a saved game
  saves            list saved games
  pronouns [set]   show or change your character's pronouns (he, she, they)
  quit (q)         leave the game"""


@dataclass
class Session:
    """Everything one play session mutates. `world` is replaced wholesale on load."""

    world: WorldState
    save_dir: Path
    nlu: NLUProvider | None = None
    journal: Journal | None = None
    transcript: list[tuple[str, str]] = field(default_factory=list)
    running: bool = True


def emit(text: str) -> None:
    """The single output seam — speech and braille frontends hook in here."""
    print(text)


def main() -> None:
    _load_dotenv()
    args = _parse_args()
    try:
        world = load_world(args.world)
    except FileNotFoundError:
        emit(f"No world file at {args.world}.")
        raise SystemExit(1)
    except WorldValidationError as exc:
        emit(f"That world file is not valid: {exc}")
        raise SystemExit(1)

    session = Session(
        world=world,
        save_dir=Path(args.save_dir),
        nlu=_build_nlu(args.llm, args.model),
        journal=Journal(
            build_sink(None if args.no_log else args.log),
            world_name=Path(args.world).stem,
        ),
    )
    _announce_start(session, args.model)
    _run_repl(session)


def _load_dotenv(path: Path = DOTENV_PATH) -> None:
    """Populate os.environ from a .env file, if there is one. Real environment
    variables win — the file only fills in what the shell did not set."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _build_nlu(mode: str, model: str) -> NLUProvider | None:
    """'off' never builds a provider; 'auto' needs a key; 'on' always tries."""
    if mode == "off":
        return None
    if mode == "auto" and not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    from adventure.nlu import AnthropicNLU

    try:
        return AnthropicNLU(model=model)
    except Exception as exc:      # no key, no credentials file, bad config
        emit(f"Could not start the language assistant ({exc}). Classic commands still work.")
        return None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="adventure", description="A small text adventure.")
    parser.add_argument("--world", default=DEFAULT_WORLD, help="path to a world JSON file")
    parser.add_argument("--save-dir", default=DEFAULT_SAVE_DIR, help="where saved games live")
    parser.add_argument(
        "--llm",
        choices=["auto", "on", "off"],
        default="auto",
        help="natural-language input: auto (on when ANTHROPIC_API_KEY is set), on, or off",
    )
    parser.add_argument(
        "--log",
        default=DEFAULT_LOG,
        help=("where to record a JSON line per turn: a path, 'file:PATH', or 'none' "
              f"(default: {DEFAULT_LOG})"),
    )
    parser.add_argument(
        "--no-log",
        action="store_true",
        help="do not record this session",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL),
        help=f"model for the language assistant (default: {DEFAULT_MODEL})",
    )
    return parser.parse_args()


def _announce_start(session: Session, model: str) -> None:
    emit(session.world.title)
    emit("")
    emit(f"Language assistant: on ({model})" if session.nlu else "Language assistant: off")
    if session.journal is not None and session.journal.enabled:
        emit(f"Recording this session to {session.journal.describe()} (--no-log to turn off)")
    emit("")
    emit(pronoun_sets.apply(session.world.intro, session.world.pronouns))
    emit("")
    emit(render_event(engine.describe_room(session.world),
                      pronouns=session.world.pronouns))


def _run_repl(session: Session) -> None:
    while session.running:
        try:
            line = input("> ")
        except (EOFError, KeyboardInterrupt):
            emit("")
            emit("Goodbye.")
            return
        handle_line(session, line)


def handle_line(session: Session, line: str) -> None:
    """Route one line of player input. Meta commands are a CLI concern and are
    handled here; everything else goes through the shared turn router."""
    if _handle_meta(session, line):
        _log(session, line, {"route": "meta"})
        return

    room = session.world.player_location
    result = take_turn(session.world, line, session.nlu, session.transcript)

    emit(result.text)
    session.transcript.append((line, result.text))
    del session.transcript[:-TRANSCRIPT_PAIRS]

    # `exit` is a movement verb ("exit the window"), so bare `exit` no longer quits.
    # A player who meant to leave deserves to be told where the door is.
    error = result.parse_error
    if error is not None and error.kind == "missing_noun" and (error.verb or "") == "exit":
        emit("(To leave the game, type 'quit'.)")

    _log(session, line, turn_record(result, room))

    if result.ended:
        emit(END_LINE[result.outcome].format(turns=session.world.turn_count))
        session.running = False


def _log(session: Session, line: str, record: dict[str, object]) -> None:
    if session.journal is None:
        return
    session.journal.log_turn(
        input=line,
        turn=session.world.turn_count,
        won=session.world.won,
        outcome=session.world.outcome,
        **record,
    )


def _handle_meta(session: Session, line: str) -> bool:
    """Returns True if the line was a meta command (and was handled)."""
    tokens = line.strip().split()
    if not tokens:
        return False
    command, *rest = tokens
    match command.lower():
        case "help":
            emit(HELP_TEXT)
        case "save":
            _save(session, rest[0] if rest else DEFAULT_SAVE_NAME)
        case "load":
            _load(session, rest[0] if rest else DEFAULT_SAVE_NAME)
        case "saves":
            _list_saves(session)
        case "pronouns":
            _pronouns(session, rest[0] if rest else None)
        case "quit" | "q":
            _quit(session)
        case _:
            return False
    return True


def _save(session: Session, name: str) -> None:
    try:
        path = save_game(session.world, session.save_dir, name)
    except ValueError as exc:
        emit(str(exc))
        return
    emit(f"Saved to {path}.")


def _load(session: Session, name: str) -> None:
    try:
        session.world = load_game(session.save_dir, name)
    except ValueError as exc:
        emit(str(exc))
        return
    except FileNotFoundError:
        emit(f"There is no save called '{name}'. Type 'saves' to see what you have.")
        return
    except WorldValidationError as exc:
        emit(f"That save file is not valid: {exc}")
        return
    emit("Loaded.")
    emit(render_event(engine.describe_room(session.world),
                      pronouns=session.world.pronouns))


def _pronouns(session: Session, choice: str | None) -> None:
    """Show or change the protagonist's pronouns.

    It changes the world state rather than a display flag, so it survives a save
    and takes effect on the next line the game speaks.
    """
    if choice is None:
        current = pronoun_sets.resolve(session.world.pronouns)
        others = [p.id for p in pronoun_sets.SETS.values() if p.id != current.id]
        emit(f"Your character uses {current.label}. "
             f"Type 'pronouns {others[0]}' to change it.")
        return
    if choice.lower() not in pronoun_sets.SETS:
        emit(f"I don't know the pronouns '{choice}'. "
             f"Try one of: {', '.join(pronoun_sets.SETS)}.")
        return
    session.world.pronouns = choice.lower()
    chosen = pronoun_sets.resolve(session.world.pronouns)
    emit(f"Your character uses {chosen.label}. "
         f"{pronoun_sets.apply(pronoun_sets.EXAMPLE, chosen)}")


def _list_saves(session: Session) -> None:
    names = list_saves(session.save_dir)
    if not names:
        emit("You have no saved games.")
        return
    emit("Saved games: " + ", ".join(names) + ".")


def _quit(session: Session) -> None:
    try:
        answer = input("Quit without saving? (y/n) ")
    except (EOFError, KeyboardInterrupt):
        answer = "y"
        emit("")
    if answer.strip().lower() in {"y", "yes"}:
        emit("Goodbye.")
        session.running = False
