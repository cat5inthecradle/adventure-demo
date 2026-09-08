"""Renders events as screen-reader-friendly prose.

Prose sentences only: no ASCII art, no box drawing, no colour codes, no emoji, and
never any reliance on layout to carry meaning. The renderer never invents facts —
every noun it prints came from the world data inside an event — and never mutates.
"""

import re
from enum import StrEnum

from adventure.events import (
    ActionFailed,
    DoorOpened,
    EntityExamined,
    Event,
    GameEnded,
    InventoryListed,
    ItemDropped,
    ItemTaken,
    ItemUsed,
    Listened,
    Moved,
    Narrated,
    NpcSpoke,
    Reason,
    RoomDescribed,
)
from adventure.parser import ParseError
from adventure.pronouns import PronounSet
from adventure.pronouns import apply as apply_pronouns

FAILURE_TEXT: dict[Reason, str] = {
    Reason.NO_EXIT: "You can't go that way.",
    Reason.DOOR_CLOSED: "The {name} is closed.",
    Reason.DOOR_LOCKED: "The {name} won't open.",
    Reason.ALREADY_OPEN: "The {name} is already open.",
    Reason.NOT_PRESENT: "You don't see that here.",
    Reason.NOT_PORTABLE: "You can't take the {name}.",
    Reason.ALREADY_CARRYING: "You already have the {name}.",
    Reason.NOT_CARRYING: "You aren't carrying that.",
    Reason.NOT_OPENABLE: "You can't open the {name}.",
    Reason.NOTHING_HAPPENS: "Nothing happens.",
    Reason.GAME_OVER: "The game is over. Start a new one to play again.",
}

# The closing line of a game, when the world does not supply one of its own. A
# world with more to say than "win" and "lose" — an episode that merely stops, say —
# sets `banner` on its end_game effect and overrides these.
DEFAULT_BANNER: dict[str, str] = {
    "win": "*** You have escaped. THE END ***",
    "loss": "*** You have died. THE END ***",
}

# When a room has no sound of its own. A world where listening matters should give
# every room one, so that the doors worth listening at are the ones the prose points
# at rather than the ones that happen to answer.
NOTHING_TO_HEAR = "You listen, and hear nothing you can make anything of."

# Used when an event omits the entity a failure string would have named.
FAILURE_FALLBACK: dict[Reason, str] = {
    Reason.DOOR_CLOSED: "It is closed.",
    Reason.DOOR_LOCKED: "It won't open.",
    Reason.ALREADY_OPEN: "It is already open.",
    Reason.NOT_PORTABLE: "You can't take that.",
    Reason.ALREADY_CARRYING: "You already have that.",
    Reason.NOT_OPENABLE: "You can't open that.",
}


class Style(StrEnum):
    """How the same event should be put into words.

    Not a different renderer — a different register. The facts are identical; what
    changes is that TEXT is skimmed by an eye that can jump to the exits line, and
    SPEECH is heard once, in order, by someone who cannot look ahead.
    """

    TEXT = "text"
    SPEECH = "speech"


def render_event(event: Event, style: Style = Style.TEXT,
                 pronouns: str | PronounSet | None = None) -> str:
    """One event, one block of prose.

    Pronoun tokens are substituted here, at the last possible moment, so that the
    same event renders differently for two players and a saved game picks up a
    change of mind. Every string a player reads passes through this function, which
    is what makes one call site enough.
    """
    return apply_pronouns(_render(event, style), pronouns)


def _render(event: Event, style: Style) -> str:
    match event:
        case RoomDescribed():
            return _room_aloud(event) if style is Style.SPEECH else _room(event)
        case GameEnded() if style is Style.SPEECH:
            # "*** THE END ***" is read out as three asterisks, three asterisks.
            banner = event.banner or DEFAULT_BANNER[event.outcome]
            return f"{event.epilogue} {banner.strip('* ')}."
        case EntityExamined():
            return event.description
        case Moved():
            if event.message:
                return event.message
            return f"You head to the {event.to_room.name}."
        case ItemTaken():
            return f"You take the {event.item.name}."
        case ItemDropped():
            return f"You put down the {event.item.name}."
        case DoorOpened():
            return event.message or f"You open the {event.door.name}."
        case ItemUsed():
            return event.message
        case NpcSpoke():
            return event.text
        case Narrated():
            return event.text
        case Listened():
            return event.text or NOTHING_TO_HEAR
        case InventoryListed():
            if not event.items:
                return "You are carrying nothing."
            return f"You are carrying {_join([i.name for i in event.items])}."
        case GameEnded():
            banner = event.banner or DEFAULT_BANNER[event.outcome]
            return f"{event.epilogue}\n\n{banner}"
        case ActionFailed():
            return _failure(event)


def render_events(events: list[Event], style: Style = Style.TEXT,
                  pronouns: str | PronounSet | None = None) -> str:
    """Joins with a blank line between events."""
    return "\n\n".join(render_event(event, style, pronouns) for event in events)


# A line of dialogue is usually narration wrapped around actual speech:
#   R-6 boots with a rising whir. 'Unit R-6 online...'
# Only the quoted half is the character talking. The lookarounds keep apostrophes
# inside words out of it, so "the droid's chest port" is not mistaken for a quote.
QUOTED = re.compile(r'"([^"]*)"' + r"|(?<![A-Za-z])'([^']*)'(?![A-Za-z])")


