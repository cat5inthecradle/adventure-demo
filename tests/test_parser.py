"""T4 acceptance: every grammar row, every synonym, both resolution modes, every error kind."""

import copy
from pathlib import Path

import pytest

from adventure.actions import (
    Drop,
    Examine,
    Go,
    Look,
    Open,
    ShowInventory,
    Take,
    Talk,
    Traverse,
    Use,
)
from adventure.loader import load_world
from adventure.models import Item, WorldState
from adventure.parser import ParseError, parse

TINY = Path(__file__).parent / "fixtures" / "tiny_world.json"


@pytest.fixture
def world() -> WorldState:
    """room_a: rock (alias stone), statue, door_ab. The gem is hidden."""
    return load_world(TINY)


@pytest.fixture
def crowded(world: WorldState) -> WorldState:
    """A second rock, so 'rock' and 'stone' are both ambiguous."""
    world = copy.deepcopy(world)
    world.items["small_rock"] = Item(
        id="small_rock",
        name="small rock",
        aliases=["rock", "stone"],
        description="A smaller rock.",
        location="room_a",
    )
    return world


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # look / examine
        ("look", Look()),
        ("l", Look()),
        ("look at statue", Examine(target="statue")),
        ("look statue", Examine(target="statue")),
        ("examine statue", Examine(target="statue")),
        ("x statue", Examine(target="statue")),
        ("inspect statue", Examine(target="statue")),
        ("read statue", Examine(target="statue")),
        # go
        ("go east", Go(direction="east")),
        ("walk east", Go(direction="east")),
        ("move east", Go(direction="east")),
        ("head east", Go(direction="east")),
        ("go to the east", Go(direction="east")),
        ("east", Go(direction="east")),
        ("e", Go(direction="east")),
        ("north", Go(direction="north")),
        ("n", Go(direction="north")),
        ("s", Go(direction="south")),
        ("w", Go(direction="west")),
        ("up", Go(direction="up")),
        ("u", Go(direction="up")),
        ("go up", Go(direction="up")),
        ("down", Go(direction="down")),
        ("d", Go(direction="down")),
        # take / drop
        ("take rock", Take(item="rock")),
        ("get rock", Take(item="rock")),
        ("grab rock", Take(item="rock")),
        ("pick up rock", Take(item="rock")),
        ("drop rock", Drop(item="rock")),
        ("put down rock", Drop(item="rock")),
        # open
        ("open door", Open(target="door_ab")),
        # use, with and without a target
        ("use rock on statue", Use(item="rock", target="statue")),
        ("use rock with statue", Use(item="rock", target="statue")),
        ("put rock in statue", Use(item="rock", target="statue")),
        ("insert rock in statue", Use(item="rock", target="statue")),
        ("insert rock into statue", Use(item="rock", target="statue")),
        ("give rock to statue", Use(item="rock", target="statue")),
        ("use rock", Use(item="rock")),
        ("pull rock", Use(item="rock")),
        ("push rock", Use(item="rock")),
        ("press rock", Use(item="rock")),
        # inventory
        ("inventory", ShowInventory()),
        ("i", ShowInventory()),
        ("inv", ShowInventory()),
        # normalization
        ("TAKE THE ROCK!", Take(item="rock")),
        ("   take   the rock  ", Take(item="rock")),
        ("Look.", Look()),
    ],
)
def test_grammar(world: WorldState, text: str, expected: object) -> None:
    assert parse(world, text) == expected


def test_talk_phrases_resolve_the_npc(world: WorldState) -> None:
    world.player_location = "room_b"
    for text in ("talk to robot", "talk robot", "speak to robot", "ask robot"):
        assert parse(world, text) == Talk(npc="robot")


def test_resolution_by_exact_alias(world: WorldState) -> None:
    assert parse(world, "take stone") == Take(item="rock")


