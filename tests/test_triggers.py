"""Counters, triggers, and endings: the primitives a timed world is built from.

Interactions and dialogue answer what the player aimed at something. A trigger
answers where the player is standing and what the world has been keeping count of,
so these tests are about ordering and reach: which rule sees which state, and how
far a countdown can follow you.
"""

from pathlib import Path

import pytest

from adventure import engine, queries
from adventure.actions import Go, Look, Talk, Use
from adventure.events import ActionFailed, GameEnded, Narrated, Reason
from adventure.loader import WorldValidationError, load_world, validate_world
from adventure.models import CounterCondition, Effect, Rule, Trigger, WorldState

TINY = Path(__file__).parent / "fixtures" / "tiny_world.json"


@pytest.fixture
def world() -> WorldState:
    return load_world(TINY)


def tick(counter: str = "heat", delta: int = 1) -> Effect:
    return Effect(type="adjust_counter", counter=counter, delta=delta)


def ending(epilogue: str = "It ends.", outcome: str = "loss") -> Effect:
    return Effect(type="end_game", outcome=outcome, epilogue=epilogue)


def trigger(id_: str, **kwargs) -> Trigger:
    kwargs.setdefault("text", f"[{id_}]")
    return Trigger(id=id_, **kwargs)


def open_door(world: WorldState) -> None:
    world.doors["door_ab"].open = True


def reveal_gem(world: WorldState) -> None:
    """The gem starts hidden; cracking the statue puts it in room_a, where `use gem`
    can reach it. Several tests below borrow that interaction as a trigger pull."""
    engine.apply(world, Use(item="rock", target="statue"))


# --- counters -----------------------------------------------------------------


def test_an_unread_counter_is_zero(world: WorldState) -> None:
    assert queries.counters_match(world, {"heat": CounterCondition(at_most=0)})
    assert not queries.counters_match(world, {"heat": CounterCondition(at_least=1)})


def test_bounds_are_inclusive(world: WorldState) -> None:
    world.counters["heat"] = 3
    assert queries.counters_match(world, {"heat": CounterCondition(at_least=3)})
    assert queries.counters_match(world, {"heat": CounterCondition(at_most=3)})
    assert not queries.counters_match(world, {"heat": CounterCondition(at_least=4)})


def test_adjust_counter_accumulates_and_goes_both_ways(world: WorldState) -> None:
    reveal_gem(world)
    world.interactions[1].effects = [tick(), tick(), tick(delta=-2)]
    engine.apply(world, Use(item="gem"))
    assert world.counters["heat"] == 0


def test_a_counter_gates_an_interaction(world: WorldState) -> None:
    reveal_gem(world)
    world.interactions[1].requires_counters = {"heat": CounterCondition(at_least=1)}
    (blocked,) = engine.apply(world, Use(item="gem"))
    assert isinstance(blocked, ActionFailed) and blocked.reason is Reason.NOTHING_HAPPENS
    world.counters["heat"] = 1
    assert engine.apply(world, Use(item="gem"))[0].type == "item_used"


# --- when a trigger looks --------------------------------------------------


def test_an_enter_trigger_ignores_a_turn_spent_standing_still(world: WorldState) -> None:
    world.triggers = [trigger("arrival", rooms=["room_b"])]
    open_door(world)
    events = engine.apply(world, Go(direction="east"))
    assert [e for e in events if isinstance(e, Narrated)]
    assert not [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]


def test_a_turn_trigger_fires_on_any_counted_action(world: WorldState) -> None:
    world.triggers = [trigger("clock", when="turn")]
    assert [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]


def test_no_trigger_fires_on_a_turn_that_did_not_count(world: WorldState) -> None:
    world.triggers = [trigger("clock", when="turn")]
    (failure,) = engine.apply(world, Go(direction="north"))
    assert isinstance(failure, ActionFailed)


