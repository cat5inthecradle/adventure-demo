"""T1 acceptance: the data contracts round-trip and the discriminated unions discriminate."""

import pytest
from pydantic import TypeAdapter, ValidationError

from adventure.actions import ACTION_ADAPTER, Go
from adventure.events import ActionFailed, Event, Reason
from adventure.models import Room, WorldState

EVENT_ADAPTER: TypeAdapter[Event] = TypeAdapter(Event)


def _minimal_world() -> WorldState:
    return WorldState(
        title="Test",
        intro="An intro.",
        win_epilogue="An epilogue.",
        player_location="room_a",
        rooms={"room_a": Room(id="room_a", name="Room A", description="A bare room.")},
    )


def test_world_state_round_trips() -> None:
    world = _minimal_world()
    assert WorldState.model_validate_json(world.model_dump_json()) == world


def test_action_adapter_parses_go() -> None:
    action = ACTION_ADAPTER.validate_python({"type": "go", "direction": "east"})
    assert isinstance(action, Go)
    assert action.direction == "east"


def test_action_adapter_rejects_bad_direction() -> None:
    with pytest.raises(ValidationError):
        ACTION_ADAPTER.validate_python({"type": "go", "direction": "sideways"})


def test_event_adapter_parses_action_failed() -> None:
    event = EVENT_ADAPTER.validate_python({"type": "action_failed", "reason": "no_exit"})
    assert isinstance(event, ActionFailed)
    assert event.reason is Reason.NO_EXIT