def test_resolution_by_token_subset(world: WorldState) -> None:
    world.items["rock"].name = "heavy grey rock"
    assert parse(world, "take rock") == Take(item="rock")
    assert parse(world, "take grey rock") == Take(item="rock")


def test_inventory_is_in_scope(world: WorldState) -> None:
    world.items["gem"].location = "inventory"
    assert parse(world, "examine gem") == Examine(target="gem")


def test_entities_elsewhere_are_out_of_scope(world: WorldState) -> None:
    error = parse(world, "talk to robot")
    assert isinstance(error, ParseError) and error.kind == "unknown_noun"


def test_ambiguous_lists_candidates(crowded: WorldState) -> None:
    error = parse(crowded, "take rock")
    assert isinstance(error, ParseError) and error.kind == "ambiguous"
    assert error.candidates is not None
    assert {c.id for c in error.candidates} == {"rock", "small_rock"}


def test_ambiguous_via_shared_alias(crowded: WorldState) -> None:
    error = parse(crowded, "take stone")
    assert isinstance(error, ParseError) and error.kind == "ambiguous"


def test_unknown_verb(world: WorldState) -> None:
    error = parse(world, "xyzzy the rock")
    assert isinstance(error, ParseError) and error.kind == "unknown_verb"
    assert error.verb == "xyzzy"


def test_unknown_noun(world: WorldState) -> None:
    error = parse(world, "take sandwich")
    assert isinstance(error, ParseError) and error.kind == "unknown_noun"
    assert error.noun == "sandwich"


def test_unknown_direction(world: WorldState) -> None:
    error = parse(world, "go sideways")
    assert isinstance(error, ParseError) and error.kind == "unknown_noun"


@pytest.mark.parametrize("text", ["take", "examine", "open", "go", "use", "talk to", "use rock on"])
def test_missing_noun(world: WorldState, text: str) -> None:
    error = parse(world, text)
    assert isinstance(error, ParseError) and error.kind == "missing_noun"
    assert error.verb


@pytest.mark.parametrize("text", ["", "   ", "..."])
def test_empty(world: WorldState, text: str) -> None:
    error = parse(world, text)
    assert isinstance(error, ParseError) and error.kind == "empty"


def test_parser_does_not_check_legality(world: WorldState) -> None:
    """The statue is not portable, but 'take statue' still parses."""
    assert parse(world, "take statue") == Take(item="statue")


# --- instrument-last phrasing (found by analysing a real playthrough log) -----


@pytest.mark.parametrize(
    "text",
    ["open the statue with the rock", "crack open the statue with the rock",
     "pry the statue with the rock", "open statue using rock"],
)
def test_opening_something_with_a_tool_is_a_use(world: WorldState, text: str) -> None:
    """'open X with Y' names the target first and the instrument second — the
    opposite order from 'use X on Y'. Getting this backwards silently produces a
    legal-but-wrong action, which is worse than failing to parse."""
    assert parse(world, text) == Use(item="rock", target="statue")


def test_opening_without_a_tool_still_opens(world: WorldState) -> None:
    assert parse(world, "open the door") == Open(target="door_ab")
    assert parse(world, "crack open the statue") == Open(target="statue")


def test_instrument_last_needs_both_nouns(world: WorldState) -> None:
    error = parse(world, "open the statue with")
    assert isinstance(error, ParseError) and error.kind == "missing_noun"


def test_a_generic_word_alone_resolves_to_nothing(world: WorldState) -> None:
    """Regression: adding the alias "glowing thing" to an item once made the bare
    word "thing" match it, so "put the thing in the thing" silently became a real
    (nonsense) action instead of reaching the player as a question."""
    world.items["gem"].location = "room_a"
    world.items["gem"].aliases.append("glowing thing")

    assert parse(world, "take the glowing thing") == Take(item="gem")

    error = parse(world, "put the thing in the thing")
    assert isinstance(error, ParseError) and error.kind == "unknown_noun"


