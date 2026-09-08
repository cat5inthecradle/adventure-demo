"""The deliberately dumb, offline command parser: text -> Action or ParseError.

Resolves names to entity IDs against what the player can currently see. It never
checks legality (a visible but non-portable item still parses into a Take — the
engine rejects it) and never mutates the world.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from adventure import queries
from adventure.actions import (
    Action,
    Drop,
    Examine,
    Go,
    Look,
    Open,
    Listen,
    ShowInventory,
    Take,
    Talk,
    Traverse,
    Use,
)
from adventure.events import EntityRef
from adventure.models import Direction, Door, Item, NPC, WorldState

PUNCTUATION = ".,!?'\""

# Nouns too generic to identify anything on their own. They can still appear inside
# a multi-word alias ("glowing thing" resolves fine), but a phrase made only of
# these matches nothing — otherwise one alias containing "thing" would make every
# sentence containing "thing" resolve to that entity.
GENERIC_TOKENS = {"thing", "things", "stuff", "one", "item", "object", "it"}

# Words that mean "where I am" rather than any object in it. `look around` is the
# most common thing a player types after the opening paragraph, and `look room` is
# what one typed at a world whose door happened to be called a room door.
SELF_TOKENS = {"around", "room", "here", "place", "surroundings", "everything"}

# Words a player asks questions with. They are in the vocabulary only so that the
# typo fixer leaves them alone: `where` is one edit from `here`, and a real player
# typing "where am i" was told the game did not know the word "here".
QUESTION_TOKENS = {"where", "what", "whats", "which", "who", "why", "how", "am", "is", "are", "do"}

# The plan's list plus the demonstratives, which T9 requires ("grab that battery").
FILLERS = {"the", "a", "an", "to", "at", "on", "in", "with", "up", "that", "this",
           "out", "from", "through", "my", "your"}

DIRECTIONS: dict[str, Direction] = {
    "north": "north", "n": "north",
    "south": "south", "s": "south",
    "east": "east", "e": "east",
    "west": "west", "w": "west",
    "up": "up", "u": "up",
    "down": "down", "d": "down",
}

VerbKind = Literal["look", "examine", "go", "take", "drop", "open", "use", "talk",
                   "inventory", "traverse", "listen"]

# Verb phrases, matched longest-first against the head of the input.
VERB_PHRASES: dict[tuple[str, ...], VerbKind] = {
    ("look",): "look",
    ("l",): "look",
    ("look", "at"): "examine",
    ("where", "am", "i"): "look",
    ("where", "are", "we"): "look",
    ("look", "under"): "examine",
    ("look", "in"): "examine",
    ("look", "inside"): "examine",
    ("look", "behind"): "examine",
    ("search",): "examine",
    ("examine",): "examine",
    ("check",): "examine",
    ("x",): "examine",
    ("inspect",): "examine",
    ("read",): "examine",
    ("go",): "go",
    ("walk",): "go",
    ("move",): "go",
    ("head",): "go",
    ("take",): "take",
    ("get",): "take",
    ("grab",): "take",
    ("pick", "up"): "take",
    ("drop",): "drop",
    ("put", "down"): "drop",
    ("open",): "open",
    ("crack", "open"): "open",
    ("unjam",): "open",
    ("pry",): "open",
    ("use",): "use",
    ("slot",): "use",
    ("yank",): "use",
    ("fix",): "use",
    ("turn", "on"): "use",
    ("switch", "on"): "use",
    ("pull",): "use",
    ("push",): "use",
    ("press",): "use",
    ("put",): "use",
    ("insert",): "use",
    ("give",): "use",
    ("listen",): "listen",
    ("listen", "at"): "listen",
    ("listen", "to"): "listen",
    ("listen", "through"): "listen",
    ("hear",): "listen",
    # Going through a named portal. "get in the pod" and "jump out the window" are
    # the same request — the player named the way through, not a compass bearing —
    # so they resolve the same way.
    ("enter",): "traverse",
    ("exit",): "traverse",
    ("board",): "traverse",
    ("get", "in"): "traverse",
    ("get", "into"): "traverse",
    ("get", "out"): "traverse",
    ("climb",): "traverse",
    ("climb", "in"): "traverse",
    ("climb", "into"): "traverse",
    ("climb", "out"): "traverse",
    ("climb", "out", "of"): "traverse",
    ("climb", "through"): "traverse",
    ("jump",): "traverse",
    ("jump", "out"): "traverse",
    ("jump", "out", "of"): "traverse",
    ("jump", "through"): "traverse",
    ("leap",): "traverse",
    ("leap", "out"): "traverse",
    ("leap", "out", "of"): "traverse",
    ("leap", "through"): "traverse",
    ("crawl",): "traverse",
    ("crawl", "through"): "traverse",
    ("squeeze", "through"): "traverse",
    ("go", "through"): "traverse",
    ("go", "out"): "traverse",
    ("go", "out", "of"): "traverse",
    ("talk", "to"): "talk",
    ("talk",): "talk",
    ("speak", "to"): "talk",
    ("speak",): "talk",
    ("ask",): "talk",
    ("wake",): "talk",
    ("wake", "up"): "talk",
    ("inventory",): "inventory",
    ("i",): "inventory",
    ("inv",): "inventory",
}

MAX_PHRASE_LEN = max(len(phrase) for phrase in VERB_PHRASES)

# Prepositions that separate "use X on Y" into its two nouns (instrument first).
USE_PREPOSITIONS = ("on", "with", "into", "in", "to")

# For opening verbs the operands are the other way round: "open the crate WITH the
# prybar" names the target first and the instrument second, so it becomes
# Use(prybar, crate) — not Open(crate).
INSTRUMENT_PREPOSITIONS = ("with", "using")


@dataclass
class ParseError:
    kind: Literal["empty", "unknown_verb", "unknown_noun", "ambiguous",
                  "missing_noun", "no_route", "elsewhere"]
    verb: str | None = None
    noun: str | None = None
    candidates: list[EntityRef] | None = None   # for "ambiguous"
    place: str | None = None                    # for "elsewhere": the room's NAME
    place_id: str | None = None                 # for "elsewhere": the room's id


def parse(world: WorldState, text: str) -> Action | ParseError:
    """Turn a line of terse player input into an Action, or explain why not."""
    tokens = _normalize(text)
    if not tokens:
        return ParseError(kind="empty")
    tokens = _fix_typos(tokens, _vocabulary(world))

    if tokens[0] in DIRECTIONS:
        return Go(direction=DIRECTIONS[tokens[0]])

    match = _match_verb(tokens)
    if match is None:
        return ParseError(kind="unknown_verb", verb=tokens[0])
    phrase, kind = match
    verb = " ".join(phrase)
    rest = tokens[len(phrase):]

    match kind:
        case "look":
            nouns = _strip_fillers(rest)
            if not nouns:
                return Look()
            return _examine(world, nouns)
        case "examine":
            return _with_noun(world, verb, rest, _examine)
        case "go":
            return _go(world, verb, rest)
        case "take":
            return _with_noun(world, verb, rest, _take)
        case "drop":
            return _with_noun(world, verb, rest, _drop)
        case "open":
            return _open_phrase(world, verb, rest)
        case "use":
            return _use(world, verb, rest)
        case "talk":
            return _with_noun(world, verb, rest, _talk)
        case "traverse":
            return _with_noun(world, verb, rest, _traverse)
        case "listen":
            # Listening at nothing in particular is listening to the room, which is
            # always a legitimate thing to do and always has an answer.
            nouns = _strip_fillers(rest)
            if not nouns:
                return Listen()
            resolved = _resolve(world, nouns)
            return resolved if isinstance(resolved, ParseError) else Listen(target=resolved)
        case "inventory":
            return ShowInventory()


def _normalize(text: str) -> list[str]:
    """Lowercase, drop punctuation, split on whitespace."""
    cleaned = "".join(" " if ch in PUNCTUATION else ch for ch in text.lower())
    return cleaned.split()


# --- typo tolerance ----------------------------------------------------------
#
# Real players mistype, and a typo used to cost a full round trip to the language
# model — in one logged playthrough seven turns were lost that way, including the
# one that would have solved a puzzle ("open teh crate using the prybar" parses
# perfectly without the "teh"). Correcting obvious slips locally is faster, free,
# and works with the assistant switched off.
#
# The safety rule is that a word already in the world's vocabulary is NEVER
# altered, and a correction must be unambiguous — if a token sits equally close to
# two known words we leave it alone and let the normal error path explain itself.


def _typo_budget(word: str) -> int:
    """How wrong a word may be before we stop guessing. Short words get no slack:
    'gem' and 'get' are one edit apart and mean entirely different things."""
    if len(word) <= 2:
        return 0
    if len(word) <= 5:
        return 1
    return 2


def _edit_distance(a: str, b: str, limit: int) -> int:
    """Optimal string alignment distance: insert, delete, substitute, or swap two
    adjacent characters. Swaps count as one because they are the typo people
    actually make — 'teh' for 'the', 'opne' for 'open'."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    previous_previous: list[int] = []
    previous = list(range(len(b) + 1))
    for i, ch_a in enumerate(a, start=1):
        current = [i] + [0] * len(b)
        for j, ch_b in enumerate(b, start=1):
            cost = 0 if ch_a == ch_b else 1
            current[j] = min(
                previous[j] + 1,            # delete
                current[j - 1] + 1,         # insert
                previous[j - 1] + cost,     # substitute
            )
            if (i > 1 and j > 1 and ch_a == b[j - 2] and a[i - 2] == ch_b):
                current[j] = min(current[j], previous_previous[j - 2] + cost)
        if min(current) > limit:
            return limit + 1
        previous_previous, previous = previous, current
    return previous[len(b)]


