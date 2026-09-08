"""T10 acceptance: the language layer only ever sees what the player can see."""

from pathlib import Path

import pytest

from adventure.actions import Examine, Go, Look, ShowInventory, Take, Talk, Use
from adventure.loader import load_world
from adventure.models import WorldState
from adventure.nlu import (
    FakeNLU,
    NLUClarification,
    NLUResolution,
    build_context,
    validate_resolution,
)
from adventure.parser import parse
from adventure import engine

WAYFARER = Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json"

FIRST_SEVEN = [
    "go east", "go south", "take prybar", "go north", "go east",
    "use prybar on crate", "take power cell",
]


@pytest.fixture
def world() -> WorldState:
    return load_world(WAYFARER)


def advance(world: WorldState, lines: list[str]) -> None:
    for line in lines:
        engine.apply(world, parse(world, line))


# --- build_context -----------------------------------------------------------


def test_context_shows_only_the_current_room(world: WorldState) -> None:
    context = build_context(world)
    assert context.room_name == "Crew Quarters"
    assert context.exits == ["east"]
    assert [e.id for e in context.visible] == ["emergency_manual"]
    assert context.inventory == []
    assert context.legal_action_types[0] == "look"


def test_context_hides_everything_elsewhere(world: WorldState) -> None:
    ids = build_context(world).entity_ids()
    for elsewhere in ("prybar", "reactor", "supply_crate", "maintenance_droid", "pod_door"):
        assert elsewhere not in ids


def test_context_never_reveals_hidden_items(world: WorldState) -> None:
    advance(world, ["go east", "go east"])
    assert "power_cell" not in build_context(world).entity_ids()


def test_context_lists_carried_items_separately(world: WorldState) -> None:
    advance(world, FIRST_SEVEN)
    context = build_context(world)
    assert [e.id for e in context.inventory] == ["prybar", "power_cell"]
    assert [e.id for e in context.visible] == ["supply_crate", "maintenance_droid"]
    assert "power_cell" in context.entity_ids()


def test_context_carries_aliases_and_kinds(world: WorldState) -> None:
    advance(world, ["go east", "go east"])
    by_id = {e.id: e for e in build_context(world).visible}
    assert by_id["maintenance_droid"].kind == "npc"
    assert "r-6" in by_id["maintenance_droid"].aliases
    assert by_id["supply_crate"].kind == "item"


def test_context_uses_the_alt_room_description(world: WorldState) -> None:
    advance(world, ["go east"])
    assert "emergency glow" in build_context(world).room_description
    world.flags["power_restored"] = True
    assert "White light" in build_context(world).room_description


def test_doors_appear_as_visible_entities(world: WorldState) -> None:
    advance(world, ["go east"])
    by_id = {e.id: e for e in build_context(world).visible}
    assert by_id["pod_door"].kind == "door"


# --- validate_resolution -----------------------------------------------------


def test_rejects_an_item_in_another_room(world: WorldState) -> None:
    context = build_context(world)
    assert validate_resolution(context, Take(item="prybar")) is None
    assert validate_resolution(context, Examine(target="reactor")) is None
    assert validate_resolution(context, Talk(npc="maintenance_droid")) is None


def test_rejects_a_direction_that_is_not_an_exit(world: WorldState) -> None:
    context = build_context(world)
    assert validate_resolution(context, Go(direction="north")) is None
    assert validate_resolution(context, Go(direction="east")) == Go(direction="east")


def test_rejects_invented_ids(world: WorldState) -> None:
    context = build_context(world)
    assert validate_resolution(context, Take(item="sandwich")) is None
    assert validate_resolution(context, Use(item="emergency_manual", target="airlock")) is None


def test_accepts_a_legal_use(world: WorldState) -> None:
    advance(world, FIRST_SEVEN)
    context = build_context(world)
    action = Use(item="power_cell", target="maintenance_droid")
    assert validate_resolution(context, action) == action


def test_context_free_actions_always_pass(world: WorldState) -> None:
    context = build_context(world)
    assert validate_resolution(context, Look()) == Look()
    assert validate_resolution(context, ShowInventory()) == ShowInventory()


