# Adventure Lab (web)

The game, its engine and its tools, running entirely in the browser. The page is a
Vue 3 app with three views, kept in the URL hash:

- **Learn** (no hash, or `#learn/hoai-adventure/1/1`): the six-level Hour of AI
  lesson. It is the front door: an address with no view in it opens the lesson at
  the level the student was last on. Phones open Play instead, because the lesson
  needs a bigger screen.
- **Play** (`#play`): the full game, the Wayfarer. A 4:3 terminal on the left, and on the right a panel that
  shows step by step how each command was understood, plus a world panel (map,
  room, raw state).
- **Benchmark** (`#bench`): scores the optional language model.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # golden, engine, lesson and benchmark-fixture tests
npm run golden   # re-record the golden sessions (see Tests)
npm run check-world -- ../worlds/yours.json   # validate a world file
```

The world is `../worlds/wayfarer.json`, imported at the top of `src/game.js`.

## Layout

| Path | What it is |
|---|---|
| `src/engine/` | The game, with no UI or Vue imports: `engine.js` (the only thing that mutates a world), `parser.js`, `renderer.js`, `loader.js`, `turn.js` (input routing) |
| `src/engine/interpreter.js` | The plug-in point for an LLM (see below) |
| `src/game.js` | The play session: scrollback, turn history, undo, saves, meta commands |
| `src/App.vue` | The top bar, the three views, restart, and the phone layout |
| `src/components/` | Terminal, parser panel, world panel, interpreter picker, benchmark view, the lesson view and its add-a-thing form |
| `src/llm/` | The WebLLM interpreter: models, prompts, and the Web Worker it runs in |
| `src/storage.js` | Browser storage, or nothing when the browser blocks it |
| `src/bench/cases.js`, `tests/fixtures/nl_cases.json` | The interpreter benchmark: cases, replay, scoring |
| `src/lesson/` | The Hour of AI lesson host (`LessonController.js`) and the add-a-thing edit (`addThing.js`) |
| `src/engine/merge.js` | Applies an edited world to a game in progress |
| `tests/golden.test.js`, `scripts/golden.js` | Replays two scripted sessions and checks every response, written and spoken, against `tests/fixtures/golden.json` |
| `scripts/check-world.js` | Validates a world file from the command line |

The architecture's rules still hold. Only `engine.apply()` mutates the world.
The parser and interpreter produce actions that refer to things by id. The
renderer never makes up facts.

## On phones

The layout is built for landscape screens, with the terminal and the panels side
by side. Narrower than 700px, or shorter than 500px (a phone on its side), it
switches to one thing at a time:

- Play stacks into a single column, with **Game / Understood / World** tabs.
  Tapping a command you typed opens Understood for it.
- The app is sized to the part of the screen the keyboard leaves visible, so
  the prompt and the latest lines stay in view. "Esc to skip" becomes "tap to
  skip".
- Phones play with the parser alone. The model picker and the Benchmark tab are
  hidden, because most phones can't run the 1–2 GB models.

## Learn

The Learn view is the small Studio/Lab2-style host for the Hour of AI unit. Its
hash route resolves one level, starts or restores that level's project world,
feeds play and UI events to the Adventure validator, and enables Continue when
the Lab2 progress state is satisfied. Phones show a note instead; the lesson is
designed for a Chromebook, tablet or laptop.

The course data uses Code.org's Lab2 shapes: `curriculum/hour-of-ai/unit.json`
is the script structure, and `curriculum/hour-of-ai/level_properties.json` is
the id-keyed level-properties map. `src/lab2/` resolves levels and tracks
progress, `src/adventure/` owns the level schema and conditions, and
`src/lesson/LessonController.js` connects those framework-free pieces to a game
session. `src/components/LessonView.vue` and `InstructionsPanel.vue` only draw
the controller state. The lesson's editable project uses its own
browser-storage key, separate from the normal Play view.

Level 5 is the lesson's one authoring step. It comes after the AI
levels, which need the missing detail to still be missing and so always start
from the starter world. `AddThingForm.vue` takes a name, a
description and other names, and `src/lesson/addThing.js` turns them into one
item in the starting room. The edit is applied to the game in progress by a
three-way merge (`engine/merge.js`): what the author changed comes from the
edit, and what the game changed (item locations, open doors, flags, fired
rules) carries over.

The last level has no game. `RealLifeView.vue` shows three apps outside the
game (the scenarios are in the level's `realLife` data) and asks where the
student would set the same dial for each, and why. The controller keeps the
answers in browser storage and adds them to the downloaded log.

Finishing the lesson opens **My AI rules** (`AiRulesCard.vue`), a one-page card
the student can print: the dial they set for their game and why, the thing they
made real, and the dial they set for each real-life app. It draws what
`LessonController.card()` gathers from browser storage. Nothing is uploaded, and
the name line is left blank to fill in by hand.

## Privacy

What the app stores in the browser and what leaves it is written down in
[../docs/PRIVACY.md](../docs/PRIVACY.md). `tests/privacy.test.js` fails if the
code makes a network request of its own, loads anything from another site, or
uses a browser-storage key that document does not list. If you add a field that
keeps something a student typed, add it to that document.

## Tracing

`parse(world, text, trace)` pushes one record per decision it makes: tokens,
typo fixes, verb match, filler words dropped, how each noun was resolved, and
route planning. `takeTurn` adds the interpreter step, the engine events and a
diff of the world. The parser panel draws these records. Tracing only
observes: `parse` returns the same result with or without a trace.

## The language model (WebLLM)

Choose a model from **Interpreter** in the top bar. Nothing is downloaded until
then. The model runs on the GPU through WebGPU, in a Web Worker
(`src/llm/`). The browser caches the weights, so the download happens once per
machine. On GPUs without `shader-f16` (common on Chromebooks), the f32 build is
used automatically.

| Model | Download | Score | Median time | Prompt |
|---|---|---|---|---|
| Qwen2.5 0.5B | ~1 GB | 36% | 0.6 s | v3 |
| Llama 3.2 1B | ~1 GB | 51% | 0.6 s | v1 |
| **Qwen2.5 1.5B** | ~1.7 GB | **80%** | 1.6 s | v3 (recommended) |

These are historical scores from before the stricter intent checks, not current
accuracy claims. Rerun the **Benchmark** view (top bar, or `#bench`). It also shows
the prompts. **Inspect prompt** builds the exact messages a model would get
for any case: the system prompt, the worked-example turns and the live scene.
Click a result row to see what was actually sent and what the model replied.
The prompts are in `src/llm/prompts.js`.