def _vocabulary(world: WorldState) -> set[str]:
    """Every word this world expects a player to type, right here, right now."""
    words: set[str] = set(FILLERS) | set(DIRECTIONS) | SELF_TOKENS | QUESTION_TOKENS
    for phrase in VERB_PHRASES:
        words.update(phrase)
    for entity in queries.visible_entities(world):
        words |= _entity_tokens(entity)
    for room in world.rooms.values():
        words.update(room.name.lower().split())
    return words


def _is_transposition(a: str, b: str) -> bool:
    """True when b is a with one adjacent pair swapped — 'opne' for 'open'."""
    if len(a) != len(b):
        return False
    differing = [i for i, (x, y) in enumerate(zip(a, b)) if x != y]
    return (len(differing) == 2 and differing[1] == differing[0] + 1
            and a[differing[0]] == b[differing[1]] and a[differing[1]] == b[differing[0]])


def _fix_typos(tokens: list[str], vocabulary: set[str]) -> list[str]:
    """Nudge unknown words toward known ones. Never touches a word we recognise.

    The first token decides what the game *does*, so it gets a stricter rule: a
    short one is only corrected by an adjacent swap, never a substitution. English
    is full of four-letter verbs one substitution apart from ours — a real player
    typed `wake droid` and was quietly given `take droid`, and "You can't take
    the droid" is a worse answer than admitting the verb is unknown.
    """
    fixed: list[str] = []
    for position, token in enumerate(tokens):
        if token in vocabulary:
            fixed.append(token)
            continue
        budget = _typo_budget(token)
        if budget == 0:
            fixed.append(token)
            continue
        best: list[str] = []
        best_distance = budget + 1
        for word in vocabulary:
            distance = _edit_distance(token, word, budget)
            if distance < best_distance:
                best, best_distance = [word], distance
            elif distance == best_distance:
                best.append(word)
        # One clear winner, or we keep the player's word and explain ourselves.
        won = best_distance <= budget and len(best) == 1
        if won and position == 0 and len(token) <= 4 and not _is_transposition(token, best[0]):
            won = False
        fixed.append(best[0] if won else token)
    return fixed


