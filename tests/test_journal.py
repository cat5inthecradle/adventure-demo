"""The journal: pluggable destination, and it must never take the game down."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adventure.journal import (
    FileSink,
    Journal,
    NullSink,
    build_sink,
    turn_record,
)
from adventure.loader import load_world
from adventure.turn import take_turn
from adventure.web import create_app

WAYFARER = Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json"


# --- choosing a backend ------------------------------------------------------


@pytest.mark.parametrize("spec", [None, "", "none", "off", "  NONE  ", "disabled"])
def test_disabled_specs_produce_a_null_sink(spec: str | None) -> None:
    sink = build_sink(spec)
    assert isinstance(sink, NullSink)
    sink.emit({"anything": True})           # must be a silent no-op


def test_a_path_or_file_scheme_produces_a_file_sink(tmp_path: Path) -> None:
    bare = build_sink(str(tmp_path / "a.jsonl"))
    scheme = build_sink(f"file:{tmp_path / 'b.jsonl'}")
    assert isinstance(bare, FileSink) and isinstance(scheme, FileSink)
    assert bare.path == tmp_path / "a.jsonl"
    assert scheme.path == tmp_path / "b.jsonl"


def test_an_unknown_backend_is_refused_loudly() -> None:
    """Better to fail at startup than to silently discard a session's data."""
    with pytest.raises(ValueError) as excinfo:
        build_sink("clickhouse://analytics/play")
    assert "clickhouse" in str(excinfo.value)


# --- writing -----------------------------------------------------------------


def test_records_are_one_json_object_per_line(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "deep" / "play.jsonl"
    journal = Journal(build_sink(str(path)), world_name="wayfarer", session_id="abc123")

    journal.log_turn(input="look", route="parser")
    journal.log_turn(input="go east", route="parser")

    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["input"] == "look"
    assert first["session"] == "abc123"
    assert first["world"] == "wayfarer"
    assert first["schema"] == 1
    assert first["ts"].endswith("+00:00")


def test_long_responses_are_truncated(tmp_path: Path) -> None:
    path = tmp_path / "play.jsonl"
    journal = Journal(build_sink(str(path)), world_name="w")
    journal.log_turn(input="look", response="x" * 900)
    record = json.loads(path.read_text().splitlines()[0])
    assert len(record["response"]) < 400 and record["response"].endswith("…")


def test_a_disabled_journal_writes_nothing(tmp_path: Path) -> None:
    journal = Journal(NullSink(), world_name="w")
    assert journal.enabled is False
    journal.log_turn(input="look")
    assert list(tmp_path.iterdir()) == []


# --- the guarantee that matters ----------------------------------------------


def test_an_unwritable_destination_never_raises(tmp_path: Path) -> None:
    """Losing analytics must always beat losing the player's session."""
    blocked = tmp_path / "afile"
    blocked.write_text("not a directory")
    journal = Journal(build_sink(str(blocked / "play.jsonl")), world_name="w")

    journal.log_turn(input="look")          # must not raise
    journal.log_turn(input="go east")
    assert "disabled" in journal.describe()


def test_a_sink_that_fails_mid_session_disables_itself(tmp_path: Path) -> None:
    path = tmp_path / "play.jsonl"
    sink = FileSink(path)
    sink.emit({"turn": 1})
    assert path.read_text().strip()

    sink.path = None                        # simulate the disk going away
    sink.emit({"turn": 2})                  # must not raise
    assert len(path.read_text().splitlines()) == 1


# --- the record shape both frontends share -----------------------------------


def test_turn_record_captures_a_successful_action() -> None:
    world = load_world(WAYFARER)
    result = take_turn(world, "take the manual")
    record = turn_record(result, room="crew_quarters")
    assert record["route"] == "parser"
    assert record["parse"] == {"ok": True}
    assert record["action"]["item"] == "emergency_manual"
    assert record["events"] == ["item_taken"]
    assert record["failure"] is None


def test_turn_record_captures_why_the_parser_failed() -> None:
    world = load_world(WAYFARER)
    result = take_turn(world, "take the sandwich")
    record = turn_record(result, room="crew_quarters")
    assert record["route"] == "unresolved"
    assert record["parse"] == {"ok": False, "error": "unknown_noun",
                               "noun": "sandwich", "verb": None}
    assert "action" not in record


def test_turn_record_captures_an_engine_refusal() -> None:
    world = load_world(WAYFARER)
    take_turn(world, "go east")
    result = take_turn(world, "take the console")
    record = turn_record(result, room="corridor")
    assert record["failure"] == "not_portable"


# --- the web frontend journals too -------------------------------------------


def test_the_web_server_records_every_turn(tmp_path: Path) -> None:
    path = tmp_path / "web.jsonl"
    client = TestClient(create_app(WAYFARER, journal=f"file:{path}"))

    session = client.post("/api/sessions").json()["session_id"]
    client.post(f"/api/sessions/{session}/turn", json={"input": "take the manual"})
    client.post(f"/api/sessions/{session}/turn", json={"input": "go east"})

    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert [r["input"] for r in records] == ["take the manual", "go east"]
    assert records[0]["room"] == "crew_quarters"      # room BEFORE the move
    assert records[1]["room"] == "crew_quarters"
    assert records[1]["action"]["direction"] == "east"
    assert len({r["session"] for r in records}) == 1


def test_each_web_player_gets_their_own_session_id(tmp_path: Path) -> None:
    path = tmp_path / "web.jsonl"
    client = TestClient(create_app(WAYFARER, journal=f"file:{path}"))
    for _ in range(2):
        session = client.post("/api/sessions").json()["session_id"]
        client.post(f"/api/sessions/{session}/turn", json={"input": "look"})

    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert len({r["session"] for r in records}) == 2


def test_healthz_reports_where_play_is_being_recorded(tmp_path: Path) -> None:
    path = tmp_path / "web.jsonl"
    client = TestClient(create_app(WAYFARER, journal=f"file:{path}"))
    assert client.get("/healthz").json()["journal"] == str(path)

    off = TestClient(create_app(WAYFARER, journal="none"))
    assert off.get("/healthz").json()["journal"] == "disabled"
