"""The optional LLM language interface: utterance -> Action or clarifying question.

This module never decides truth. It turns what a player said into a *candidate*
Action built only from entity IDs the game itself put in front of it, and the engine
still has the final say on legality. Everything it is allowed to know about the
world arrives in an NLUContext — a deliberately small snapshot — so the model cannot
reference anything the player cannot currently see.
"""

import json
import os
import time
import urllib.error
import urllib.request
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from adventure import queries
from adventure.actions import (
    Action,
    Drop,
    Examine,
    Go,
    Look,
    Open,
    ShowInventory,
    Listen,
    Take,
    Talk,
    Traverse,
    Use,
)
from adventure.models import Direction, Door, Item, NPC, WorldState

LEGAL_ACTION_TYPES = [
    "look", "examine", "go", "traverse", "listen", "take", "drop", "open", "use",
    "talk", "inventory",
]

# The fixed order room exits are presented in, matching the renderer.
DIRECTION_ORDER = ("north", "south", "east", "west", "up", "down")


class NLUEntity(BaseModel):
    id: str
    name: str
    aliases: list[str]
    kind: Literal["item", "npc", "door"]


class NLUContext(BaseModel):
    """A constrained snapshot of what the player can currently see/do.
    This is ALL the model gets — it cannot reference anything else."""

    room_name: str
    room_description: str
    exits: list[str]                        # directions
    visible: list[NLUEntity]                # id, name, aliases, kind
    inventory: list[NLUEntity]
    legal_action_types: list[str]           # ["look","examine","go",...]

    def entity_ids(self) -> set[str]:
        """Every id the model is allowed to name."""
        return {e.id for e in self.visible} | {e.id for e in self.inventory}


class NLUResolution(BaseModel):
    kind: Literal["action"] = "action"
    action: Action


class NLUClarification(BaseModel):
    kind: Literal["clarify"] = "clarify"
    question: str


class NLUUnavailable(BaseModel):
    kind: Literal["unavailable"] = "unavailable"
    detail: str


NLUResult = NLUResolution | NLUClarification | NLUUnavailable


class NLUProvider(Protocol):
    def resolve(
        self,
        utterance: str,
        context: NLUContext,
        transcript: list[tuple[str, str]],
    ) -> NLUResult:
        """transcript: last few (player_line, game_response) pairs, oldest first."""
        ...


def build_context(world: WorldState) -> NLUContext:
    """Snapshot exactly what the player can currently see and do — nothing more."""
    room = queries.current_room(world)
    room_id = room.id
    visible: list[NLUEntity] = []
    visible.extend(_entity(item, "item") for item in queries.items_in_room(world, room_id))
    visible.extend(_entity(npc, "npc") for npc in queries.npcs_in_room(world, room_id))
    visible.extend(_entity(door, "door") for door in queries.doors_in_room(world, room_id))

    return NLUContext(
        room_name=room.name,
        room_description=queries.resolved_description(world, room),
        exits=[d for d in DIRECTION_ORDER if d in room.exits],
        visible=visible,
        inventory=[_entity(item, "item") for item in queries.inventory(world)],
        legal_action_types=list(LEGAL_ACTION_TYPES),
    )


def validate_resolution(context: NLUContext, action: Action) -> Action | None:
    """Defense in depth: every entity id the action references must be in the
    context's visible+inventory sets (directions must be current exits for Go).
    Returns the action if clean, None otherwise. The engine still has the final
    say on legality even for actions that pass."""
    known = context.entity_ids()
    match action.type:
        case "look" | "inventory":
            return action
        case "listen":
            return action if action.target is None or action.target in known else None
        case "go":
            return action if action.direction in context.exits else None
        case "examine" | "open" | "traverse":
            return action if action.target in known else None
        case "take" | "drop":
            return action if action.item in known else None
        case "talk":
            return action if action.npc in known else None
        case "use":
            if action.item not in known:
                return None
            if action.target is not None and action.target not in known:
                return None
            return action