def _strip_fillers(tokens: list[str]) -> list[str]:
    return [token for token in tokens if token not in FILLERS]


def _match_verb(tokens: list[str]) -> tuple[tuple[str, ...], VerbKind] | None:
    """Longest verb phrase at the head of the input wins."""
    for length in range(min(MAX_PHRASE_LEN, len(tokens)), 0, -1):
        phrase = tuple(tokens[:length])
        if phrase in VERB_PHRASES:
            return phrase, VERB_PHRASES[phrase]
    return None


def _with_noun(
    world: WorldState,
    verb: str,
    rest: list[str],
    build: Callable[[WorldState, list[str]], Action | ParseError],
) -> Action | ParseError:
    """Shared shape for verbs that need exactly one noun."""
    nouns = _strip_fillers(rest)
    if not nouns:
        return ParseError(kind="missing_noun", verb=verb)
    return build(world, nouns)


def _examine(world: WorldState, nouns: list[str]) -> Action | ParseError:
    if set(nouns) <= SELF_TOKENS:
        return Look()
    resolved = _resolve(world, nouns)
    return resolved if isinstance(resolved, ParseError) else Examine(target=resolved)


def _take(world: WorldState, nouns: list[str]) -> Action | ParseError:
    resolved = _resolve(world, nouns)
    return resolved if isinstance(resolved, ParseError) else Take(item=resolved)