def test_a_trigger_stays_in_its_rooms(world: WorldState) -> None:
    world.triggers = [trigger("only_b", when="turn", rooms=["room_b"])]
    assert not [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    open_door(world)
    engine.apply(world, Go(direction="east"))
    assert [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]


def test_a_roomless_trigger_fires_anywhere(world: WorldState) -> None:
    world.triggers = [trigger("everywhere", when="turn")]
    open_door(world)
    for action in (Look(), Go(direction="east"), Look()):
        assert [e for e in engine.apply(world, action) if isinstance(e, Narrated)]


def test_once_means_once(world: WorldState) -> None:
    world.triggers = [trigger("first_time", when="turn", once=True)]
    assert [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    assert not [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]


def test_a_silent_trigger_still_fires(world: WorldState) -> None:
    world.triggers = [Trigger(id="quiet", when="turn", text="", effects=[tick()])]
    events = engine.apply(world, Look())
    assert not [e for e in events if isinstance(e, Narrated)]
    assert world.counters["heat"] == 1


# --- the cascade --------------------------------------------------------------


def test_every_matching_trigger_fires_not_just_the_first(world: WorldState) -> None:
    world.triggers = [trigger("one", when="turn"), trigger("two", when="turn")]
    fired = [e.trigger for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    assert fired == ["one", "two"]


def test_a_trigger_can_arm_a_later_one_in_the_same_turn(world: WorldState) -> None:
    """The whole reason the cascade is not first-match-wins: the step that spends
    the last of a countdown has to be judged in the turn it was spent."""
    world.counters["heat"] = 2
    world.triggers = [
        trigger("raise", when="turn", effects=[tick()]),
        trigger("read", when="turn", requires_counters={"heat": CounterCondition(at_least=3)}),
    ]
    fired = [e.trigger for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    assert fired == ["raise", "read"]


def test_the_same_two_triggers_in_the_other_order_miss_each_other(world: WorldState) -> None:
    world.counters["heat"] = 2
    world.triggers = [
        trigger("read", when="turn", requires_counters={"heat": CounterCondition(at_least=3)}),
        trigger("raise", when="turn", effects=[tick()]),
    ]
    fired = [e.trigger for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    assert fired == ["raise"]


def test_an_ending_stops_the_cascade(world: WorldState) -> None:
    world.triggers = [
        trigger("last_word", when="turn", effects=[ending()]),
        trigger("too_late", when="turn"),
    ]
    fired = [e.trigger for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    assert fired == ["last_word"]


def test_a_trigger_that_moves_the_player_describes_where_they_land(world: WorldState) -> None:
    world.triggers = [trigger("thrown", when="turn", once=True,
                              effects=[Effect(type="move_player", to="room_b")])]
    events = engine.apply(world, Look())
    assert world.player_location == "room_b"
    assert [e for e in events if e.type == "room_described" and e.room.id == "room_b"]


# --- endings ------------------------------------------------------------------


def test_a_loss_ends_the_game_without_winning_it(world: WorldState) -> None:
    world.triggers = [trigger("doom", when="turn", effects=[ending("The lights go out.")])]
    events = engine.apply(world, Look())
    ended = next(e for e in events if isinstance(e, GameEnded))
    assert ended.outcome == "loss" and ended.epilogue == "The lights go out."
    assert world.ended is True and world.won is False


def test_nothing_works_after_an_ending(world: WorldState) -> None:
    world.triggers = [trigger("doom", when="turn", effects=[ending()])]
    engine.apply(world, Look())
    (failure,) = engine.apply(world, Look())
    assert isinstance(failure, ActionFailed) and failure.reason is Reason.GAME_OVER


def test_win_game_still_means_what_it_always_did(world: WorldState) -> None:
    """The Wayfarer's spelling, kept working: a win, using the world-wide epilogue."""
    reveal_gem(world)
    world.interactions[1].effects = [Effect(type="win_game")]
    events = engine.apply(world, Use(item="gem"))
    ended = next(e for e in events if isinstance(e, GameEnded))
    assert ended.outcome == "win" and ended.epilogue == world.win_epilogue
    assert world.won is True and world.ended is True


def test_a_world_may_name_its_own_banner(world: WorldState) -> None:
    reveal_gem(world)
    world.interactions[1].effects = [
        Effect(type="end_game", outcome="win", epilogue="You fall.", banner="*** LATER ***")
    ]
    ended = next(e for e in engine.apply(world, Use(item="gem")) if isinstance(e, GameEnded))
    assert ended.banner == "*** LATER ***"


# --- companions ---------------------------------------------------------------


def test_a_follower_walks_with_the_player(world: WorldState) -> None:
    world.npcs["robot"].location = "room_a"
    world.npcs["robot"].follows_player = True
    open_door(world)
    engine.apply(world, Go(direction="east"))
    assert world.npcs["robot"].location == "room_b"


def test_a_follower_left_behind_stays_behind(world: WorldState) -> None:
    """Following means walking with you, not teleporting to you."""
    world.npcs["robot"].follows_player = True     # already in room_b, player in room_a
    open_door(world)
    engine.apply(world, Go(direction="east"))     # player arrives where it already was
    engine.apply(world, Go(direction="west"))
    assert world.npcs["robot"].location == "room_a", "it was with us, so it comes back"


def test_an_effect_that_moves_the_player_takes_followers_too(world: WorldState) -> None:
    reveal_gem(world)
    world.npcs["robot"].location = "room_a"
    world.npcs["robot"].follows_player = True
    world.interactions[1].effects = [Effect(type="move_player", to="room_b")]
    engine.apply(world, Use(item="gem"))
    assert world.npcs["robot"].location == "room_b"


# --- use, on anything you can point at ----------------------------------------


def test_a_door_can_be_the_subject_of_an_interaction(world: WorldState) -> None:
    world.interactions[1].item_id = "door_ab"
    world.interactions[1].target_id = None
    world.interactions[1].message = "You press your ear to the door."
    used = engine.apply(world, Use(item="door_ab"))[0]
    assert used.type == "item_used" and used.item.id == "door_ab"


def test_a_person_can_be_the_subject_of_an_interaction(world: WorldState) -> None:
    open_door(world)
    engine.apply(world, Go(direction="east"))
    world.interactions[1].item_id = "robot"
    world.interactions[1].message = "You tap the robot on the head."
    assert engine.apply(world, Use(item="robot"))[0].type == "item_used"


def test_using_something_that_is_not_here_still_fails(world: WorldState) -> None:
    (failure,) = engine.apply(world, Use(item="robot"))     # robot is in room_b
    assert isinstance(failure, ActionFailed) and failure.reason is Reason.NOT_PRESENT


# --- door state as a condition ------------------------------------------------


def test_a_rule_can_require_a_door_to_be_open(world: WorldState) -> None:
    reveal_gem(world)
    world.interactions[1].requires_doors = {"door_ab": True}
    (blocked,) = engine.apply(world, Use(item="gem"))
    assert isinstance(blocked, ActionFailed) and blocked.reason is Reason.NOTHING_HAPPENS
    open_door(world)
    assert engine.apply(world, Use(item="gem"))[0].type == "item_used"


def test_door_state_gates_dialogue_and_triggers_the_same_way(world: WorldState) -> None:
    world.triggers = [trigger("shut_only", when="turn", requires_doors={"door_ab": False})]
    assert [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    open_door(world)
    assert not [e for e in engine.apply(world, Look()) if isinstance(e, Narrated)]
    world.npcs["robot"].dialogue[1].requires_doors = {"door_ab": False}
    engine.apply(world, Go(direction="east"))
    engine.apply(world, Talk(npc="robot"))                  # rule 0, the greeting
    (failure,) = engine.apply(world, Talk(npc="robot"))     # rule 1 is now gated out
    assert isinstance(failure, ActionFailed) and failure.reason is Reason.NOTHING_HAPPENS


# --- where the player is standing, as a guard ---------------------------------


def test_a_dialogue_rule_can_be_scoped_to_a_room(world: WorldState) -> None:
    world.npcs["robot"].follows_player = True
    world.npcs["robot"].location = "room_a"
    world.npcs["robot"].dialogue.insert(0, Rule(rooms=["room_b"], text="Different in here."))
    assert engine.apply(world, Talk(npc="robot"))[0].text != "Different in here."
    open_door(world)
    engine.apply(world, Go(direction="east"))
    assert engine.apply(world, Talk(npc="robot"))[0].text == "Different in here."


def test_a_listening_rule_can_be_scoped_to_one_side_of_a_door(world: WorldState) -> None:
    from adventure.actions import Listen
    world.doors["door_ab"].listening = [
        Rule(rooms=["room_a"], text="From this side."),
        Rule(rooms=["room_b"], text="From the other side."),
    ]
    assert engine.apply(world, Listen(target="door_ab"))[0].text == "From this side."
    open_door(world)
    engine.apply(world, Go(direction="east"))
    assert engine.apply(world, Listen(target="door_ab"))[0].text == "From the other side."


def test_an_unscoped_rule_still_fires_anywhere(world: WorldState) -> None:
    from adventure.actions import Listen
    world.doors["door_ab"].listening = [Rule(text="Both sides.")]
    assert engine.apply(world, Listen(target="door_ab"))[0].text == "Both sides."
    open_door(world)
    engine.apply(world, Go(direction="east"))
    assert engine.apply(world, Listen(target="door_ab"))[0].text == "Both sides."


# --- what the loader refuses --------------------------------------------------


@pytest.mark.parametrize(("mutate", "fragment"), [
    (lambda w: w.triggers.append(trigger("dup")) or w.triggers.append(trigger("dup")),
     "duplicate trigger id 'dup'"),
    (lambda w: w.triggers.append(trigger("nowhere", rooms=["room_z"])),
     "which is not a room id"),
    (lambda w: w.triggers.append(Trigger(id="mute", text="", effects=[])),
     "neither text nor effects"),
    (lambda w: w.triggers.append(trigger(
        "impossible", requires_counters={"heat": CounterCondition(at_least=5, at_most=2)})),
     "which nothing can satisfy"),
    (lambda w: w.triggers.append(trigger("empty_range", requires_counters={"heat": CounterCondition()})),
     "neither 'at_least' nor 'at_most'"),
    (lambda w: w.triggers.append(trigger("bad_door", requires_doors={"door_zz": True})),
     "requires_doors names 'door_zz'"),
    (lambda w: w.npcs["robot"].dialogue.append(Rule(rooms=["room_z"], text="Hi.")),
     "rooms names 'room_z'"),
    (lambda w: w.triggers.append(trigger("no_outcome", effects=[Effect(type="end_game")])),
     "end_game requires 'outcome'"),
    (lambda w: w.triggers.append(trigger(
        "silent_death", effects=[Effect(type="end_game", outcome="loss")])),
     "needs its own 'epilogue'"),
    (lambda w: w.triggers.append(trigger("half_counter", effects=[Effect(type="adjust_counter", counter="heat")])),
     "adjust_counter requires 'counter' and 'delta'"),
    (lambda w: w.triggers.append(trigger("nobody", effects=[Effect(type="move_npc", npc_id="ghost", to="room_a")])),
     "which is not an npc id"),
    (lambda w: w.triggers.append(trigger("elsewhere", effects=[Effect(type="move_player", to="room_z")])),
     "move_player destination 'room_z'"),
])
def test_the_loader_names_what_is_wrong(world: WorldState, mutate, fragment: str) -> None:
    mutate(world)
    with pytest.raises(WorldValidationError) as excinfo:
        validate_world(world)
    assert fragment in str(excinfo.value)


def test_an_interaction_may_now_name_a_door_or_a_person(world: WorldState) -> None:
    world.interactions[1].item_id = "door_ab"
    validate_world(world)
    world.interactions[1].item_id = "robot"
    validate_world(world)
    world.interactions[1].item_id = "nothing_at_all"
    with pytest.raises(WorldValidationError, match="not an item, npc, or door id"):
        validate_world(world)


# --- going through a named portal ---------------------------------------------


def test_traverse_opens_a_shut_but_unlocked_door_on_the_way(world: WorldState) -> None:
    from adventure.actions import Traverse
    events = engine.apply(world, Traverse(target="door_ab"))
    assert [e.type for e in events][:2] == ["door_opened", "moved"]
    assert world.doors["door_ab"].open is True
    assert world.player_location == "room_b"


def test_plain_movement_still_refuses_a_shut_door(world: WorldState) -> None:
    """Naming the portal is a bigger request than naming a bearing, and only the
    bigger one opens things. `go east` keeps the beat it always had."""
    (failure,) = engine.apply(world, Go(direction="east"))
    assert isinstance(failure, ActionFailed) and failure.reason is Reason.DOOR_CLOSED
    assert world.doors["door_ab"].open is False


def test_traverse_refuses_a_locked_door_in_the_world_s_own_words(world: WorldState) -> None:
    from adventure.actions import Traverse
    world.doors["door_ab"].locked = True
    world.doors["door_ab"].locked_message = "The bolt is thrown from the far side."
    (failure,) = engine.apply(world, Traverse(target="door_ab"))
    assert failure.reason is Reason.DOOR_LOCKED
    assert failure.message == "The bolt is thrown from the far side."
    assert world.player_location == "room_a"


def test_traverse_unlocks_once_its_flag_is_set(world: WorldState) -> None:
    from adventure.actions import Traverse
    world.doors["door_ab"].locked = True
    world.doors["door_ab"].unlock_flag = "have_key"
    world.flags["have_key"] = True
    engine.apply(world, Traverse(target="door_ab"))
    assert world.player_location == "room_b"
    assert world.doors["door_ab"].locked is False


def test_traverse_a_door_that_is_not_on_an_exit_from_here(world: WorldState) -> None:
    from adventure.actions import Traverse
    open_door(world)
    engine.apply(world, Go(direction="east"))
    world.rooms["room_b"].exits.clear()
    (failure,) = engine.apply(world, Traverse(target="door_ab"))
    assert failure.reason is Reason.NOT_PRESENT


def test_a_door_and_an_exit_can_each_say_their_piece(world: WorldState) -> None:
    from adventure.actions import Traverse
    world.doors["door_ab"].open_message = "The door swings wide on a dead hinge."
    world.rooms["room_a"].exits["east"].pass_message = "You step over the sill."
    opened, moved, *_ = engine.apply(world, Traverse(target="door_ab"))
    assert opened.message == "The door swings wide on a dead hinge."
    assert moved.message == "You step over the sill."
    assert moved.through is not None and moved.through.id == "door_ab"


def test_an_exit_narrates_plain_movement_too(world: WorldState) -> None:
    world.rooms["room_a"].exits["east"].pass_message = "You step over the sill."
    open_door(world)
    moved, *_ = engine.apply(world, Go(direction="east"))
    assert moved.message == "You step over the sill."