class FakeNLU:
    """A deterministic NLUProvider for tests: a lookup table of canned results."""

    def __init__(self, responses: dict[str, NLUResult]) -> None:
        self._responses = responses

    def resolve(
        self,
        utterance: str,
        context: NLUContext,
        transcript: list[tuple[str, str]],
    ) -> NLUResult:
        return self._responses.get(utterance, NLUClarification(question="I don't understand."))


def _entity(obj: Item | NPC | Door, kind: Literal["item", "npc", "door"]) -> NLUEntity:
    return NLUEntity(id=obj.id, name=obj.name, aliases=list(obj.aliases), kind=kind)


# --- the Anthropic-backed provider ------------------------------------------
#
# `anthropic` is imported lazily so that a player who never enables the language
# assistant never pays for the import — and so the game runs with the network off.

# Sonnet 5 completes the Wayfarer in natural language with no clarifications.
# Haiku 4.5 over-clarifies when only one entity matches (e.g. "pick up that steel
# bar" with one bar in the room), which stalls a playthrough. Override with --model.
DEFAULT_MODEL = "claude-sonnet-5"

SYSTEM_PROMPT = """You translate a player's natural-language input into ONE structured command for a
text adventure game. You are an interpreter, not a game master: you never decide
outcomes, never invent objects, and never describe the world.

Rules:
- entity_id and target_id MUST be copied exactly from the ids listed in the game
  state you are given. Never invent an id.
- Choose the single command that best matches the player's intent.
- If the input is ambiguous between two or more visible entities, or references
  something not in the lists, or asks for something no command expresses, return
  result="clarify" with one short question offering the concrete options.
- "go" is for a compass direction. When the player names the way through instead —
  a door, hatch, window, gap ("out the window", "through the hatch", "get in the
  pod") — use "traverse" with that door's id as entity_id. Traverse opens an
  unlocked door on the way, so do not pair it with "open".
- "listen" is for hearing. Leave entity_id empty to listen to the room; set it to a
  door's id when the player names one ("listen at the door").
- If the player asks a question about their surroundings ("what's around me?",
  "where am I?"), return the "look" action. If they ask about a specific visible
  thing, return "examine" for it.
- Prefer "clarify" over guessing."""

# That last line is load-bearing, and the evidence is worth keeping next to it.
#
# Measured 2026-09-07 against the 18-scenario bench. Rebalancing it toward action
# ("ACT whenever exactly one listed entity plausibly matches...") helps weak models
# a lot — Llama 3.2 3B ran locally went 3/18 to 6/18, over-clarifying 13 times
# instead of 7 — but on Claude Sonnet 5 it produced the first fabricated action we
# have ever recorded: "open the airlock with my sandwich" came back as
# Open(pod_door), the model deciding an airlock it could not see must be the pod
# bay door. Trap accuracy fell from 100% to 50%.
#
# So this is not a tuning knob. Biasing the prompt toward action trades away the
# property the whole design exists to guarantee. If a future provider needs a more
# directive prompt, give that provider its own and measure the traps.

CLARIFY_FALLBACK = "I couldn't match that to anything here — what did you mean?"

MAX_TRANSCRIPT_PAIRS = 4


class NLUWireResponse(BaseModel):
    """The flat schema the model fills in. Flat on purpose — most robust to generate."""

    result: Literal["action", "clarify"]
    # when result == "action":
    action_type: Literal["look", "examine", "go", "traverse", "listen", "take",
                         "drop", "open", "use", "talk", "inventory"] | None = None
    direction: Direction | None = None      # for "go"
    entity_id: str | None = None            # examine/take/drop/open/talk target, or the used item
    target_id: str | None = None            # for "use ... on ..."
    # when result == "clarify":
    question: str | None = None