# --- typo tolerance (every case below came from a real logged playthrough) ----


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("opne rock", Open(target="rock")),        # adjacent-swap, the common typo
        ("take teh rock", Take(item="rock")),      # typo in a filler word
        ("grabb the rock", Take(item="rock")),     # doubled letter
        ("droop the rock", Drop(item="rock")),
        ("examine statu", Examine(target="statue")),
        ("look at the statu", Examine(target="statue")),
    ],
)
def test_common_typos_are_corrected(world: WorldState, typed: str, expected: object) -> None:
    assert parse(world, typed) == expected


def test_the_typo_that_cost_a_real_player_the_puzzle(world: WorldState) -> None:
    """'open teh crate using the prybar' fell through to the language model, which
    dropped the instrument and returned Open(crate). Offline it is exact."""
    world.items["rock"].location = "inventory"
    assert parse(world, "open teh statue using the rock") == Use(item="rock", target="statue")


@pytest.mark.parametrize("typed", ["look around", "look room", "examine the room",
                                   "look at the room", "look here", "search the room"])
def test_asking_about_where_you_are(world: WorldState, typed: str) -> None:
    """From a real playthrough: `look room` in a world whose door was called a "room
    door" examined the door. These words mean the place, not a thing in it."""
    assert parse(world, typed) == Look()


@pytest.mark.parametrize("typed", ["where am i", "where are we"])
def test_asking_where_you_are(world: WorldState, typed: str) -> None:
    """From a real playthrough: `where am i` reported that the game did not know the
    word "here" — `where` had been silently corrected into it."""
    assert parse(world, typed) == Look()


def test_bare_exit_is_a_movement_verb_not_a_way_out_of_the_game(world: WorldState) -> None:
    """A real player typed `exit` three times on a roof and got a quit prompt each
    time. `exit the window` is a move, so bare `exit` asks what to exit."""
    error = parse(world, "exit")
    assert isinstance(error, ParseError) and error.kind == "missing_noun"
    assert parse(world, "exit the door") == Traverse(target="door_ab")


def test_a_short_verb_is_only_ever_fixed_by_a_swap(world: WorldState) -> None:
    """From a real playthrough: `wake X` was corrected to `take X`, and the
    player was told they could not take her. English has too many four-letter verbs
    one substitution from ours; the word the sentence turns on gets the strict rule."""
    world.npcs["robot"].location = "room_a"
    assert parse(world, "wake the robot") == Talk(npc="robot")     # a verb we now know
    for typed in ["bake the rock", "rake the rock", "cook the rock"]:
        error = parse(world, typed)
        assert isinstance(error, ParseError) and error.kind == "unknown_verb", typed
    assert parse(world, "opne rock") == Open(target="rock")        # a swap still works


def test_a_word_we_already_know_is_never_altered(world: WorldState) -> None:
    """The safety rule. 'gem' and 'get' are one edit apart; correcting known words
    would make the parser unpredictable in exactly the places it must not be."""
    world.items["gem"].location = "room_a"
    assert parse(world, "take gem") == Take(item="gem")
    assert parse(world, "get gem") == Take(item="gem")
    assert parse(world, "get rock") == Take(item="rock")


def test_short_words_get_no_slack(world: WorldState) -> None:
    """Two-letter and three-letter words are too close together to guess between."""
    error = parse(world, "ro")
    assert isinstance(error, ParseError)


def test_an_ambiguous_typo_is_left_alone(world: WorldState) -> None:
    """Equidistant from two known words means we explain instead of guessing."""
    world.items["small_rock"] = Item(
        id="small_rock", name="sock", aliases=[], description="A sock.", location="room_a"
    )
    # "rock" and "sock" are both one edit from "lock"; neither wins.
    error = parse(world, "take lock")
    assert isinstance(error, ParseError) and error.kind == "unknown_noun"


