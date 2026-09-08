"""One player turn, independent of how the player reached us.

The CLI and the web server both route input the same way — dumb parser first, the
optional language assistant only for lines the parser could not use, the engine
always deciding what actually happens. That routing lives here so the two frontends
cannot drift apart.

This module performs no I/O of its own: it returns what happened and lets the caller
print it, send it, or speak it.
"""

from dataclasses import dataclass, field

from adventure import engine
from adventure.actions import Action
from adventure.events import Event
from adventure.nlu import (
    NLUClarification,
    NLUProvider,
    NLUResolution,
    NLUUnavailable,
    build_context,
)
from adventure.models import WorldState
from adventure.parser import ParseError, parse
from adventure.renderer import Style, render_events, render_parse_error, render_speech

UNAVAILABLE_TEMPLATE = (
    "The language assistant is unavailable ({detail}). "
    "Classic commands still work — type 'help'."
)


@dataclass
class TurnResult:
    """Everything one turn produced, in every form a frontend might need."""

    text: str                                   # written for the eye
    speech: str = ""                            # written for the ear; falls back to
                                                # text where the two do not differ
    speech_parts: list[dict] = field(default_factory=list)   # the same, split by speaker
    events: list[Event] = field(default_factory=list)
    route: str = "parser"                       # parser | nlu | unresolved
    action: Action | None = None
    parse_error: ParseError | None = None
    nlu: dict | None = None                     # model, result, tokens, ms
    clarifying: bool = False                    # the assistant asked a question
    outcome: str | None = None                  # "win" | "loss" once the game is over

    @property
    def ended(self) -> bool:
        return self.outcome is not None

    @property
    def won(self) -> bool:
        return self.outcome == "win"


def take_turn(
    world: WorldState,
    line: str,
    nlu: NLUProvider | None = None,
    transcript: list[tuple[str, str]] | None = None,
) -> TurnResult:
    """Route one line of player input and return what happened.

    Meta commands (help, save, quit) are NOT handled here — they are frontend
    concerns, and the engine only ever sees world mutations.
    """
    parsed = parse(world, line)
    if not isinstance(parsed, ParseError):
        return _apply(world, parsed, route="parser")

    if nlu is None:
        prose = render_parse_error(parsed)
        return TurnResult(text=prose, speech=prose, route="unresolved",
                          parse_error=parsed)

    outcome = nlu.resolve(line, build_context(world), list(transcript or []))
    call = getattr(nlu, "last_call", None)
    info = {"result": outcome.kind, **(call or {})}

    match outcome:
        case NLUResolution():
            result = _apply(world, outcome.action, route="nlu")
            result.nlu = info
            result.parse_error = parsed
            return result
        case NLUClarification():
            return TurnResult(text=outcome.question, speech=outcome.question,
                              route="nlu", parse_error=parsed, nlu=info, clarifying=True)
        case NLUUnavailable():
            detail = (outcome.detail or "no detail").strip().splitlines()[0][:80]
            text = UNAVAILABLE_TEMPLATE.format(detail=detail) + "\n" + render_parse_error(parsed)
            return TurnResult(text=text, speech=text, route="nlu",
                              parse_error=parsed, nlu=info)


def _apply(world: WorldState, action: Action, route: str) -> TurnResult:
    events = engine.apply(world, action)
    endings = [event for event in events if event.type == "game_ended"]
    return TurnResult(
        text=render_events(events, pronouns=world.pronouns),
        speech=render_events(events, Style.SPEECH, world.pronouns),
        speech_parts=render_speech(events, world.pronouns),
        events=events,
        route=route,
        action=action,
        outcome=endings[-1].outcome if endings else None,
    )