class GuidedNLUWireResponse(BaseModel):
    """The wire schema with a thinking step the decoder makes mandatory.

    `candidates` is declared first, so constrained decoding fills it before
    anything else: the model writes down which ids could match, then reads its own
    list. One id makes the choice obvious to it.

    Measured (docs/EXPERIMENTS.md, E2): worth +17 to +21 points of residue accuracy
    on Llama 3.2 3B. The ordering is what does the work — the same instruction in a
    freeform prompt is a suggestion small models skip (E1b), so this only helps where
    the decoder can enforce it.

    Not on by default: on re-test it fabricated on the hardest trap. Making a model
    commit is exactly what this does, and committing is sometimes wrong.
    """

    candidates: list[str] = Field(
        default_factory=list,
        description="Ids from VISIBLE or INVENTORY the player could mean. "
                    "Fill this in before deciding anything else.",
    )
    result: Literal["action", "clarify"]
    action_type: Literal["look", "examine", "go", "traverse", "take", "drop",
                         "open", "use", "talk", "inventory"] | None = None
    direction: Direction | None = None
    entity_id: str | None = None
    target_id: str | None = None
    question: str | None = None


GUIDED_PROMPT_ADDITION = """

Before deciding, fill in "candidates" with every id from the VISIBLE or INVENTORY
lists that the player could plausibly mean. Then look at what you wrote: if it holds
exactly one id, that is your answer and you should act on it. Only return
result="clarify" when candidates holds two or more, or none at all."""


class AnthropicNLU:
    """Turns an utterance into a candidate Action via the Anthropic API.

    Structured output means the model cannot free-text at us: the response is
    validated against NLUWireResponse before we ever see it. We then check every
    id it named against the context we gave it, and the engine checks legality
    after that. Three gates, none of which trust the model with game truth.
    """

    def __init__(self, model: str = DEFAULT_MODEL, client: object | None = None) -> None:
        self._client = client if client is not None else _anthropic().Anthropic()
        self._model = model
        # Metadata about the most recent call, for the journal to record. Kept off
        # NLUResult so the provider contract stays the same for every implementation.
        self.last_call: dict[str, object] | None = None

    def resolve(
        self,
        utterance: str,
        context: NLUContext,
        transcript: list[tuple[str, str]],
    ) -> NLUResult:
        """Never raises: every failure degrades to a clarification or NLUUnavailable."""
        anthropic = _anthropic()
        self.last_call = {"model": self._model}
        started = time.monotonic()
        try:
            response = self._client.messages.parse(
                model=self._model,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": self._format_request(utterance, context, transcript),
                    }
                ],
                output_format=NLUWireResponse,
            )
            wire = response.parsed_output
            self._record(response, started)
        except (anthropic.APIError, anthropic.APIConnectionError) as exc:
            return NLUUnavailable(detail=str(exc))
        except Exception as exc:   # the contract is that resolve never raises
            return NLUUnavailable(detail=str(exc))

        if wire is None:
            return NLUUnavailable(detail="the model returned no structured output")
        return _to_result(wire, context)

    def _record(self, response: object, started: float) -> None:
        """Note tokens and latency for the journal. Usage is best-effort."""
        assert self.last_call is not None
        self.last_call["ms"] = round((time.monotonic() - started) * 1000)
        usage = getattr(response, "usage", None)
        for field in ("input_tokens", "output_tokens"):
            value = getattr(usage, field, None)
            if isinstance(value, int):
                self.last_call[field] = value

    def _format_request(
        self,
        utterance: str,
        context: NLUContext,
        transcript: list[tuple[str, str]],
    ) -> str:
        sections = [
            f"PLAYER SAID: {utterance}",
            "",
            f"ROOM: {context.room_name}",
            context.room_description,
            "",
            f"EXITS: {', '.join(context.exits) if context.exits else 'none'}",
            "",
            "VISIBLE:",
            *_entity_lines(context.visible),
            "",
            "INVENTORY:",
            *_entity_lines(context.inventory),
            "",
            f"COMMANDS: {', '.join(context.legal_action_types)}",
        ]
        recent = transcript[-MAX_TRANSCRIPT_PAIRS:]
        if recent:
            sections += ["", "RECENT:"]
            for said, replied in recent:
                sections += [f"  player: {said}", f"  game: {replied}"]
        return "\n".join(sections)