def test_validation_does_not_check_legality(world: WorldState) -> None:
    """A visible-but-illegal action passes here; the engine is what rejects it."""
    advance(world, ["go east"])
    context = build_context(world)
    action = Take(item="status_console")   # visible, but not portable
    assert validate_resolution(context, action) == action
    (event,) = engine.apply(world, action)
    assert event.type == "action_failed"


# --- FakeNLU -----------------------------------------------------------------


def test_fake_nlu_returns_canned_results(world: WorldState) -> None:
    context = build_context(world)
    canned = NLUResolution(action=Look())
    provider = FakeNLU({"what's around me?": canned})
    assert provider.resolve("what's around me?", context, []) == canned


def test_fake_nlu_falls_back_to_a_clarification(world: WorldState) -> None:
    provider = FakeNLU({})
    result = provider.resolve("mumble", build_context(world), [])
    assert isinstance(result, NLUClarification)


# --- AnthropicNLU (T11) — no network: the client is a mock -------------------

from unittest.mock import MagicMock  # noqa: E402

import anthropic  # noqa: E402

from adventure.actions import Drop, Open  # noqa: E402
from adventure.nlu import (  # noqa: E402
    AnthropicNLU,
    CLARIFY_FALLBACK,
    DEFAULT_MODEL,
    NLUUnavailable,
    NLUWireResponse,
)


def mock_client(parsed: NLUWireResponse | None = None, raises: Exception | None = None) -> MagicMock:
    """A stand-in for anthropic.Anthropic that returns exactly one parsed response."""
    client = MagicMock()
    if raises is not None:
        client.messages.parse.side_effect = raises
    else:
        client.messages.parse.return_value = MagicMock(parsed_output=parsed)
    return client


def resolve_with(world: WorldState, wire: NLUWireResponse | None, **kwargs):
    provider = AnthropicNLU(client=mock_client(wire, **kwargs))
    return provider.resolve("do the thing", build_context(world), [])


@pytest.mark.parametrize(
    ("wire", "expected"),
    [
        (NLUWireResponse(result="action", action_type="look"), Look()),
        (NLUWireResponse(result="action", action_type="inventory"), ShowInventory()),
        (NLUWireResponse(result="action", action_type="go", direction="east"),
         Go(direction="east")),
        (NLUWireResponse(result="action", action_type="take", entity_id="emergency_manual"),
         Take(item="emergency_manual")),
        (NLUWireResponse(result="action", action_type="examine", entity_id="emergency_manual"),
         Examine(target="emergency_manual")),
        (NLUWireResponse(result="action", action_type="use", entity_id="emergency_manual"),
         Use(item="emergency_manual")),
    ],
)
def test_wire_responses_become_actions(world: WorldState, wire, expected) -> None:
    result = resolve_with(world, wire)
    assert isinstance(result, NLUResolution)
    assert result.action == expected


def test_use_with_a_target(world: WorldState) -> None:
    advance(world, FIRST_SEVEN)
    provider = AnthropicNLU(
        client=mock_client(
            NLUWireResponse(
                result="action", action_type="use",
                entity_id="power_cell", target_id="maintenance_droid",
            )
        )
    )
    result = provider.resolve("stick it in the robot", build_context(world), [])
    assert isinstance(result, NLUResolution)
    assert result.action == Use(item="power_cell", target="maintenance_droid")


def test_clarify_passes_the_question_through(world: WorldState) -> None:
    wire = NLUWireResponse(result="clarify", question="The manual or the bunk?")
    result = resolve_with(world, wire)
    assert isinstance(result, NLUClarification)
    assert result.question == "The manual or the bunk?"


def test_clarify_without_a_question_still_asks_something(world: WorldState) -> None:
    result = resolve_with(world, NLUWireResponse(result="clarify"))
    assert isinstance(result, NLUClarification) and result.question


