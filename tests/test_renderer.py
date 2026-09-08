"""T5 acceptance: every event renders deterministic, layout-free prose."""

import pytest

from adventure.events import (
    ActionFailed,
    DoorOpened,
    EntityExamined,
    EntityRef,
    ExitView,
    GameEnded,
    InventoryListed,
    ItemDropped,
    ItemTaken,
    ItemUsed,
    Moved,
    NpcSpoke,
    Reason,
    RoomDescribed,
)
from adventure.parser import ParseError
from adventure.renderer import render_event, render_events, render_parse_error

ROCK = EntityRef(id="rock", name="rock")
STATUE = EntityRef(id="statue", name="statue")
ROBOT = EntityRef(id="robot", name="robot")
DOOR = EntityRef(id="door_ab", name="connecting door")
ROOM_A = EntityRef(id="room_a", name="Room A")
ROOM_B = EntityRef(id="room_b", name="Room B")


def room_event() -> RoomDescribed:
    return RoomDescribed(
        room=ROOM_A,
        description="A bare room.",
        exits=[
            ExitView(direction="north"),
            ExitView(direction="east", door=DOOR, door_open=False),
        ],
        items=[ROCK, STATUE],
        npcs=[ROBOT],
    )


ALL_EVENTS = [
    room_event(),
    EntityExamined(entity=ROCK, description="A fist-sized rock."),
    Moved(from_room=ROOM_A, to_room=ROOM_B),
    ItemTaken(item=ROCK),
    ItemDropped(item=ROCK),
    DoorOpened(door=DOOR),
    ItemUsed(item=ROCK, target=STATUE, message="The statue cracks."),
    NpcSpoke(npc=ROBOT, text='The robot says, "Hello."'),
    InventoryListed(items=[ROCK]),
    InventoryListed(items=[]),
    GameEnded(outcome="win", epilogue="You made it."),
    ActionFailed(reason=Reason.NO_EXIT),
]


@pytest.mark.parametrize("event", ALL_EVENTS, ids=lambda e: e.type)
def test_every_event_renders_plain_prose(event: object) -> None:
    text = render_event(event)
    assert text and text == render_event(event)
    assert not any(ch in text for ch in "─│┌┐└┘\x1b")


def test_room_description_states_every_fact_in_words() -> None:
    text = render_event(room_event())
    assert text.splitlines()[0] == "== Room A =="
    assert "A bare room." in text
    assert "Exits: north, east (through the connecting door, closed)." in text
    assert "You see rock and statue here." in text
    assert "robot is here." in text


def test_room_description_omits_empty_sentences() -> None:
    text = render_event(
        RoomDescribed(room=ROOM_B, description="Empty.", exits=[], items=[], npcs=[])
    )
    assert "You see" not in text
    assert "Exits: none." in text


def test_open_door_renders_as_open() -> None:
    event = room_event()
    event.exits[1].door_open = True
    assert "east (through the connecting door, open)" in render_event(event)


@pytest.mark.parametrize(
    ("event", "expected"),
    [
        (Moved(from_room=ROOM_A, to_room=ROOM_B), "You head to the Room B."),
        (ItemTaken(item=ROCK), "You take the rock."),
        (ItemDropped(item=ROCK), "You put down the rock."),
        (DoorOpened(door=DOOR), "You open the connecting door."),
        (ItemUsed(item=ROCK, target=None, message="It hums."), "It hums."),
        (NpcSpoke(npc=ROBOT, text="Beep."), "Beep."),
        (EntityExamined(entity=ROCK, description="A rock."), "A rock."),
        (InventoryListed(items=[]), "You are carrying nothing."),
        (InventoryListed(items=[ROCK, STATUE]), "You are carrying rock and statue."),
    ],
)
def test_event_templates(event: object, expected: str) -> None:
    assert render_event(event) == expected


def test_game_won_appends_the_ending() -> None:
    assert render_event(GameEnded(outcome="win", epilogue="You made it.")) == (
        "You made it.\n\n*** You have escaped. THE END ***"
    )


