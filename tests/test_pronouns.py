"""The player character's pronouns: substitution, verb agreement, and the seams
where a wrong answer would reach a player.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adventure import engine, pronouns
from adventure.actions import Look, Talk
from adventure.loader import WorldValidationError, load_world, validate_world
from adventure.models import WorldState
from adventure.persistence import load_game, save_game
from adventure.renderer import Style, render_event, render_events, render_speech
from adventure.turn import take_turn
from adventure.web import create_app

FIXTURE = Path(__file__).parent / "fixtures" / "pronoun_world.json"


@pytest.fixture
def world() -> WorldState:
    return load_world(FIXTURE)


# --- substitution ------------------------------------------------------------


@pytest.mark.parametrize("choice,expected", [
    ("he", "He walks in. The porter watches him find his own way."),
    ("she", "She walks in. The porter watches her find her own way."),
    ("they", "They walk in. The porter watches them find their own way."),
])
def test_every_set_agrees_with_its_verbs(choice: str, expected: str) -> None:
    line = "{They} walk{s} in. The porter watches {them} find {their} own way."
    assert pronouns.apply(line, choice) == expected


def test_the_irregular_verbs_follow_the_pronoun() -> None:
    line = "{They} {are} late, {they} {were} warned, {they} {have} the map, and {they} {do} know it."
    assert pronouns.apply(line, "he") == (
        "He is late, he was warned, he has the map, and he does know it.")
    assert pronouns.apply(line, "they") == (
        "They are late, they were warned, they have the map, and they do know it.")


def test_capitalisation_follows_the_token() -> None:
    assert pronouns.apply("{They} and {they}", "she") == "She and she"


def test_possessive_pronoun_is_not_the_possessive_determiner() -> None:
    # The one distinction English hides for "he" and exposes for everyone else.
    assert pronouns.apply("{their} pack, and the pack is {theirs}", "she") == (
        "her pack, and the pack is hers")


def test_reflexive() -> None:
    assert pronouns.apply("{They} let {themselves} in", "they") == "They let themselves in"


def test_an_unknown_token_is_left_visible_rather_than_blanked() -> None:
    # A typo the author can see is a bug report; a silently deleted word is not.
    assert pronouns.apply("{thier} pack", "she") == "{thier} pack"


def test_braces_that_are_not_tokens_survive_untouched() -> None:
    assert pronouns.apply('a screen reading {"status": "ok"}', "he") == (
        'a screen reading {"status": "ok"}')


def test_unknown_pronouns_fall_back_rather_than_raising() -> None:
    # Reached only by a hand-edited file or a stale save; never a live player.
    assert pronouns.apply("{they}", "wizard") == "they"
    assert pronouns.resolve(None).id == pronouns.DEFAULT


def test_every_advertised_option_renders_its_own_example() -> None:
    for option in pronouns.options():
        assert "{" not in option["example"]
        assert option["id"] in pronouns.SETS


# --- the world file ----------------------------------------------------------


def test_a_world_declares_the_pronouns_its_prose_was_written_for(world: WorldState) -> None:
    assert world.pronouns == "she"


def test_a_world_without_the_field_gets_the_neutral_default() -> None:
    assert load_world(Path(__file__).parent / "fixtures" / "tiny_world.json").pronouns == "they"


def test_an_unknown_set_in_a_world_file_fails_loudly(world: WorldState) -> None:
    world.pronouns = "wizard"
    with pytest.raises(WorldValidationError, match="pronouns"):
        validate_world(world)


# --- rendering ---------------------------------------------------------------


def test_the_room_description_is_substituted(world: WorldState) -> None:
    text = render_event(engine.describe_room(world), pronouns=world.pronouns)
    assert "the light from the hatch she came out of" in text
    assert "{" not in text


def test_dialogue_is_substituted_in_text_and_in_speech(world: WorldState) -> None:
    events = engine.apply(world, Talk(npc="porter"))
    assert "She walks like a spacer" in render_events(events, pronouns="she")
    assert "They walk like a spacer" in render_events(events, pronouns="they")
    parts = render_speech(events, "they")
    assert any("They walk like a spacer" in part["text"] for part in parts)
    assert all("{" not in part["text"] for part in parts)


def test_a_turn_uses_the_world_setting_without_being_told(world: WorldState) -> None:
    result = take_turn(world, "look")
    assert "she came out of" in result.text
    world.pronouns = "he"
    assert "he came out of" in take_turn(world, "look").text


def test_speech_and_text_agree_on_the_choice(world: WorldState) -> None:
    described = engine.describe_room(world)
    assert "{" not in render_event(described, Style.SPEECH, world.pronouns)


def test_rendering_without_a_choice_still_reads_as_english(world: WorldState) -> None:
    # Callers that predate this feature pass nothing; they must not get braces.
    assert "{" not in render_event(engine.describe_room(world))


# --- it is world state, so it saves and it can change mid-game ---------------


def test_the_choice_survives_a_save(world: WorldState, tmp_path: Path) -> None:
    world.pronouns = "they"
    save_game(world, tmp_path, "quicksave")
    assert load_game(tmp_path, "quicksave").pronouns == "they"


def test_changing_it_mid_game_changes_prose_written_before_the_change(
        world: WorldState) -> None:
    engine.apply(world, Look())
    world.pronouns = "he"
    assert "he came out of" in render_events(engine.apply(world, Look()),
                                             pronouns=world.pronouns)


# --- the web frontend --------------------------------------------------------


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(FIXTURE, journal="none"))


def test_the_options_are_served_rather_than_hard_coded_in_the_page(
        client: TestClient) -> None:
    body = client.get("/api/pronouns").json()
    assert body["default"] == pronouns.DEFAULT
    assert [option["id"] for option in body["options"]] == ["he", "she", "they"]
    assert all(option["example"] for option in body["options"])


def test_a_new_game_uses_the_world_default(client: TestClient) -> None:
    body = client.post("/api/sessions").json()
    assert body["view"]["pronouns"] == "she"
    assert "she came out of" in body["text"]
    assert "{" not in body["intro"]


def test_a_returning_player_sends_their_own_choice(client: TestClient) -> None:
    body = client.post("/api/sessions?pronouns=they").json()
    assert body["view"]["pronouns"] == "they"
    assert "they came out of" in body["text"]


def test_settings_change_the_prose_without_spending_a_turn(client: TestClient) -> None:
    session = client.post("/api/sessions").json()["session_id"]
    before = client.get(f"/api/sessions/{session}").json()["view"]["turn_count"]
    body = client.put(f"/api/sessions/{session}/settings",
                      json={"pronouns": "he"}).json()
    assert body["view"]["pronouns"] == "he"
    assert "he came out of" in body["text"]
    assert body["view"]["description"].count("he came out of") == 1
    assert body["view"]["turn_count"] == before


def test_the_change_holds_for_later_turns(client: TestClient) -> None:
    session = client.post("/api/sessions").json()["session_id"]
    client.put(f"/api/sessions/{session}/settings", json={"pronouns": "they"})
    body = client.post(f"/api/sessions/{session}/turn",
                       json={"input": "talk to porter"}).json()
    assert "They walk like a spacer" in body["text"]


def test_a_nonsense_choice_is_rejected_rather_than_defaulted(client: TestClient) -> None:
    session = client.post("/api/sessions").json()["session_id"]
    response = client.put(f"/api/sessions/{session}/settings",
                          json={"pronouns": "wizard"})
    assert response.status_code == 400
    assert "wizard" in response.json()["detail"]
    assert client.post("/api/sessions?pronouns=wizard").status_code == 400


def test_two_players_can_disagree(client: TestClient) -> None:
    one = client.post("/api/sessions?pronouns=he").json()
    two = client.post("/api/sessions?pronouns=they").json()
    assert "he came out of" in one["text"]
    assert "they came out of" in two["text"]


# --- the terminal ------------------------------------------------------------


@pytest.fixture
def printed(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    lines: list[str] = []
    monkeypatch.setattr("adventure.cli.emit", lines.append)
    return lines


def cli_session(world: WorldState, tmp_path: Path):
    from adventure.cli import Session

    return Session(world=world, save_dir=tmp_path)


def test_the_terminal_reports_the_current_choice(world: WorldState, tmp_path: Path,
                                                 printed: list[str]) -> None:
    from adventure.cli import handle_line

    handle_line(cli_session(world, tmp_path), "pronouns")
    assert "she / her" in printed[0]


def test_the_terminal_changes_it_and_shows_the_difference(world: WorldState,
                                                          tmp_path: Path,
                                                          printed: list[str]) -> None:
    from adventure.cli import handle_line

    session = cli_session(world, tmp_path)
    handle_line(session, "pronouns they")
    assert session.world.pronouns == "they"
    assert "they / them" in printed[0]
    handle_line(session, "look")
    assert "they came out of" in printed[-1]


def test_the_terminal_refuses_a_set_it_does_not_have(world: WorldState, tmp_path: Path,
                                                     printed: list[str]) -> None:
    from adventure.cli import handle_line

    session = cli_session(world, tmp_path)
    handle_line(session, "pronouns wizard")
    assert session.world.pronouns == "she"
    assert "wizard" in printed[0]