These scores were measured on an Apple-silicon Mac. Expect
slower times on a Chromebook; validate the current build on target devices.

The model sees only `buildContext()`: the room, its exits, the things in view,
what the player carries, and what the parser said. Its output is constrained by
`actionSchema()`, so it can only name ids in that context. `validateResolution`
checks the answer again, and the engine still decides what happens.

`engine/grounding.js` checks every model action, including observations, against a
conservative reading of the original request. It strips supported polite wrappers,
recognizes a small set of phrase equivalents, and asks the deterministic parser to
resolve the action, all operands and any route. The proposed action must match.
Unknown targets, pronouns without an explicit referent, unrelated observations and
wrong directions are refused without advancing the turn. Both reparsed and
structured fallback proposals use the same check. This is intentionally cautious;
it cannot establish intent for arbitrary English.

A model clarification, engine rejection, unresolved lookup and unavailable model
are distinct statuses. Only accepted actions and actual clarification questions
count toward their respective lesson activities. The transcript labels model
interpretations; the inspector distinguishes interpretation from prose generation.

The existing 51 benchmark requests requiring an action include 39 for which this
check permits at least one expected action and 12 that now need clearer wording.
That is a deterministic coverage check, **not** a live-model accuracy score. The
refused cases include implied tools, implicit destinations and conversational
pronouns. Their original expectations remain in the benchmark to expose the cost,
not redefine it away. Six additional cases exercise the independent playtest
failures. Benchmark reports accepted correct/incorrect actions separately from
requests expecting actions that were not executed. See `tests/grounding.test.js`
and `tests/nl_cases.test.js` for regression and coverage checks.

### How it got from 37% to 80%

The historical benchmark had 59 sentences the parser could not understand,
each played from a real game state. The current fixture has 65. Some name things that aren't in the
room, and for those the right answer is to ask. Qwen2.5 1.5B's score with each change:

| Change | Score |
|---|---|
| v1: rules and inline examples in the system prompt | 37% |
| v2: examples given as real user/assistant turns, and the parser's message passed on only when it says a thing is absent | 54% |
| v3: the model writes a short paraphrase (`"means"`) before choosing the command | 59% |
| v3, with the paraphrase run back through the parser (`turn.js`) | **80%** |

The last step changed the design, not the prompt. Small models often state
the request correctly ("look at the status console") and then pick the wrong
command (`listen`). So the parser reads the paraphrase first:
- If it understands the paraphrase, the parser's reading wins.
- If the paraphrase names something that isn't here, the player is told so,
  instead of getting whatever visible id the grammar pushed the model into.
- If the paraphrase uses words the parser doesn't know, the model's own
  command is used.

The model only translates into plain words, and the deterministic parser
does the matching to ids.

The best prompt depends on the model. Llama 3.2 1B scores 51% on v1 and v2
but 46% on v3, so each model has its own default in `src/llm/models.js`.

Keep length limits such as `maxLength` out of the schema. Each one compiles
into a huge grammar and costs seconds every time the room changes.

## Writing another interpreter

`takeTurn` gives a line to the interpreter only when the parser fails. Implement:

```js
const myInterpreter = {
  name: 'my-interpreter',
  async interpret(utterance, context, transcript) {
    // context: { roomName, roomDescription, exits, exitNames, visible, inventory, parserSaid, ... }
    // return { kind: 'action', action, rephrased? } | { kind: 'clarify', question } | { kind: 'unavailable', detail }
  },
}
```

and set it as `game.state.interpreter` (wrap it in `markRaw`).

`rephrased` is optional: the request in plain words. If you include it, the
parser tries it before your `action` (see above).

## Tests

`npm test` needs no network and no GPU. The golden test replays two full sessions —
the winning path, and a long wander through typos, failures and dead ends — and
compares every response, written and spoken, word for word with
`tests/fixtures/golden.json`. So any change to parsing, rules or prose fails it.
When the change is one you meant, re-record and commit the new fixture with it:

```bash
npm run golden
git diff tests/fixtures/golden.json   # read it: these are the lines players will see differently
```

## Deploying

It deploys to CodeAI Cloud as a static site (`codeai-cloud.yaml`, `static.dir: dist`).
CodeAI Cloud serves files and doesn't build them, so build first, then ship this
folder:

```bash
npm run build
codeai-cloud ship .
```

That updates the internal site, https://adventure-lab.internal.code.org/ (code.org
accounts only), straight away. The public site, https://adventure-lab.apps.code.org/
(no sign-in), changes only through a release that cloud-ops reviews:

```bash
codeai-cloud release --note "what changed"
codeai-cloud promote-status    # where the review stands
```

`dist/` is ignored by the repository's root `.gitignore` rather than this folder's,
so git leaves it out while `ship` (which reads only this folder's `.gitignore`)
uploads it.