def _drop(world: WorldState, nouns: list[str]) -> Action | ParseError:
    resolved = _resolve(world, nouns)
    return resolved if isinstance(resolved, ParseError) else Drop(item=resolved)


def _open(world: WorldState, nouns: list[str]) -> Action | ParseError:
    resolved = _resolve(world, nouns)
    return resolved if isinstance(resolved, ParseError) else Open(target=resolved)


def _open_phrase(world: WorldState, verb: str, rest: list[str]) -> Action | ParseError:
    """'open X' opens; 'open X with Y' uses Y on X."""
    target_tokens, instrument_tokens = _split_on(rest, INSTRUMENT_PREPOSITIONS)
    if instrument_tokens is None:
        return _with_noun(world, verb, rest, _open)

    target_tokens = _strip_fillers(target_tokens)
    instrument_tokens = _strip_fillers(instrument_tokens)
    if not target_tokens or not instrument_tokens:
        return ParseError(kind="missing_noun", verb=verb)

    target = _resolve(world, target_tokens)
    if isinstance(target, ParseError):
        return target
    instrument = _resolve(world, instrument_tokens)
    if isinstance(instrument, ParseError):
        return instrument
    return Use(item=instrument, target=target)


def _traverse(world: WorldState, nouns: list[str]) -> Action | ParseError:
    """Going through something implies going to it.

    The player named the way through rather than a bearing, which can mean four
    different things depending on what the name turns out to be — a door in this
    room, a thing they saw elsewhere, a room they have heard of, or something right
    here that is not a portal at all. Only the last is a Use.

    "enter the pod" from three rooms away is a statement of intent, not a mistake,
    so it walks one step along the known route. Bare `use` deliberately does NOT do
    this: "use the prybar" when you left it behind should say so, not quietly march
    you across the ship.
    """
    resolved = _resolve(world, nouns)
    if isinstance(resolved, str) and resolved in world.doors:
        # Nobody enters a door; they go through it. "get in the pod" in a corridor
        # whose pod bay door answers to "pod" means the bay, not the doorway.
        return Traverse(target=resolved)
    if isinstance(resolved, ParseError):
        if resolved.kind == "elsewhere" and resolved.place_id is not None:
            return _step_toward(world, resolved.place_id)
        # You can head for a place you have only heard of, even before you have
        # laid eyes on what is inside it: "enter the pod" from the corridor.
        room_id = _resolve_room(world, nouns)
        if room_id is not None:
            return _step_toward(world, room_id)
        return resolved
    return Use(item=resolved)


def _talk(world: WorldState, nouns: list[str]) -> Action | ParseError:
    resolved = _resolve(world, nouns)
    return resolved if isinstance(resolved, ParseError) else Talk(npc=resolved)


def _go(world: WorldState, verb: str, rest: list[str]) -> Action | ParseError:
    """Directions are matched before fillers are stripped, so 'go up' survives.

    Failing a direction, the player may have named a destination instead — "go to
    the cargo bay", "go back". People navigate by where they are headed, not by
    compass bearing, and the map is right here.
    """
    if not rest:
        return ParseError(kind="missing_noun", verb=verb)
    for token in rest:
        if token in DIRECTIONS:
            return Go(direction=DIRECTIONS[token])

    nouns = _strip_fillers(rest)
    if nouns in (["back"], ["backwards"], ["around"]):
        if world.previous_location is None:
            return ParseError(kind="no_route", noun="back")
        return _step_toward(world, world.previous_location)

    room_id = _resolve_room(world, nouns) if nouns else None
    if room_id is not None:
        return _step_toward(world, room_id)
    return ParseError(kind="unknown_noun", noun=" ".join(nouns or rest))