def _to_result(wire: NLUWireResponse, context: NLUContext) -> NLUResult:
    """Map a wire response onto a validated Action, or a clarifying question."""
    if wire.result == "clarify":
        return NLUClarification(question=wire.question or "Could you rephrase that?")

    action = _to_action(wire)
    if action is None:
        return NLUClarification(question=CLARIFY_FALLBACK)
    if validate_resolution(context, action) is None:
        return NLUClarification(question=CLARIFY_FALLBACK)
    return NLUResolution(action=action)


def _to_action(wire: NLUWireResponse) -> Action | None:
    """Build the Action the wire response describes, or None if fields are missing."""
    entity, target = wire.entity_id, wire.target_id
    match wire.action_type:
        case "look":
            return Look()
        case "inventory":
            return ShowInventory()
        case "go":
            return Go(direction=wire.direction) if wire.direction else None
        case "traverse":
            return Traverse(target=entity) if entity else None
        case "listen":
            return Listen(target=entity)          # entity_id is optional here
        case "examine":
            return Examine(target=entity) if entity else None
        case "take":
            return Take(item=entity) if entity else None
        case "drop":
            return Drop(item=entity) if entity else None
        case "open":
            return Open(target=entity) if entity else None
        case "talk":
            return Talk(npc=entity) if entity else None
        case "use":
            return Use(item=entity, target=target) if entity else None
        case None:
            return None


def _entity_lines(entities: list[NLUEntity]) -> list[str]:
    if not entities:
        return ["  (nothing)"]
    lines = []
    for entity in entities:
        aliases = f" (also: {', '.join(entity.aliases)})" if entity.aliases else ""
        lines.append(f"  {entity.id} — {entity.name} [{entity.kind}]{aliases}")
    return lines


def _anthropic():
    """Imported here, not at module scope, so the offline game never loads it."""
    import anthropic

    return anthropic


# --- an OpenAI-compatible provider (OpenRouter) ------------------------------
#
# Deliberately dependency-free: one JSON POST over the standard library. The point
# of the NLUProvider protocol is that a new language backend costs nothing
# structurally — this provider funnels through exactly the same NLUWireResponse
# schema, the same validate_resolution check, and the same engine. A weaker or
# stranger model cannot break the game; it can only fail to be understood.

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_TIMEOUT = 45.0
# LM Studio serves an OpenAI-shaped endpoint on localhost with no auth. The timeout
# is generous because the first request after loading a model can be slow, and a
# local box has no rate limit to punish us for waiting.
LMSTUDIO_URL = "http://localhost:1234/v1/chat/completions"
LMSTUDIO_TIMEOUT = 120.0
# Statuses that mean "ask again later" rather than "this request is wrong".
RETRY_STATUSES = {408, 409, 429, 500, 502, 503, 504}
RETRY_ATTEMPTS = 4
RETRY_BASE_DELAY = 2.0
RETRY_MAX_DELAY = 30.0