@pytest.mark.parametrize(
    "wire",
    [
        # an id that exists in the world, but not in this room
        NLUWireResponse(result="action", action_type="take", entity_id="prybar"),
        # an id that exists nowhere at all
        NLUWireResponse(result="action", action_type="take", entity_id="phaser"),
        # a direction that is not an exit here
        NLUWireResponse(result="action", action_type="go", direction="north"),
        # required fields missing
        NLUWireResponse(result="action", action_type="take"),
        NLUWireResponse(result="action", action_type="go"),
        NLUWireResponse(result="action"),
    ],
    ids=["elsewhere", "invented", "not-an-exit", "no-entity", "no-direction", "no-action-type"],
)
def test_unusable_actions_degrade_to_a_clarification(world: WorldState, wire) -> None:
    result = resolve_with(world, wire)
    assert isinstance(result, NLUClarification)
    assert result.question == CLARIFY_FALLBACK


def test_no_structured_output_is_unavailable(world: WorldState) -> None:
    result = resolve_with(world, None)
    assert isinstance(result, NLUUnavailable)


def test_connection_errors_are_unavailable_not_exceptions(world: WorldState) -> None:
    result = resolve_with(world, None, raises=anthropic.APIConnectionError(request=None))
    assert isinstance(result, NLUUnavailable)
    assert "Connection" in result.detail


def test_unexpected_errors_are_also_contained(world: WorldState) -> None:
    result = resolve_with(world, None, raises=RuntimeError("something odd"))
    assert isinstance(result, NLUUnavailable) and "something odd" in result.detail


def test_the_request_carries_the_utterance_and_the_visible_ids(world: WorldState) -> None:
    advance(world, ["go east", "go east"])
    client = mock_client(NLUWireResponse(result="action", action_type="look"))
    provider = AnthropicNLU(client=client)
    provider.resolve(
        "what is that thing over there?",
        build_context(world),
        [("look", "== Cargo Bay ==")],
    )

    kwargs = client.messages.parse.call_args.kwargs
    sent = kwargs["messages"][0]["content"]
    assert kwargs["model"] == DEFAULT_MODEL
    assert kwargs["output_format"] is NLUWireResponse
    assert "what is that thing over there?" in sent
    assert "supply_crate" in sent and "maintenance_droid" in sent
    assert "r-6" in sent                      # aliases go too
    assert "== Cargo Bay ==" in sent          # recent transcript
    assert "prybar" not in sent               # left behind in the engine room


def test_the_model_is_told_it_is_not_a_game_master() -> None:
    from adventure.nlu import SYSTEM_PROMPT

    assert "interpreter, not a game master" in SYSTEM_PROMPT
    assert "never invent objects" in SYSTEM_PROMPT
    assert "Never invent an id" in SYSTEM_PROMPT


# --- the local provider (LM Studio) ------------------------------------------

from adventure.nlu import LMStudioNLU, OpenAICompatibleNLU  # noqa: E402


def local(monkeypatch, payload=None, raises=None, model="llama-3.2-3b-instruct"):
    """An LMStudioNLU whose HTTP call is replaced — these tests never touch a server."""
    provider = LMStudioNLU(model=model)

    def fake_post(body):
        if raises is not None:
            raise raises
        return payload

    monkeypatch.setattr(provider, "_post", fake_post)
    return provider


def test_the_local_provider_needs_no_api_key() -> None:
    """LM Studio does not ask for one, and requiring a key people do not have is
    how a local-first path quietly stops being local-first."""
    provider = LMStudioNLU(model="llama-3.2-3b-instruct")
    assert provider._api_key is None
    assert provider._url.startswith("http://localhost:1234")


def test_the_local_url_is_overridable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LMSTUDIO_URL", "http://gpu-box.lan:1234/v1/chat/completions")
    assert LMStudioNLU(model="m")._url == "http://gpu-box.lan:1234/v1/chat/completions"
    assert LMStudioNLU(model="m", url="http://explicit/v1")._url == "http://explicit/v1"


