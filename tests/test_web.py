"""The HTTP frontend: same engine, same truth, reached over JSON.

No network and no LLM — the app is constructed with an injected FakeNLU where one
is needed at all.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adventure.actions import Look, Use
from adventure.nlu import FakeNLU, NLUClarification, NLUResolution
from adventure.web import create_app

WAYFARER = Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json"
# Multi-world behaviour needs more than one world beside each other, and there is one
# world in this repository. The fixtures directory has two, which is all these tests
# are actually asking for.
FIXTURES = Path(__file__).parent / "fixtures" / "tiny_world.json"

GOLDEN = ["go east", "go south", "take prybar", "go north", "go east",
          "use prybar on crate", "take power cell", "use power cell on droid",
          "talk to droid", "go west", "open door", "go north", "pull lever"]


@pytest.fixture
def client() -> TestClient:
    # journal="none": tests must never write into the real playthrough log.
    return TestClient(create_app(WAYFARER, journal="none"))


def start(client: TestClient) -> str:
    response = client.post("/api/sessions")
    assert response.status_code == 200
    return response.json()["session_id"]


def turn(client: TestClient, session: str, line: str) -> dict:
    response = client.post(f"/api/sessions/{session}/turn", json={"input": line})
    assert response.status_code == 200, response.text
    return response.json()


def test_healthz_is_cheap_and_informative(client: TestClient) -> None:
    body = client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["world"] == "The Wayfarer"


def test_a_new_game_starts_in_the_crew_quarters(client: TestClient) -> None:
    body = client.post("/api/sessions").json()
    assert body["title"] == "The Wayfarer"
    assert "Wayfarer" in body["intro"]
    assert "== Crew Quarters ==" in body["text"]
    assert body["view"]["room"]["id"] == "crew_quarters"
    assert [i["id"] for i in body["view"]["items"]] == ["emergency_manual"]


def test_every_response_carries_prose_and_structure(client: TestClient) -> None:
    """The point of the architecture: neither representation is the real one."""
    session = start(client)
    body = turn(client, session, "take the manual")
    assert body["text"] == "You take the emergency manual."
    assert [e["type"] for e in body["events"]] == ["item_taken"]
    assert body["events"][0]["item"]["id"] == "emergency_manual"
    assert [i["id"] for i in body["view"]["inventory"]] == ["emergency_manual"]


def test_the_view_marks_a_shut_door_impassable(client: TestClient) -> None:
    session = start(client)
    body = turn(client, session, "go east")
    north = next(e for e in body["view"]["exits"] if e["direction"] == "north")
    assert north["passable"] is False
    assert north["door"]["name"] == "pod bay door"


def test_the_engine_still_refuses_illegal_moves(client: TestClient) -> None:
    session = start(client)
    body = turn(client, session, "go north")
    assert body["text"] == "You can't go that way."
    assert body["view"]["room"]["id"] == "crew_quarters"


def test_sessions_do_not_share_a_world(client: TestClient) -> None:
    a, b = start(client), start(client)
    turn(client, a, "take the manual")
    body = turn(client, b, "look")
    assert [i["id"] for i in body["view"]["items"]] == ["emergency_manual"]


def test_the_whole_game_is_winnable_over_http(client: TestClient) -> None:
    session = start(client)
    for line in GOLDEN:
        body = turn(client, session, line)
    assert body["won"] is True
    assert "THE END" in body["text"]
    assert body["view"]["turn_count"] == len(GOLDEN)


def test_an_unknown_session_is_a_clean_404(client: TestClient) -> None:
    response = client.post("/api/sessions/nope/turn", json={"input": "look"})
    assert response.status_code == 404
    assert "expired" in response.json()["detail"]


def test_ending_a_session_frees_it(client: TestClient) -> None:
    session = start(client)
    assert client.delete(f"/api/sessions/{session}").status_code == 204
    assert client.post(f"/api/sessions/{session}/turn", json={"input": "look"}).status_code == 404


def test_empty_and_oversized_input_are_rejected(client: TestClient) -> None:
    session = start(client)
    assert client.post(f"/api/sessions/{session}/turn", json={"input": ""}).status_code == 422
    long = "x" * 501
    assert client.post(f"/api/sessions/{session}/turn", json={"input": long}).status_code == 422


def test_the_assistant_routes_the_same_way_as_the_cli() -> None:
    """A line the parser cannot use goes to the assistant; the engine still decides."""
    utterance = "hmm, I should probably see what's in this room"
    fake = FakeNLU({
        utterance: NLUResolution(action=Look()),
        "put the thing in the thing": NLUClarification(question="Which thing?"),
    })
    client = TestClient(create_app(WAYFARER, nlu=fake, journal="none"))
    session = start(client)

    looked = turn(client, session, utterance)
    assert looked["route"] == "nlu"
    assert "== Crew Quarters ==" in looked["text"]

    asked = turn(client, session, "put the thing in the thing")
    assert asked["clarifying"] is True
    assert asked["text"] == "Which thing?"
    assert asked["events"] == []


def test_terse_commands_never_reach_the_assistant() -> None:
    class Explode:
        def resolve(self, *args, **kwargs):
            raise AssertionError("the parser should have handled this")

    client = TestClient(create_app(WAYFARER, nlu=Explode(), journal="none"))
    session = start(client)
    assert turn(client, session, "look")["route"] == "parser"


def test_the_index_page_is_served(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "aria-live" in response.text


# --- both registers on the wire ----------------------------------------------


def test_every_response_carries_written_and_spoken_prose(client: TestClient) -> None:
    """The architecture's claim, made literal: one set of events, rendered for two
    senses, neither one the 'real' version."""
    body = client.post("/api/sessions").json()
    assert body["text"].startswith("== Crew Quarters ==")
    assert body["speech"].startswith("Crew Quarters.")
    assert "==" not in body["speech"]


def test_the_spoken_room_shrinks_on_a_second_visit(client: TestClient) -> None:
    """A listener cannot skim, so re-reading the paragraph is a real cost."""
    session = start(client)
    first = turn(client, session, "go east")
    turn(client, session, "go west")
    again = turn(client, session, "go east")

    assert len(again["speech"]) < len(first["speech"]) / 2
    assert len(again["text"]) == len(first["text"])       # the written one is unchanged
    assert "You can go south, east or west." in again["speech"]


def test_a_clarifying_question_reads_the_same_either_way() -> None:
    from adventure.nlu import FakeNLU, NLUClarification

    fake = FakeNLU({"put the thing in the thing": NLUClarification(question="Which thing?")})
    c = TestClient(create_app(WAYFARER, nlu=fake, journal="none"))
    session = start(c)
    body = turn(c, session, "put the thing in the thing")
    assert body["text"] == body["speech"] == "Which thing?"


# --- choosing a world --------------------------------------------------------


@pytest.fixture
def many() -> TestClient:
    """An app pointed at a directory holding more than one world."""
    return TestClient(create_app(FIXTURES, journal="none"))


def test_the_only_world_present_is_the_one_offered(client: TestClient) -> None:
    worlds = client.get("/api/worlds").json()
    by_id = {w["id"]: w for w in worlds}
    assert "wayfarer" in by_id
    assert by_id["wayfarer"]["default"] is True
    assert by_id["wayfarer"]["title"] == "The Wayfarer"


def test_every_world_beside_the_named_one_is_offered(many: TestClient) -> None:
    by_id = {w["id"]: w for w in many.get("/api/worlds").json()}
    assert "tiny_world" in by_id and "pronoun_world" in by_id
    assert by_id["tiny_world"]["default"] is True


def test_a_session_can_start_in_another_world(many: TestClient) -> None:
    body = many.post("/api/sessions", params={"world_id": "pronoun_world"}).json()
    assert body["world_id"] == "pronoun_world"
    assert body["title"] == "Pronoun Test World"
    assert "Room A" not in body["text"]


def test_worlds_do_not_leak_into_each_other(many: TestClient) -> None:
    a = many.post("/api/sessions").json()["session_id"]
    b = many.post("/api/sessions", params={"world_id": "pronoun_world"}).json()["session_id"]
    turn(many, a, "take the rock")
    assert many.get(f"/api/sessions/{b}").json()["view"]["room"]["id"] != "room_a"


def test_an_unknown_world_is_refused_by_name(client: TestClient) -> None:
    response = client.post("/api/sessions", params={"world_id": "atlantis"})
    assert response.status_code == 404
    assert "atlantis" in response.json()["detail"]


def test_a_broken_world_file_does_not_stop_the_others(tmp_path) -> None:
    """One unloadable file beside the others must not take the server down with it."""
    import shutil

    shutil.copy(WAYFARER, tmp_path / "wayfarer.json")
    (tmp_path / "broken.json").write_text('{"title": "nope"}')
    app = create_app(tmp_path / "wayfarer.json", journal="none")
    ids = [w["id"] for w in TestClient(app).get("/api/worlds").json()]
    assert ids == ["wayfarer"]
