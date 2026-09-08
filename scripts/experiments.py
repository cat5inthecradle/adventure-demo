"""Named, reversible variants of the language layer, for benching one change at a time.

Every entry here is a hypothesis from docs/EXPERIMENTS.md made runnable. Variants
patch the `adventure.nlu` module in place and restore it afterwards, so a bench run
can compare conditions in one process without shipped code carrying experimental
branches around.

    python scripts/nlu_bench.py --variant guided --runs 3 ...
"""

from contextlib import contextmanager
from typing import Literal

from pydantic import BaseModel, Field

from adventure import nlu
from adventure.models import Direction


# --- E2: guided thinking -----------------------------------------------------
#
# The model writes down which entity ids could match BEFORE it decides what to do.
# Declared first so constrained decoding fills it first — a model that has just
# emitted ["prybar"] has already made the choice obvious to itself. This aims at the
# same target as an action-biased prompt but through the model's own output rather
# than by instructing it to be bolder, which is what made Sonnet fabricate.

class GuidedWireResponse(BaseModel):
    candidates: list[str] = Field(
        default_factory=list,
        description="Ids from VISIBLE or INVENTORY that the player could mean. "
                    "Fill this in before deciding anything else.",
    )
    result: Literal["action", "clarify"]
    action_type: Literal["look", "examine", "go", "take", "drop",
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


@contextmanager
def _guided():
    original_model, original_prompt = nlu.NLUWireResponse, nlu.SYSTEM_PROMPT
    nlu.NLUWireResponse = GuidedWireResponse
    nlu.SYSTEM_PROMPT = original_prompt + GUIDED_PROMPT_ADDITION
    try:
        yield
    finally:
        nlu.NLUWireResponse, nlu.SYSTEM_PROMPT = original_model, original_prompt


@contextmanager
def _control():
    yield


VARIANTS = {
    "control": _control,
    "guided": _guided,
}


@contextmanager
def apply_variant(name: str | None):
    """Run a block with a named variant active, then put everything back."""
    if name is None:
        name = "control"
    if name not in VARIANTS:
        raise SystemExit(f"unknown variant {name!r}; known: {', '.join(VARIANTS)}")
    with VARIANTS[name]():
        yield


# --- E1: inline markup instead of a constrained JSON schema ------------------
#
# Bicking's claim is that constrained decoding changes how models behave, and that
# small ones do worse under it. Our 3B emitted flawless schema-valid JSON on every
# call while refusing to act on 13 of 16 — fluent in the format, useless at the task.
#
# The variant drops response_format entirely, asks for tags, and converts them back
# to the wire JSON at the parse seam, so validate_resolution and the engine see
# exactly what they always see. Only the model's side of the conversation changes.

import json
import re

MARKUP_PROMPT = """You translate a player's natural-language input into ONE command for a text
adventure game. You are an interpreter, not a game master: you never decide
outcomes, never invent objects, and never describe the world.

Reply with ONE tag and nothing else. The available tags are:

  <look/>                          look around
  <inventory/>                     list what the player carries
  <go>north</go>                   a compass direction
  <examine>status_console</examine>
  <take>prybar</take>
  <drop>prybar</drop>
  <open>pod_door</open>
  <talk>maintenance_droid</talk>
  <use>prybar</use><on>supply_crate</on>    the <on> part is optional
  <clarify>one short question</clarify>

Ids inside tags MUST be copied exactly from the VISIBLE or INVENTORY lists you are
given. Never invent an id.

Choose the single command that best matches the player's intent. If the input is
ambiguous between two or more listed entities, or names something not listed, or
asks for something no tag expresses, reply with <clarify> and one short question
offering the concrete options.

If the player asks about their surroundings ("what's around me?", "where am I?"),
reply <look/>. If they ask about one visible thing, <examine> it.

Prefer <clarify> over guessing."""

# Accepts <take>prybar</take>, <look/>, and the <go south/> form a 3B invented
# unprompted. Being generous here is free: a reply we cannot read becomes
# "unavailable", which is safe but scores zero, so parser gaps look like model
# failures unless we go looking.
_TAG = re.compile(
    r"<(look|inventory|go|examine|take|drop|open|talk|use|clarify)"
    r"(?:\s+([^/>]+?))?\s*/?>"
    r"(?:(.*?)</\1>)?", re.S)
_ON = re.compile(r"<on>(.*?)</on>", re.S)

_SINGLE_ENTITY = {"examine": "entity_id", "take": "entity_id", "drop": "entity_id",
                  "open": "entity_id", "talk": "entity_id", "use": "entity_id"}


def markup_to_wire_json(text: str) -> str:
    """Turn the first recognised tag into the JSON the wire model expects.

    Raising on no match is deliberate: it routes through the same "unavailable"
    path as any other unparseable reply, so a model that cannot follow the format
    shows up in the numbers instead of silently scoring zero.
    """
    match = _TAG.search(text)
    if match is None:
        raise ValueError(f"no recognised tag in reply: {text[:120]}")
    tag = match.group(1)
    inner = (match.group(3) or match.group(2) or "").strip()

    wire: dict[str, object] = {"result": "action", "action_type": tag}
    if tag == "clarify":
        return json.dumps({"result": "clarify", "question": inner or None})
    if tag == "go":
        wire["direction"] = inner or None
    elif tag in _SINGLE_ENTITY:
        wire[_SINGLE_ENTITY[tag]] = inner or None
        if tag == "use":
            on = _ON.search(text)
            if on:
                wire["target_id"] = on.group(1).strip()
    return json.dumps(wire)


@contextmanager
def _markup():
    original_prompt = nlu.SYSTEM_PROMPT
    original_extract = nlu._extract_json
    original_body = nlu.OpenAICompatibleNLU._body

    def markup_body(self, utterance, context, transcript, mode):
        body = original_body(self, utterance, context, transcript, mode)
        body.pop("response_format", None)          # no constrained decoding
        body["messages"][0]["content"] = MARKUP_PROMPT
        return body

    nlu.SYSTEM_PROMPT = MARKUP_PROMPT
    nlu._extract_json = markup_to_wire_json
    nlu.OpenAICompatibleNLU._body = markup_body
    try:
        yield
    finally:
        nlu.SYSTEM_PROMPT = original_prompt
        nlu._extract_json = original_extract
        nlu.OpenAICompatibleNLU._body = original_body


VARIANTS["markup"] = _markup


# --- E1b: markup AND guided together ----------------------------------------
#
# E1 gave the best accuracy and by far the best latency, and failed the hard gate
# with one fabrication. E2 fixed decisiveness with no fabrications. The obvious
# question is whether enumerating candidates restores safety when generation is
# unconstrained — speed from one, judgement from the other.

GUIDED_MARKUP_ADDITION = """

Before the tag, write one line listing the ids from VISIBLE or INVENTORY the player
could mean, like:

  candidates: prybar

Then read what you wrote. Exactly one id means act on it. Two or more, or none, means
<clarify>."""


@contextmanager
def _markup_guided():
    with _markup():
        original = nlu.SYSTEM_PROMPT
        nlu.SYSTEM_PROMPT = original + GUIDED_MARKUP_ADDITION
        original_body = nlu.OpenAICompatibleNLU._body

        def body(self, utterance, context, transcript, mode):
            out = original_body(self, utterance, context, transcript, mode)
            out["messages"][0]["content"] = nlu.SYSTEM_PROMPT
            return out

        nlu.OpenAICompatibleNLU._body = body
        try:
            yield
        finally:
            nlu.SYSTEM_PROMPT = original
            nlu.OpenAICompatibleNLU._body = original_body


VARIANTS["markup-guided"] = _markup_guided
