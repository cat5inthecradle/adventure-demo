"""The player character's pronouns, and the prose that has to agree with them.

The protagonist is addressed as "you" almost everywhere, which is why this is cheap
to add now and expensive to add later: today there is nothing to convert. But "you"
runs out the moment anyone in the world talks *about* the player — a droid making a
report, a companion arguing for you across a room — and at that point the author
needs somewhere to put a pronoun that is not a guess.

So prose writes a token instead of a word:

    "{They} came aboard alone," R-6 reports. "{They} {are} still in the hold."

and this module turns it into "He came in", "She came in", or "They came in",
depending on what the player chose. Substitution happens when prose is *rendered*,
never when it is loaded, so a player can change their mind mid-game and the next
sentence obeys — including the sentences already written into a saved game.

The hard part of pronoun templating is not the pronouns; it is the verbs that have
to agree with them. "They walks away" is the failure mode that makes people give up
on this and hand-write three versions of every line, so the token set includes verb
agreement: `{s}` for the regular ending, and explicit tokens for the four irregular
verbs that carry most English sentences.
"""

import re
from dataclasses import dataclass

# Reads as a plural for verb agreement, even though it is one person.
PLURAL = "they"


@dataclass(frozen=True)
class PronounSet:
    id: str
    label: str                     # what the settings menu shows
    subject: str                   # they  — {they} walks in
    object: str                    # them  — she tells {them}
    possessive: str                # their — {their} pack
    possessive_pronoun: str        # theirs — the pack is {theirs}
    reflexive: str                 # themselves — {they} let {themselves} in

    @property
    def plural(self) -> bool:
        """Whether verbs after this pronoun take the plural form."""
        return self.id == PLURAL


SETS: dict[str, PronounSet] = {
    "he": PronounSet("he", "he / him", "he", "him", "his", "his", "himself"),
    "she": PronounSet("she", "she / her", "she", "her", "her", "hers", "herself"),
    "they": PronounSet("they", "they / them", "they", "them", "their", "theirs",
                       "themselves"),
}

# Neutral until the player says otherwise. A world may name a different default —
# see WorldState.pronouns — but nothing in this codebase ever infers one.
DEFAULT = "they"


def resolve(pronouns: "str | PronounSet | None") -> PronounSet:
    """Accept an id, a set, or nothing, and always return a set.

    Unknown ids fall back to the default rather than raising: a stale save or a
    hand-edited world file should not be able to crash the renderer. Input that
    reaches the API is validated there, where a 400 can be returned.
    """
    if isinstance(pronouns, PronounSet):
        return pronouns
    return SETS.get(pronouns or DEFAULT, SETS[DEFAULT])


def _words(pset: PronounSet) -> dict[str, str]:
    """Every token, lowercase, mapped to what it becomes for this set.

    Verb tokens are named after their they/them form, so a sentence reads correctly
    as written before it is ever substituted: "{they} {are} already at the door" is
    grammatical on the page, which is the difference between prose an author can
    edit and a template they have to compile in their head.
    """
    plural = pset.plural
    return {
        "they": pset.subject,
        "them": pset.object,
        "their": pset.possessive,
        "theirs": pset.possessive_pronoun,
        "themselves": pset.reflexive,
        # Verb agreement. The regular ending covers most verbs: "{they} walk{s}".
        "s": "" if plural else "s",
        "es": "" if plural else "es",
        # ...and these four irregulars cover most of the rest.
        "are": "are" if plural else "is",
        "were": "were" if plural else "was",
        "have": "have" if plural else "has",
        "do": "do" if plural else "does",
    }


TOKENS: tuple[str, ...] = tuple(_words(SETS[DEFAULT]))

# Only word-shaped braces are candidates. Anything else — a stray brace, JSON in a
# description, a set of coordinates — is left exactly as the author wrote it.
_TOKEN = re.compile(r"\{([A-Za-z]+)\}")


def apply(text: str, pronouns: "str | PronounSet | None" = None) -> str:
    """Substitute pronoun tokens in one string.

    Unknown tokens are left alone rather than blanked. A typo like `{thier}` should
    reach the author as a visible `{thier}` in the transcript and as a linter
    finding — silently deleting it would hide the mistake in the one place nobody
    is looking.
    """
    if "{" not in text:                       # the overwhelmingly common case
        return text
    words = _words(resolve(pronouns))

    def swap(match: re.Match[str]) -> str:
        token = match.group(1)
        word = words.get(token.lower())
        if word is None:
            return match.group(0)
        # {They} -> "He"; {they} -> "he". Empty replacements ({s} on a plural)
        # have no case to preserve.
        return word[:1].upper() + word[1:] if token[:1].isupper() and word else word

    return _TOKEN.sub(swap, text)


def unknown_tokens(text: str) -> list[str]:
    """Brace tokens this module does not recognise, for the world linter."""
    return [m.group(0) for m in _TOKEN.finditer(text)
            if m.group(1).lower() not in _words(SETS[DEFAULT])]


def options() -> list[dict[str, str]]:
    """What a settings menu needs to draw the choice, including a line of prose
    that changes visibly when you pick a different one."""
    return [
        {"id": pset.id, "label": pset.label, "example": apply(EXAMPLE, pset)}
        for pset in SETS.values()
    ]


# Deliberately exercises a pronoun, a possessive, and verb agreement at once, so
# the preview in the settings panel shows the part that is easy to get wrong.
EXAMPLE = "R-6 watches {them} go. {They} {are} already looking for {their} ship."