class OpenAICompatibleNLU:
    """Shared machinery for any OpenAI-shaped /chat/completions endpoint.

    Hosted or local, paid or free — from here they are the same thing: a URL that
    takes messages and returns a choice. Everything that keeps the game safe lives
    downstream of this class, in the wire schema, validate_resolution, and the
    engine, so a new backend is a subclass and a base URL.
    """

    provider_name = "openai-compatible"

    def __init__(self, model: str, url: str, api_key: str | None = None,
                 timeout: float = OPENROUTER_TIMEOUT,
                 retry_attempts: int = RETRY_ATTEMPTS,
                 retry_base_delay: float = RETRY_BASE_DELAY,
                 guided: bool = False) -> None:
        self._model = model
        self._url = url
        self._api_key = api_key
        self._timeout = timeout
        self._guided = guided
        # Read at construction so an experiment variant that swaps the module-level
        # wire model still takes effect.
        self._wire = GuidedNLUWireResponse if guided else NLUWireResponse
        self._prompt = SYSTEM_PROMPT + GUIDED_PROMPT_ADDITION if guided else SYSTEM_PROMPT
        self._retry_attempts = retry_attempts
        self._retry_base_delay = retry_base_delay
        self.last_call: dict[str, object] | None = None

    def resolve(
        self,
        utterance: str,
        context: NLUContext,
        transcript: list[tuple[str, str]],
    ) -> NLUResult:
        """Never raises: every failure degrades to a clarification or NLUUnavailable.

        Two shots at the model. First with a strict json_schema response format, which
        is the reliable path when the model supports it. If that fails because the
        model cannot honour the schema — some models ignore it entirely and answer in
        prose — fall back to asking for a bare JSON object and extracting it. Both
        paths funnel through the same Pydantic validation, so a model that returns
        nonsense still cannot reach the engine.
        """
        self.last_call = {"model": self._model}
        started = time.monotonic()
        failures: list[str] = []

        for mode in ("schema", "prompt"):
            try:
                payload = self._post_with_retry(
                    self._body(utterance, context, transcript, mode)
                )
                content = _message_content(payload)
                wire = self._wire.model_validate_json(_extract_json(content))
            except Exception as exc:
                failures.append(f"{mode}: {type(exc).__name__}: {exc}"[:160])
                continue

            self.last_call["ms"] = round((time.monotonic() - started) * 1000)
            self.last_call["mode"] = mode
            self.last_call["provider"] = self.provider_name
            usage = payload.get("usage") or {}
            self.last_call["input_tokens"] = usage.get("prompt_tokens", 0)
            self.last_call["output_tokens"] = usage.get("completion_tokens", 0)
            return _to_result(wire, context)

        self.last_call["ms"] = round((time.monotonic() - started) * 1000)
        return NLUUnavailable(detail=" | ".join(failures)[:220])

    def _body(self, utterance: str, context: NLUContext,
              transcript: list[tuple[str, str]], mode: str) -> dict:
        system = self._prompt
        if mode == "prompt":
            system += (
                "\n\nReply with ONE JSON object and nothing else — no prose, no code "
                'fences. Shape: {"result": "action" | "clarify", "action_type": ..., '
                '"direction": ..., "entity_id": ..., "target_id": ..., "question": ...}. '
                "Use null for fields that do not apply."
            )
        body: dict = {
            "model": self._model,
            "max_tokens": 1024,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user",
                 "content": AnthropicNLU._format_request(self, utterance, context, transcript)},
            ],
        }
        if mode == "schema":
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "nlu_response", "strict": True,
                                "schema": wire_schema(self._wire)},
            }
        return body

    def _post_with_retry(self, body: dict) -> dict:
        """Retry the statuses that mean 'ask again later'. A rate limit is a property
        of the harness, not of the model — measuring one as the other is how a bakeoff
        convicts an innocent model."""
        delay = self._retry_base_delay
        last: Exception | None = None
        for attempt in range(self._retry_attempts):
            try:
                return self._post(body)
            except urllib.error.HTTPError as exc:
                last = exc
                if exc.code not in RETRY_STATUSES:
                    raise
                header = exc.headers.get("Retry-After") if exc.headers else None
                wait = float(header) if header and header.isdigit() else delay
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                last = exc
                wait = delay
            if attempt == self._retry_attempts - 1:
                break
            time.sleep(min(wait, RETRY_MAX_DELAY))
            delay *= 2
        assert last is not None
        raise last

    def _post(self, body: dict) -> dict:
        headers = {"Content-Type": "application/json", "X-Title": "adventure"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        request = urllib.request.Request(
            self._url, data=json.dumps(body).encode("utf-8"), headers=headers
        )
        with urllib.request.urlopen(request, timeout=self._timeout) as response:
            return json.loads(response.read().decode("utf-8"))


class OpenRouterNLU(OpenAICompatibleNLU):
    """Any OpenRouter-hosted model."""

    provider_name = "openrouter"

    def __init__(self, model: str, api_key: str | None = None,
                 url: str = OPENROUTER_URL) -> None:
        key = api_key or _openrouter_key()
        if not key:
            raise RuntimeError(
                "no OpenRouter key: set OPENROUTER_API_KEY or OPEN_ROUTER_KEY"
            )
        super().__init__(model, url, api_key=key)


class LMStudioNLU(OpenAICompatibleNLU):
    """A model running on this machine, through LM Studio's local server.

    The point is not cost — it is that the whole game then runs with the network
    off. Terse commands were always offline; this makes the language layer offline
    too, which matters for a spoken interface where every round trip is latency the
    player hears.

    No API key: LM Studio does not ask for one.
    """

    provider_name = "lmstudio"

    def __init__(self, model: str, url: str | None = None,
                 timeout: float = LMSTUDIO_TIMEOUT, guided: bool = False) -> None:
        # guided is OFF by default despite being worth +17 to +21 points of residue
        # accuracy on a 3B, because its safety did not replicate. See EXPERIMENTS.md
        # E2: zero fabrications in the first three runs, one in the next three, on
        # the same trap that broke Sonnet under an action-biased prompt ("open the
        # airlock with my sandwich" -> Open(pod_door)). Tallied across every trap
        # trial we have on this model: unguided 0/12, guided 1/12.
        #
        # The correction that matters: enumerating candidates IS an action bias, just
        # a structural one. Being reached through the model's own output rather than
        # an instruction does not make it safe, which is what I assumed. Turn it on
        # deliberately, for a model you have measured, not by default.
        super().__init__(
            model,
            url or os.environ.get("LMSTUDIO_URL", LMSTUDIO_URL),
            api_key=None,
            timeout=timeout,
            # A refused connection to localhost is not a transient network blip:
            # the server is running or it is not. Backing off four times means a
            # player with LM Studio closed waits half a minute to be told so, and
            # in a spoken interface that silence IS the experience.
            retry_attempts=2,
            retry_base_delay=0.5,
            guided=guided,
        )

    def resolve(self, utterance, context, transcript) -> NLUResult:
        result = super().resolve(utterance, context, transcript)
        # A refused connection is the common case here and deserves a real answer:
        # "URLError" tells a player nothing, "start the server" tells them what to do.
        if isinstance(result, NLUUnavailable) and "URLError" in result.detail:
            return NLUUnavailable(
                detail=f"LM Studio is not answering at {self._url} — "
                       "is the local server running with a model loaded?"
            )
        return result


def _message_content(payload: dict) -> str:
    """Pull the assistant text out of an OpenAI-shaped response.

    Some models return content as a list of parts rather than a string, and some
    return nothing at all — both are failures worth naming precisely.
    """
    choices = payload.get("choices")
    if not choices:
        raise ValueError(f"no choices in response: {str(payload)[:120]}")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list):
        joined = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
        if joined.strip():
            return joined
    raise ValueError(f"empty or non-text content: {str(content)[:120]}")


def _extract_json(text: str) -> str:
    """Take the first JSON object out of a reply, tolerating fences and stray prose."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```")[1] if "```" in stripped[3:] else stripped[3:]
        if stripped.lstrip().startswith("json"):
            stripped = stripped.lstrip()[4:]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end <= start:
        raise ValueError(f"no JSON object in reply: {text[:120]}")
    return stripped[start:end + 1]


def _openrouter_key() -> str:
    """Both spellings are accepted — people write it either way."""
    for name in ("OPENROUTER_API_KEY", "OPEN_ROUTER_KEY"):
        value = os.environ.get(name)
        if value:
            return value
    return ""


def wire_schema(model: type[BaseModel] | None = None) -> dict:
    """NLUWireResponse as a strict JSON Schema.

    Strict mode requires every property to be listed in `required` and forbids extra
    properties; optional fields stay expressible because Pydantic already emits them
    as nullable unions.
    """
    schema = (model or NLUWireResponse).model_json_schema()
    schema["additionalProperties"] = False
    schema["required"] = list(schema.get("properties", {}))
    for definition in schema.get("$defs", {}).values():
        definition["additionalProperties"] = False
    return schema