def test_game_lost_gets_its_own_default_ending() -> None:
    assert render_event(GameEnded(outcome="loss", epilogue="The blade falls.")) == (
        "The blade falls.\n\n*** You have died. THE END ***"
    )


def test_a_world_supplied_banner_replaces_the_default() -> None:
    ended = GameEnded(outcome="win", epilogue="You fall into the dark.",
                      banner="*** TO BE CONTINUED ***")
    assert render_event(ended) == "You fall into the dark.\n\n*** TO BE CONTINUED ***"


@pytest.mark.parametrize("reason", list(Reason))
def test_every_reason_has_a_fallback_string(reason: Reason) -> None:
    text = render_event(ActionFailed(reason=reason, subject=DOOR))
    assert text and text[0].isupper() and text.endswith(".")


def test_world_message_overrides_the_fallback() -> None:
    event = ActionFailed(reason=Reason.DOOR_LOCKED, subject=DOOR, message="The seals hold fast.")
    assert render_event(event) == "The seals hold fast."


def test_failure_strings_name_the_subject() -> None:
    assert render_event(ActionFailed(reason=Reason.DOOR_CLOSED, subject=DOOR)) == (
        "The connecting door is closed."
    )
    assert render_event(ActionFailed(reason=Reason.NOT_PORTABLE, subject=STATUE)) == (
        "You can't take the statue."
    )
    assert render_event(ActionFailed(reason=Reason.DOOR_CLOSED)) == "It is closed."


def test_render_events_separates_with_a_blank_line() -> None:
    text = render_events([ItemTaken(item=ROCK), ItemDropped(item=ROCK)])
    assert text == "You take the rock.\n\nYou put down the rock."
    assert render_events([]) == ""


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (ParseError(kind="unknown_verb", verb="xyzzy"),
         "I don't know the word 'xyzzy'. Type 'help' for commands."),
        (ParseError(kind="unknown_noun", noun="sandwich"), "I don't see any 'sandwich' here."),
        (ParseError(kind="ambiguous", candidates=[ROCK, STATUE]),
         "Which do you mean: rock or statue?"),
        (ParseError(kind="missing_noun", verb="take"), "Take what?"),
        (ParseError(kind="empty"), "Please type a command, or 'help'."),
    ],
)
def test_parse_errors(error: ParseError, expected: str) -> None:
    assert render_parse_error(error) == expected


# --- speech: the same events, put into words for the ear ---------------------

from adventure.renderer import Style  # noqa: E402


def room(first_visit: bool = True) -> RoomDescribed:
    return RoomDescribed(
        room=ROOM_A, description="A bare room.", first_visit=first_visit,
        exits=[ExitView(direction="north"),
               ExitView(direction="east", door=DOOR, door_open=False)],
        items=[ROCK], npcs=[ROBOT],
    )


def test_speech_drops_decoration() -> None:
    """'== Room A ==' is read aloud as 'equals equals Room A equals equals'."""
    spoken = render_event(room(), Style.SPEECH)
    assert "==" not in spoken
    assert spoken.startswith("Room A.")


def test_speech_gives_a_blocked_way_its_own_sentence() -> None:
    """A listener cannot see brackets, so the parenthetical becomes a sentence."""
    spoken = render_event(room(), Style.SPEECH)
    assert "You can go north." in spoken
    assert "The connecting door to the east is closed." in spoken
    assert "(" not in spoken


def test_speech_skips_the_description_on_a_room_already_seen() -> None:
    """The tax skimming never charges: hearing the same paragraph every time you
    cross the corridor."""
    first = render_event(room(first_visit=True), Style.SPEECH)
    again = render_event(room(first_visit=False), Style.SPEECH)
    assert "A bare room." in first
    assert "A bare room." not in again
    assert "You can go north." in again          # the actionable part stays
    assert len(again) < len(first)


def test_speech_adds_articles() -> None:
    spoken = render_event(room(), Style.SPEECH)
    assert "a rock" in spoken