def test_genuine_unknown_verbs_still_fail(world: WorldState) -> None:
    """Typo tolerance must not turn a vocabulary gap into a wrong guess. These are
    real inputs a player used; they belong to the language assistant, not the parser."""
    for text in ["yoink the rock", "yeet the rock", "how do i open this"]:
        error = parse(world, text)
        assert isinstance(error, ParseError), f"{text!r} should not have parsed"


@pytest.mark.parametrize(
    ("typed", "equally_close_to"),
    [
        ("go eest", "east and west"),
        ("taek the rock", "take and talk"),
        ("tak rock", "take and talk"),
    ],
)
def test_a_typo_between_two_known_words_is_never_guessed(
    world: WorldState, typed: str, equally_close_to: str
) -> None:
    """The safety property that matters most.

    'eest' sits one edit from both 'east' and 'west'. Walking a player the wrong
    way — or talking to something they meant to take — is far worse than admitting
    we did not understand, so a tie means no correction. These inputs fall through
    to the language assistant, which has the context to ask.
    """
    result = parse(world, typed)
    assert isinstance(result, ParseError), (
        f"{typed!r} is equally close to {equally_close_to}; it must not be guessed"
    )


def test_unambiguous_directions_still_correct(world: WorldState) -> None:
    """Note how few direction typos are safe to fix: 'est' is one edit from both
    'east' and 'west', so only the unambiguous ones get corrected."""
    assert parse(world, "go nrth") == Go(direction="north")
    assert parse(world, "go doen") == Go(direction="down")


# --- navigating by destination (players think in places, not bearings) -------