def _step_toward(world: WorldState, room_id: str) -> Action | ParseError:
    """One step along the shortest route the player actually knows."""
    if room_id == world.player_location:
        return ParseError(kind="no_route", noun=world.rooms[room_id].name)
    direction = queries.first_step_toward(world, room_id)
    if direction is None:
        return ParseError(kind="no_route", noun=world.rooms[room_id].name)
    return Go(direction=direction)


def _resolve_room(world: WorldState, tokens: list[str]) -> str | None:
    """Match a phrase against room names. Rooms only — 'the pod' means the pod bay
    when you are travelling, even though an escape pod is also a thing you can hold
    a conversation about."""
    phrase = " ".join(tokens)
    exact = [r for r in world.rooms.values() if phrase == r.name.lower()]
    if len(exact) == 1:
        return exact[0].id
    wanted = set(tokens)
    partial = [r for r in world.rooms.values() if wanted <= set(r.name.lower().split())]
    return partial[0].id if len(partial) == 1 else None


def _use(world: WorldState, verb: str, rest: list[str]) -> Action | ParseError:
    left, right = _split_on_preposition(rest)
    item_tokens = _strip_fillers(left)
    if not item_tokens:
        return ParseError(kind="missing_noun", verb=verb)

    item = _resolve(world, item_tokens)
    if isinstance(item, ParseError):
        return item
    if right is None:
        # "use the door" is how people say "open the door" — a door is not a tool.
        # "use the door" is how people say "open the door" — a door is not a tool.
        if item in world.doors:
            return Open(target=item)
        return Use(item=item)

    target_tokens = _strip_fillers(right)
    if not target_tokens:
        return ParseError(kind="missing_noun", verb=verb)
    target = _resolve(world, target_tokens)
    if isinstance(target, ParseError):
        return target
    return Use(item=item, target=target)


def _split_on_preposition(tokens: list[str]) -> tuple[list[str], list[str] | None]:
    """Split 'power cell on droid' into (['power','cell'], ['droid'])."""
    return _split_on(tokens, USE_PREPOSITIONS)


def _split_on(
    tokens: list[str], prepositions: tuple[str, ...]
) -> tuple[list[str], list[str] | None]:
    for index, token in enumerate(tokens):
        if token in prepositions and index > 0:
            return tokens[:index], tokens[index + 1:]
    return tokens, None


def _resolve(world: WorldState, tokens: list[str]) -> str | ParseError:
    """Match a noun phrase against everything the player can currently refer to."""
    phrase = " ".join(tokens)
    candidates = queries.visible_entities(world)

    exact = [
        entity
        for entity in candidates
        if phrase == entity.name.lower() or phrase in {alias.lower() for alias in entity.aliases}
    ]
    matches = exact
    if not matches and not set(tokens) <= GENERIC_TOKENS:
        wanted = set(tokens)
        matches = [entity for entity in candidates if wanted <= _entity_tokens(entity)]

    if not matches:
        # Not here — but the player may have seen it somewhere they have been.
        # Saying where beats "I don't see any 'prybar' here" when they left it
        # two rooms back and know perfectly well it exists.
        def is_wanted(entity) -> bool:
            return (phrase == entity.name.lower()
                    or phrase in {a.lower() for a in entity.aliases}
                    or (not set(tokens) <= GENERIC_TOKENS
                        and set(tokens) <= _entity_tokens(entity)))

        found = queries.locate_in_known_rooms(world, is_wanted)
        if found is not None:
            entity, room_id = found
            return ParseError(kind="elsewhere", noun=entity.name,
                              place=world.rooms[room_id].name, place_id=room_id)
        return ParseError(kind="unknown_noun", noun=phrase)
    if len(matches) > 1:
        return ParseError(
            kind="ambiguous",
            noun=phrase,
            candidates=[queries.entity_ref(entity) for entity in matches],
        )
    return matches[0].id


def _entity_tokens(entity: Item | NPC | Door) -> set[str]:
    """Every word in an entity's name and aliases, lowercased."""
    words = entity.name.lower().split()
    for alias in entity.aliases:
        words.extend(alias.lower().split())
    return set(words)