def test_speech_uses_an_before_a_vowel() -> None:
    event = RoomDescribed(room=ROOM_A, description="d.", exits=[],
                          items=[EntityRef(id="manual", name="emergency manual")], npcs=[])
    assert "an emergency manual" in render_event(event, Style.SPEECH)


def test_the_ending_is_not_read_out_as_asterisks() -> None:
    from adventure.events import GameEnded

    event = GameEnded(outcome="win", epilogue="You made it.")
    written = render_event(event)
    spoken = render_event(event, Style.SPEECH)
    assert "*" in written
    assert "*" not in spoken
    assert "You made it." in spoken


def test_written_output_is_untouched_by_the_new_style() -> None:
    """Adding a register must not change the one that already shipped."""
    assert render_event(room()) == render_event(room(), Style.TEXT)
    assert render_event(room()).startswith("== Room A ==")


def test_speech_contains_nothing_a_voice_would_stumble_over() -> None:
    for event in ALL_EVENTS:
        spoken = render_event(event, Style.SPEECH)
        assert not any(ch in spoken for ch in "=*|_<>[]{}"), spoken


def test_speech_is_split_by_who_is_speaking() -> None:
    """The droid can have its own voice because NpcSpoke is its own event. That is
    free here and impossible if the prose had arrived as one undifferentiated blob
    from a language model."""
    from adventure.renderer import render_speech

    parts = render_speech([
        ItemUsed(item=ROCK, target=STATUE, message="The statue cracks."),
        NpcSpoke(npc=ROBOT, text='It looks up. "Beep. I am fine."'),
    ])
    assert [p["voice"] for p in parts] == ["narrator", "narrator", "npc"]
    assert parts[2]["speaker"] == "robot"
    assert parts[2]["text"] == "Beep. I am fine."


def test_an_npc_line_with_no_quotes_stays_narration() -> None:
    """Dialogue rules are often pure description — the droid's first line is "The
    droid is dark and unresponsive", which is the narrator, not the droid. Voicing
    that as the character would be wrong, and worse, would make dead machines talk.
    """
    from adventure.renderer import render_speech

    parts = render_speech([NpcSpoke(npc=ROBOT, text="The robot sits motionless.")])
    assert [p["voice"] for p in parts] == ["narrator"]


def test_speech_parts_skip_events_that_say_nothing() -> None:
    from adventure.renderer import render_speech

    assert render_speech([]) == []


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # Narration wrapped around speech: only the quoted half is the character.
        ("R-6 boots with a rising whir. 'Unit R-6 online.'",
         [("narrator", "R-6 boots with a rising whir."), ("npc", "Unit R-6 online.")]),
        ('The robot whirs. "Oh! A visitor."',
         [("narrator", "The robot whirs."), ("npc", "Oh! A visitor.")]),
        # No quotes at all: the whole line is the narrator describing a machine.
        ("The droid is dark and unresponsive.",
         [("narrator", "The droid is dark and unresponsive.")]),
        # An apostrophe inside a word must not open a quote.
        ("You slot it into the droid's chest port.",
         [("narrator", "You slot it into the droid's chest port.")]),
        # Speech first, narration after.
        ("'Get down!' she hissed.",
         [("npc", "Get down!"), ("narrator", "she hissed.")]),
    ],
)
def test_dialogue_splits_narration_from_speech(text: str, expected: list) -> None:
    from adventure.renderer import split_quoted

    assert split_quoted(text) == expected


def test_only_the_quoted_half_gets_the_character_voice() -> None:
    from adventure.renderer import render_speech

    parts = render_speech([
        NpcSpoke(npc=ROBOT, text="The robot whirs to attention. \"Hello there.\""),
    ])
    assert [(p["voice"], p["text"]) for p in parts] == [
        ("narrator", "The robot whirs to attention."),
        ("npc", "Hello there."),
    ]
    assert parts[0]["speaker"] is None       # the narrator is nobody
    assert parts[1]["speaker"] == "robot"