@pytest.fixture
def ship() -> WorldState:
    from adventure.loader import load_world
    return load_world(Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json")


def walk(world: WorldState, *lines: str) -> None:
    from adventure import engine
    for line in lines:
        engine.apply(world, parse(world, line))


def test_you_cannot_route_through_ground_you_have_not_walked(ship: WorldState) -> None:
    """At turn one the cargo bay is two rooms away through a corridor you have
    never been down. Knowing the name is not knowing the way."""
    error = parse(ship, "go to the cargo bay")
    assert isinstance(error, ParseError) and error.kind == "no_route"


def test_you_can_set_off_for_a_room_you_have_only_heard_of(ship: WorldState) -> None:
    """The destination may be unvisited, as long as the route to it is known."""
    walk(ship, "go east")                       # now standing in the corridor
    assert parse(ship, "go to the cargo bay") == Go(direction="east")


def test_it_takes_one_step_not_the_whole_journey(ship: WorldState) -> None:
    """Walking room by room keeps every door, description and event intact."""
    walk(ship, "go east", "go east", "go west", "go south")   # in the engine room
    assert parse(ship, "go to the crew quarters") == Go(direction="north")
    walk(ship, "go north")                                     # one room closer
    assert parse(ship, "go to the crew quarters") == Go(direction="west")


def test_the_shortest_known_route_wins(ship: WorldState) -> None:
    walk(ship, "go east", "go south")                          # engine room
    assert parse(ship, "go to the cargo bay") == Go(direction="north")


def test_go_back_returns_the_way_you_came(ship: WorldState) -> None:
    walk(ship, "go east")
    assert parse(ship, "go back") == Go(direction="west")
    walk(ship, "go south")
    assert parse(ship, "go back") == Go(direction="north")


def test_go_back_at_the_start_has_nowhere_to_go(ship: WorldState) -> None:
    error = parse(ship, "go back")
    assert isinstance(error, ParseError) and error.kind == "no_route"


def test_routing_does_not_open_doors_for_you(ship: WorldState) -> None:
    """The parser proposes a step; the engine still rules on the shut door."""
    from adventure import engine
    walk(ship, "go east")
    action = parse(ship, "go to the escape pod bay")
    assert action == Go(direction="north")
    (event,) = engine.apply(ship, action)
    assert event.type == "action_failed" and event.reason.value == "door_closed"


def test_visited_rooms_are_remembered_across_a_save(ship: WorldState, tmp_path: Path) -> None:
    from adventure.persistence import load_game, save_game
    walk(ship, "go east", "go east")
    save_game(ship, tmp_path, "midway")
    restored = load_game(tmp_path, "midway")
    assert restored.visited == ["crew_quarters", "corridor", "cargo_bay"]
    assert parse(restored, "go to the crew quarters") == Go(direction="west")


# --- referring to things that are not in front of you ------------------------


def test_you_are_told_where_you_left_something(ship: WorldState) -> None:
    """"I don't see any 'prybar' here" is unhelpful when the player knows perfectly
    well it exists and merely put it down two rooms ago."""
    walk(ship, "go east", "go south", "take prybar", "go north", "drop prybar", "go south")
    error = parse(ship, "use the prybar")
    assert isinstance(error, ParseError) and error.kind == "elsewhere"
    assert error.noun == "prybar" and error.place == "Main Corridor"


def test_the_advisory_covers_npcs_too(ship: WorldState) -> None:
    walk(ship, "go east", "go east", "go west")
    error = parse(ship, "talk to the droid")
    assert isinstance(error, ParseError) and error.place == "Cargo Bay"


def test_it_never_tells_you_about_rooms_you_have_not_walked(ship: WorldState) -> None:
    error = parse(ship, "take the prybar")
    assert isinstance(error, ParseError) and error.kind == "unknown_noun"


def test_it_never_gives_away_a_hidden_item(ship: WorldState) -> None:
    """The power cell is inside the unopened crate. Telling the player where it is
    would hand them the puzzle."""
    walk(ship, "go east", "go east")
    error = parse(ship, "take the power cell")
    assert isinstance(error, ParseError) and error.kind == "unknown_noun"


# --- doors are places you go through, not tools ------------------------------


def test_using_a_door_means_opening_it(ship: WorldState) -> None:
    walk(ship, "go east")
    assert parse(ship, "use the door") == Open(target="pod_door")
    assert parse(ship, "use pod") == Open(target="pod_door")


def test_entering_a_door_means_going_through_it(ship: WorldState) -> None:
    """In the corridor the pod bay door answers to 'pod', so 'get in the pod' would
    otherwise resolve to a doorway. Nobody climbs into a door."""
    walk(ship, "go east")
    for phrase in ["enter the pod", "get in the pod", "board the pod", "climb into the pod"]:
        assert parse(ship, phrase) == Traverse(target="pod_door"), phrase


def test_every_way_of_saying_through_lands_on_the_same_action(ship: WorldState) -> None:
    """The split this replaced: 'get in the pod' travelled while 'go through the
    door' was answered by world content, and 'go out the door' was not understood
    at all. They are one request — the player named the way through."""
    walk(ship, "go east")
    for phrase in ["go through the door", "go out the door", "jump through the door",
                   "climb out the door", "exit the door", "squeeze through the door"]:
        assert parse(ship, phrase) == Traverse(target="pod_door"), phrase


def test_entering_a_place_you_have_only_heard_of_sets_off_toward_it(ship: WorldState) -> None:
    """A room name is routing, not a portal: one step along the known way, as Go."""
    walk(ship, "go east")
    assert parse(ship, "climb into the escape pod") == Go(direction="north")


def test_entering_something_in_this_room_just_uses_it(ship: WorldState) -> None:
    walk(ship, "go east", "go south")
    assert parse(ship, "enter the reactor") == Use(item="reactor")


def test_use_never_walks_you_anywhere(ship: WorldState) -> None:
    """Deliberate asymmetry: 'enter' implies travel, 'use' implies handling. A
    'use' that quietly marched the player across the ship would hide mistakes."""
    walk(ship, "go east", "go south", "take prybar", "go north", "drop prybar", "go south")
    result = parse(ship, "use the prybar")
    assert isinstance(result, ParseError)
    assert not isinstance(result, Go)
