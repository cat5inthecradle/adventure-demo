"""T11 acceptance: input routing. Terse commands never touch the network; only lines
the dumb parser rejects reach the language assistant; the engine still decides."""

from pathlib import Path

import pytest

from adventure.actions import Look, Take, Use
from adventure.cli import Session, handle_line
from adventure.loader import load_world
from adventure.models import WorldState
from adventure.nlu import FakeNLU, NLUClarification, NLUResolution, NLUUnavailable

WAYFARER = Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json"

CASUAL = "grab that glowing battery thing and stick it in the robot"
FOLLOW_UP = "the power cell, put it in the droid"


@pytest.fixture
def printed(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Capture everything the CLI emits."""
    lines: list[str] = []
    monkeypatch.setattr("adventure.cli.emit", lines.append)
    return lines


@pytest.fixture
def world() -> WorldState:
    world = load_world(WAYFARER)
    # Stand in the cargo bay with the crate already pried open.
    world.player_location = "cargo_bay"
    world.flags["crate_open"] = True
    world.items["power_cell"].location = "inventory"
    return world


def session_with(world: WorldState, responses: dict, tmp_path: Path) -> Session:
    return Session(world=world, save_dir=tmp_path, nlu=FakeNLU(responses))


def test_terse_commands_never_reach_the_assistant(world: WorldState, tmp_path: Path,
                                                  printed: list[str]) -> None:
    class Explode:
        def resolve(self, *args, **kwargs):
            raise AssertionError("the parser should have handled this line")

    session = Session(world=world, save_dir=tmp_path, nlu=Explode())
    handle_line(session, "look")
    assert printed[0].startswith("== Cargo Bay ==")


def test_a_clarification_is_asked_then_the_answer_is_acted_on(
    world: WorldState, tmp_path: Path, printed: list[str]
) -> None:
    session = session_with(
        world,
        {
            CASUAL: NLUClarification(question="Do you mean the power cell?"),
            FOLLOW_UP: NLUResolution(
                action=Use(item="power_cell", target="maintenance_droid")
            ),
        },
        tmp_path,
    )

    handle_line(session, CASUAL)
    assert printed[-1] == "Do you mean the power cell?"
    assert world.flags.get("droid_active", False) is False   # nothing happened yet

    handle_line(session, FOLLOW_UP)
    assert "clicks home" in printed[-1]
    assert world.flags["droid_active"] is True


def test_the_transcript_feeds_the_next_turn(world: WorldState, tmp_path: Path,
                                            printed: list[str]) -> None:
    session = session_with(world, {CASUAL: NLUClarification(question="Which one?")}, tmp_path)
    handle_line(session, CASUAL)
    handle_line(session, "look")
    assert session.transcript[0] == (CASUAL, "Which one?")
    assert session.transcript[1][0] == "look"


def test_the_transcript_keeps_only_the_recent_past(world: WorldState, tmp_path: Path,
                                                   printed: list[str]) -> None:
    session = session_with(world, {}, tmp_path)
    for _ in range(10):
        handle_line(session, "look")
    assert len(session.transcript) == 6


def test_an_unavailable_assistant_falls_back_to_the_parser_error(
    world: WorldState, tmp_path: Path, printed: list[str]
) -> None:
    session = session_with(
        world, {CASUAL: NLUUnavailable(detail="Connection error.")}, tmp_path
    )
    handle_line(session, CASUAL)
    assert "The language assistant is unavailable (Connection error.)" in printed[-1]
    assert "Classic commands still work" in printed[-1]
    # The parser's own complaint is still shown: 'grab' is a verb it knows, so it
    # got as far as failing on the noun.
    assert "I don't see any" in printed[-1]


def test_with_no_assistant_the_parser_error_stands_alone(world: WorldState, tmp_path: Path,
                                                         printed: list[str]) -> None:
    session = Session(world=world, save_dir=tmp_path, nlu=None)
    handle_line(session, CASUAL)
    assert printed[-1].startswith("I don't see any")
    assert "language assistant" not in printed[-1]


def test_the_engine_still_refuses_an_illegal_suggestion(world: WorldState, tmp_path: Path,
                                                        printed: list[str]) -> None:
    """The assistant proposes; the engine disposes."""
    session = session_with(
        world, {"take the whole crate": NLUResolution(action=Take(item="supply_crate"))}, tmp_path
    )
    handle_line(session, "take the whole crate")
    assert printed[-1] == "You can't take the supply crate."
    assert world.items["supply_crate"].location == "cargo_bay"


def test_meta_commands_are_never_sent_to_the_assistant(world: WorldState, tmp_path: Path,
                                                       printed: list[str]) -> None:
    session = session_with(world, {}, tmp_path)
    handle_line(session, "help")
    assert "Meta commands" in printed[-1]
    assert session.transcript == []


def test_winning_ends_the_session(world: WorldState, tmp_path: Path, printed: list[str]) -> None:
    world.player_location = "escape_pod_bay"
    session = session_with(world, {"eject": NLUResolution(action=Use(item="launch_lever"))},
                           tmp_path)
    handle_line(session, "eject")
    assert "THE END" in printed[-2]
    assert printed[-1].startswith("Escaped in")
    assert session.running is False


def test_a_look_utterance_routes_all_the_way_through(world: WorldState, tmp_path: Path,
                                                     printed: list[str]) -> None:
    utterance = "hmm, I should probably see what's in this room"
    session = session_with(world, {utterance: NLUResolution(action=Look())}, tmp_path)
    handle_line(session, utterance)
    assert printed[-1].startswith("== Cargo Bay ==")


# --- .env loading ------------------------------------------------------------


def test_dotenv_fills_in_missing_variables(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from adventure.cli import _load_dotenv

    env_file = tmp_path / ".env"
    env_file.write_text(
        "# a comment\n"
        "\n"
        "ANTHROPIC_API_KEY=sk-ant-fake\n"
        'ANTHROPIC_MODEL="claude-haiku-4-5-20251001"\n'
        "MALFORMED LINE\n"
    )
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_MODEL", raising=False)

    _load_dotenv(env_file)
    import os

    assert os.environ["ANTHROPIC_API_KEY"] == "sk-ant-fake"
    assert os.environ["ANTHROPIC_MODEL"] == "claude-haiku-4-5-20251001"


def test_the_shell_wins_over_the_dotenv_file(tmp_path: Path,
                                             monkeypatch: pytest.MonkeyPatch) -> None:
    from adventure.cli import _load_dotenv

    env_file = tmp_path / ".env"
    env_file.write_text("ANTHROPIC_MODEL=from-file\n")
    monkeypatch.setenv("ANTHROPIC_MODEL", "from-shell")
    _load_dotenv(env_file)
    import os

    assert os.environ["ANTHROPIC_MODEL"] == "from-shell"


def test_a_missing_dotenv_is_not_an_error(tmp_path: Path) -> None:
    from adventure.cli import _load_dotenv

    _load_dotenv(tmp_path / "nope.env")


def test_llm_off_never_builds_a_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    from adventure.cli import _build_nlu

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    assert _build_nlu("off", "claude-haiku-4-5-20251001") is None


def test_auto_needs_a_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from adventure.cli import _build_nlu

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert _build_nlu("auto", "claude-haiku-4-5-20251001") is None


def test_auto_builds_a_provider_when_a_key_is_present(monkeypatch: pytest.MonkeyPatch) -> None:
    from adventure.cli import _build_nlu
    from adventure.nlu import AnthropicNLU

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    assert isinstance(_build_nlu("auto", "claude-haiku-4-5-20251001"), AnthropicNLU)