def split_quoted(text: str) -> list[tuple[str, str]]:
    """Split dialogue into (voice, fragment) pairs: narration, then speech, then any
    narration after it. Text with no quotes comes back as one narrator fragment,
    which is what a line like "The droid is dark and unresponsive." should be."""
    parts: list[tuple[str, str]] = []
    cursor = 0
    for match in QUOTED.finditer(text):
        before = text[cursor:match.start()].strip()
        if before:
            parts.append(("narrator", before))
        spoken = (match.group(1) if match.group(1) is not None else match.group(2)).strip()
        if spoken:
            parts.append(("npc", spoken))
        cursor = match.end()
    tail = text[cursor:].strip()
    if tail:
        parts.append(("narrator", tail))
    return parts or [("narrator", text)]


def render_speech(events: list[Event],
                  pronouns: str | PronounSet | None = None) -> list[dict]:
    """The spoken turn, split by who is talking.

    The events already know: NpcSpoke is a character, everything else is the
    narrator. So handing a client the parts costs nothing structurally and lets it
    give the droid its own voice — which is the kind of thing that is either free or
    impossible depending on whether your prose came out of a data model or out of a
    language model.
    """
    parts: list[dict] = []
    for event in events:
        text = render_event(event, Style.SPEECH, pronouns)
        if not text:
            continue
        if event.type == "npc_spoke":
            # "R-6 boots with a rising whir" is the narrator describing a machine;
            # only what R-6 actually says belongs in R-6's voice.
            for voice, fragment in split_quoted(text):
                parts.append({
                    "voice": voice,
                    "speaker": event.npc.name if voice == "npc" else None,
                    "text": fragment,
                })
        else:
            parts.append({"voice": "narrator", "speaker": None, "text": text})
    return parts


def render_parse_error(err: ParseError) -> str:
    """Friendly, actionable text for input the dumb parser could not use."""
    match err.kind:
        case "unknown_verb":
            return f"I don't know the word '{err.verb}'. Type 'help' for commands."
        case "unknown_noun":
            return f"I don't see any '{err.noun}' here."
        case "ambiguous":
            names = [c.name for c in err.candidates or []]
            return f"Which do you mean: {_join(names, 'or')}?"
        case "missing_noun":
            return f"{(err.verb or '').title()} what?"
        case "elsewhere":
            return f"The {err.noun} isn't here — you last saw it in the {err.place}."
        case "no_route":
            return (f"You don't know a way to the {err.noun} from here yet."
                    if err.noun else "You don't know a way back from here.")
        case "empty":
            return "Please type a command, or 'help'."


def _room(event: RoomDescribed) -> str:
    lines = [f"== {event.room.name} ==", event.description]

    if event.exits:
        parts = []
        for exit_view in event.exits:
            if exit_view.door is None:
                parts.append(exit_view.direction)
            else:
                state = "open" if exit_view.door_open else "closed"
                parts.append(f"{exit_view.direction} (through the {exit_view.door.name}, {state})")
        lines.append(f"Exits: {', '.join(parts)}.")
    else:
        lines.append("Exits: none.")

    if event.items:
        lines.append(f"You see {_join([i.name for i in event.items])} here.")
    for npc in event.npcs:
        lines.append(f"{npc.name} is here.")

    return "\n".join(lines)


def _room_aloud(event: RoomDescribed) -> str:
    """A room, spoken.

    Three differences from the written version, each one a consequence of the ear
    rather than a preference. Decoration goes, because "== Crew Quarters ==" is read
    out as equals equals. Blocked ways get their own sentence instead of a
    parenthetical, because a listener cannot see brackets. And on a room the player
    has already stood in, the description is dropped entirely — hearing the same
    paragraph every time you cross the corridor is a tax that skimming never charges.
    """
    parts = [f"{event.room.name}."]
    if event.first_visit and event.description:
        parts.append(event.description)

    open_ways = [e.direction for e in event.exits if e.door is None or e.door_open]
    if open_ways:
        parts.append(f"You can go {_join(open_ways, 'or')}.")
    for blocked in (e for e in event.exits if e.door is not None and not e.door_open):
        parts.append(f"The {blocked.door.name} to the {blocked.direction} is closed.")
    if not event.exits:
        parts.append("There is no way out of here.")

    if event.items:
        parts.append(f"You can see {_join([_with_article(i.name) for i in event.items])}.")
    for npc in event.npcs:
        parts.append(f"{_with_article(npc.name).capitalize()} is here.")

    return " ".join(parts)


def _with_article(name: str) -> str:
    """Speech wants "a prybar", not "prybar". Proper nouns keep their own shape."""
    if name[:1].isupper():
        return name
    return f"{'an' if name[:1].lower() in 'aeiou' else 'a'} {name}"


def _failure(event: ActionFailed) -> str:
    if event.message:
        return event.message
    template = FAILURE_TEXT[event.reason]
    if "{name}" in template:
        if event.subject is None:
            return FAILURE_FALLBACK[event.reason]
        return template.format(name=event.subject.name)
    return template


def _join(names: list[str], conjunction: str = "and") -> str:
    """'a', 'a and b', 'a, b and c'."""
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    return f"{', '.join(names[:-1])} {conjunction} {names[-1]}"
