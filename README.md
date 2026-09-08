# The Accessible Space Adventure

A small, Zork-inspired sci-fi text adventure built around one constraint:

> **The LLM may understand what the player means, but it never gets to decide what is true.**

The game is a deterministic engine. World state goes in, an action is checked against
the rules, the world mutates, and typed *events* come out. Everything else — the terse
command parser, the optional language assistant, the text renderer — is an interface
sitting outside that core. Turn the language model off, unplug the network, and you are
playing exactly the same game.

That separation is also what makes the game modality-independent. Events carry
structured facts, not formatted prose, so a text renderer, a speech renderer, or a
Braille renderer are all just different consumers of the same events. Accessibility
isn't bolted on afterwards; there is no visual "real" version to bolt it onto. See
[pitch.md](pitch.md) for the idea, [MVP-Plan.md](MVP-Plan.md) for how it was built,
and [ROADMAP.md](ROADMAP.md) for what comes next.

*This repository is the engine and its demo world. Story worlds authored on top of it
live elsewhere and are not part of this cut, so a few roadmap items talk about
authoring features whose content you will not find here.*

## Install

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Play

```bash
adventure
```

You wake aboard the *SS Wayfarer*, a freighter drifting dead in space. Restore main
power and get off the ship. Type `help` for the command list.

```
--world PATH       a different world file (default: worlds/wayfarer.json)
--save-dir PATH    where saved games live (default: ./saves)
```

`pronouns he` (or `she`, or `they`) sets how the game refers to your character; the
web version has the same choice in Settings. Worlds declare the default their prose
was written for, and prose that has to name you in the third person writes a token
rather than a word — see [docs/AUTHORING.md](docs/AUTHORING.md).

The Wayfarer is the world in this repository. The engine also supports counters,
timed deaths, triggers that fire on where the player is standing, and endings other
than winning — none of which this world uses, all of which are covered by the tests
and documented in [docs/AUTHORING.md](docs/AUTHORING.md).

## The optional language assistant

Without it, you play in terse commands: `take power cell`, `use prybar on crate`,
`go north`. With it, the same engine also understands "grab that glowing battery thing
and stick it in the robot" — the model translates the sentence into one structured
action, and the engine decides whether it is legal.

Put your key in a `.env` file (gitignored, never commit it):

```bash
cp .env.example .env    # then edit it
```

Or export it:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

```
--llm auto     use the assistant when a key is present (default)
--llm on       always try
--llm off      never — fully offline
--model NAME   default claude-sonnet-5, or set ANTHROPIC_MODEL
```

Terse commands never reach the network: the offline parser runs first, and only lines
it cannot use are sent on. The model is given a deliberately small snapshot of what you
can currently see, and can only answer with a fixed schema of entity IDs drawn from
that snapshot. If it names something you cannot see, the answer is discarded and you
get a clarifying question instead. If the API is unreachable, the game says so and
carries on offline.

## Architecture

```
                 player input (text)
                        │
              ┌─────────▼──────────┐
              │      cli.py        │  REPL, meta commands, input routing
              └──┬──────────────┬──┘
       (terse)   │              │   (natural language, optional)
        ┌────────▼───┐    ┌─────▼──────────┐
        │ parser.py  │    │    nlu.py      │  NLUProvider → Anthropic API
        │ (dumb,     │    │ utterance →    │  returns Action OR a
        │  offline)  │    │ Action/clarify │  clarifying question
        └────────┬───┘    └─────┬──────────┘
                 │   Action     │   Action
              ┌──▼──────────────▼──┐
              │     engine.py      │  validates legality, mutates WorldState,
              │  apply(world, a)   │  returns list[Event]   ← ONLY source of truth
              └─────────┬──────────┘
                        │  list[Event]  (typed, no prose formatting decisions)
              ┌─────────▼──────────┐
              │    renderer.py     │  Event → text (speech/braille renderers later)
              └────────────────────┘
```

Four rules hold this together:

1. Only `engine.apply()` mutates `WorldState`. Parser, NLU, renderer, and CLI never do.
2. The parser and NLU produce `Action` objects referencing entity IDs, never free text.
   They resolve names to IDs but do not check legality — the engine does.
3. Events carry structured data plus content strings copied from world data. The
   renderer formats them into prose; it never invents facts.
4. No I/O, no randomness, no clock in `models`, `engine`, `parser`, `renderer`,
   `queries`, `events`, `actions`. I/O lives in `cli.py`, `persistence.py`,
   `loader.py`, and `nlu.py`.

## Writing your own world

Prose is editable as Markdown rather than JSON — `python scripts/prose.py extract
worlds/mine.json` writes a `.prose.md` where every block is one string the player
reads, and `apply` puts your edits back after checking the world still loads.

**See [docs/AUTHORING.md](docs/AUTHORING.md)** for a practical guide with worked examples — how to give scenery a response, how to
telegraph an obstacle, and the naming rules that keep a level unambiguous.

A world is a single JSON file — a serialized `WorldState`, validated on load. Start
from [worlds/wayfarer.json](worlds/wayfarer.json) and read the models in
[src/adventure/models.py](src/adventure/models.py); the loader will tell you, by name,
about any room, door, item, NPC, interaction, or effect that doesn't line up.

The moving parts are: **rooms** with exits (optionally through a **door**), **items**
that live in a room, in your inventory, or `hidden` until revealed, **NPCs** with an
ordered list of dialogue rules, **interactions** describing `use X [on Y]`,
**triggers** — the rules the world runs on where the player is standing rather than
what they aimed at — and **flags** and **counters**, the booleans and integers that
gate everything else. Rooms and items can carry an `alt_description` shown once a flag
flips, which is how the Wayfarer's corridor lights up when main power comes back.

```bash
adventure --world worlds/mine.json
```

## Tests

```bash
pytest -q
```

No test touches the network — the Anthropic client is mocked. The suite covers the
data contracts, world validation, every engine rule and failure reason, the parser
grammar, renderer templates, save/load, the shipped adventure's content, a full
golden-path playthrough, and the NLU contract and routing.

### Choosing a model

`claude-sonnet-5` (the default) and `claude-opus-5` both play the Wayfarer end to end
in plain English. `claude-haiku-4-5-20251001` is cheaper and faster but over-clarifies:
asked to "pick up that steel bar" in a room containing exactly one bar, it reliably
asks which bar you mean instead of taking it. It is still a perfectly good choice if
you type mostly terse commands, since those never reach the model at all.