def test_a_local_model_resolves_like_any_other(world: WorldState,
                                               monkeypatch: pytest.MonkeyPatch) -> None:
    """The whole point of the protocol: from the engine's side there is no
    difference between a frontier model and a 3B running on this laptop."""
    payload = {
        "choices": [{"message": {"content": '{"result":"action","action_type":"look"}'}}],
        "usage": {"prompt_tokens": 310, "completion_tokens": 12},
    }
    provider = local(monkeypatch, payload=payload)
    outcome = provider.resolve("what's in here?", build_context(world), [])
    assert isinstance(outcome, NLUResolution)
    assert outcome.action == Look()
    assert provider.last_call["provider"] == "lmstudio"
    assert provider.last_call["input_tokens"] == 310


def test_a_local_model_cannot_reach_past_the_room(world: WorldState,
                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    """Same validation funnel. A small model naming something it was never shown is
    discarded exactly like a large one."""
    payload = {"choices": [{"message": {
        "content": '{"result":"action","action_type":"take","entity_id":"prybar"}'}}]}
    outcome = local(monkeypatch, payload=payload).resolve("grab the bar", build_context(world), [])
    assert isinstance(outcome, NLUClarification)


def test_a_stopped_server_says_so_in_words_and_fast(world: WorldState,
                                                   monkeypatch: pytest.MonkeyPatch) -> None:
    """Two things at once: the message must name the real problem, and it must
    arrive quickly. Backing off repeatedly against a closed local port is half a
    minute of silence in an interface where silence IS the experience."""
    import time as _time

    started = _time.monotonic()
    import urllib.error

    provider = local(monkeypatch, raises=urllib.error.URLError("Connection refused"))
    outcome = provider.resolve("look around", build_context(world), [])
    assert isinstance(outcome, NLUUnavailable)
    assert "LM Studio is not answering" in outcome.detail
    assert "local server running" in outcome.detail
    assert _time.monotonic() - started < 3.0, "a closed local port must fail fast"
    assert _time.monotonic() - started < 3.0, "a closed local port must fail fast"


def test_both_remote_and_local_share_one_implementation() -> None:
    from adventure.nlu import OpenRouterNLU

    assert issubclass(LMStudioNLU, OpenAICompatibleNLU)
    assert issubclass(OpenRouterNLU, OpenAICompatibleNLU)


def test_openrouter_reads_the_key_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Regression: this helper went missing in a refactor and nothing noticed,
    because every existing test passed an explicit key. Constructing the provider
    the way a real run does raised NameError."""
    from adventure.nlu import OpenRouterNLU

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPEN_ROUTER_KEY", "sk-or-either-spelling")
    assert OpenRouterNLU(model="m")._api_key == "sk-or-either-spelling"

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-canonical")
    assert OpenRouterNLU(model="m")._api_key == "sk-or-canonical"

    monkeypatch.delenv("OPENROUTER_API_KEY")
    monkeypatch.delenv("OPEN_ROUTER_KEY")
    with pytest.raises(RuntimeError, match="no OpenRouter key"):
        OpenRouterNLU(model="m")


def test_guided_is_opt_in_everywhere(monkeypatch: pytest.MonkeyPatch) -> None:
    """Off by default on every provider.

    It buys real accuracy on small models and its safety did not replicate — one
    fabrication on the hardest trap, on the second set of three runs. Making a model
    commit is what it does, and committing is sometimes wrong, so it is a switch you
    throw for a model you have measured rather than a default.
    """
    from adventure.nlu import GuidedNLUWireResponse, LMStudioNLU, NLUWireResponse, OpenRouterNLU

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    assert LMStudioNLU(model="m")._wire is NLUWireResponse
    assert OpenRouterNLU(model="m")._wire is NLUWireResponse
    assert LMStudioNLU(model="m", guided=True)._wire is GuidedNLUWireResponse


def test_the_guided_schema_asks_for_candidates_first() -> None:
    """Ordering is the whole mechanism. Constrained decoding fills fields in schema
    order, so candidates must precede result or the model decides before it thinks."""
    from adventure.nlu import GuidedNLUWireResponse, wire_schema

    properties = list(wire_schema(GuidedNLUWireResponse)["properties"])
    assert properties[0] == "candidates"
    assert properties.index("candidates") < properties.index("result")
