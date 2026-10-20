# The Accessible Space Adventure

A small, Zork-inspired sci-fi text adventure built around one constraint:

> **The LLM may understand what the player means, but it never gets to decide what is true.**

The game is a deterministic engine. World state goes in, an action is checked against
the rules, the world mutates, and typed *events* come out. Everything else — the terse
command parser, the optional language model, the text renderer — is an interface
sitting outside that core. Turn the language model off, unplug the network, and you are
playing exactly the same game.

That separation is also what makes the game modality-independent. Events carry
structured facts, not formatted prose, so a text renderer, a speech renderer, or a
Braille renderer are all just different consumers of the same events. Accessibility
isn't bolted on afterwards; there is no visual "real" version to bolt it onto. See
[pitch.md](pitch.md) for the idea and [ROADMAP.md](ROADMAP.md) for what comes next.

It runs entirely in the browser as **Adventure Lab**: the game on the left, and on the
right a step-by-step view of how each command was understood and what it changed —
a demo you can look under the hood of.

*This repository is the engine and its demo world. Story worlds authored on top of it
live elsewhere and are not part of this cut, so a few roadmap items talk about
authoring features whose content you will not find here.*

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

You wake aboard the *Wayfarer*, a freighter drifting dead in space. Restore main
power and get off the ship. Type `help` for the command list.

The app is in [web/](web/); [web/README.md](web/README.md) has the details. It is
deployed on CodeAI Cloud at https://adventure-lab.internal.code.org/ (code.org
accounts only).

### Looking under the hood

- **How it was understood** — every command, drawn as the pipeline it went through:
  tokens, typo fixes, verb match, noun resolution, the action, the engine's events,
  the exact world values that changed, and the rendered prose. Click any command you
  typed to see its steps again. **Pace** in the top bar slows each turn down so you
  can watch it move through the system; Esc skips ahead.
- **World** — a map of the rooms you know, what is here and what you carry, and the
  raw flags, doors and item locations, with the last turn's changes highlighted.
- **Benchmark** — 59 sentences the parser can't understand, run through the language
  model and scored, with every prompt open for inspection.

`pronouns he` (or `she`, or `they`) sets how the game refers to your character. Worlds
declare the default their prose was written for, and prose that has to name you in
the third person writes a token rather than a word — see
[docs/AUTHORING.md](docs/AUTHORING.md). `undo`, `restart`, `save` and `load` work as
you'd expect; saves live in the browser.

The Wayfarer is the world in this repository. The engine also supports counters,
timed deaths, triggers that fire on where the player is standing, and endings other
than winning — none of which this world uses, all of which are documented in
[docs/AUTHORING.md](docs/AUTHORING.md).

## The optional language model

Without it, you play in terse commands: `take power cell`, `use prybar on crate`,
`go north`. With it, the same engine also understands "stick the battery in the
robot" — a small model translates the sentence into one structured action, and the
engine decides whether it is legal.

Pick a model from **Interpreter** in the top bar. It runs in your browser on the GPU
(WebGPU), so nothing you type leaves the machine; the first time, the model is
downloaded and cached (about 1–2 GB). The recommended one, Qwen2.5 1.5B, gets 80% of
the benchmark right.

Terse commands never reach the model: the parser runs first, and only lines it cannot
use are passed on. The model is given a deliberately small snapshot of what you can
currently see, and its output is constrained to a schema of entity IDs drawn from that
snapshot. It also rephrases the request in plain words, which goes back through the
parser — so the deterministic parser, not the model, makes the final match to what is
in the room. If it names something you cannot see, you are told so instead.

## Architecture

```
                 player input (text)
                        │
              ┌─────────▼──────────┐
              │      turn.js       │  input routing: parser first, interpreter second
              └──┬──────────────┬──┘
       (terse)   │              │   (natural language, optional)
        ┌────────▼───┐    ┌─────▼──────────┐
        │ parser.js  │    │ interpreter    │  WebLLM in a Web Worker; returns an
        │ (dumb,     │    │ utterance →    │  Action, a rephrasing the parser
        │  offline)  │    │ Action/clarify │  re-reads, or a clarifying question
        └────────┬───┘    └─────┬──────────┘
                 │   Action     │   Action
              ┌──▼──────────────▼──┐
              │     engine.js      │  validates legality, mutates the world,
              │  apply(world, a)   │  returns events   ← ONLY source of truth
              └─────────┬──────────┘
                        │  events  (typed, no prose formatting decisions)
              ┌─────────▼──────────┐
              │    renderer.js     │  event → text, written or spoken register
              └────────────────────┘
```

All of it is in [web/src/engine/](web/src/engine/), with no UI code; the Vue
components only draw what it returns. Four rules hold this together:

1. Only `engine.apply()` mutates the world. Parser, interpreter, renderer, and UI never do.
2. The parser and interpreter produce actions referencing entity IDs, never free text.
   They resolve names to IDs but do not check legality — the engine does.
3. Events carry structured data plus content strings copied from world data. The
   renderer formats them into prose; it never invents facts.
4. No I/O, no randomness, no clock in the engine, parser, renderer or queries. The
   language model, the browser's storage and the clock live outside
   `web/src/engine/`.

## Writing your own world

**See [docs/AUTHORING.md](docs/AUTHORING.md)** for a practical guide with worked
examples — how to give scenery a response, how to telegraph an obstacle, and the
naming rules that keep a level unambiguous.

A world is a single JSON file, validated on load. Start from
[worlds/wayfarer.json](worlds/wayfarer.json); the field-by-field shape, with defaults,
is in [web/src/engine/models.js](web/src/engine/models.js), and the loader will tell
you, by name, about any room, door, item, NPC, interaction, or effect that doesn't
line up.

The moving parts are: **rooms** with exits (optionally through a **door**), **items**
that live in a room, in your inventory, or `hidden` until revealed, **NPCs** with an
ordered list of dialogue rules, **interactions** describing `use X [on Y]`,
**triggers** — the rules the world runs on where the player is standing rather than
what they aimed at — and **flags** and **counters**, the booleans and integers that
gate everything else. Rooms and items can carry an `alt_description` shown once a flag
flips, which is how the Wayfarer's corridor lights up when main power comes back.

## Tests

```bash
cd web
npm test
```

No test touches the network or needs a GPU. The suite covers world validation, the
parser, the turn routing and interpreter contract, pronouns, and a golden test that
replays two full sessions — the winning path and a long wander through typos,
failures and dead ends — and checks every response, written and spoken, word for
word. When a change is meant to alter what the player sees, re-record it with
`npm run golden` and commit the diff alongside the change.
