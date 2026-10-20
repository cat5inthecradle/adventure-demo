# Adventure Lab (web)

The game, its engine and its tools, running entirely in the browser. The page is a
Vue 3 app: a 4:3 terminal on the left, and on the right a panel that shows step by
step how each command was understood, plus a world panel (map, room, raw state). A
second view, **Benchmark**, scores the optional language model.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # golden, engine and benchmark-fixture tests
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
| `src/components/` | Terminal, parser panel, world panel, interpreter picker, benchmark view |
| `src/bench/cases.js`, `tests/fixtures/nl_cases.json` | The interpreter benchmark: cases, replay, scoring |
| `tests/golden.test.js`, `scripts/golden.js` | Replays two scripted sessions and checks every response, written and spoken, against `tests/fixtures/golden.json` |
| `scripts/check-world.js` | Validates a world file from the command line |

The architecture's rules still hold. Only `engine.apply()` mutates the world.
The parser and interpreter produce actions that refer to things by id. The
renderer never makes up facts.

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

Scores are from the **Benchmark** view (top bar, or `#bench`). It also shows
the prompts. **Inspect prompt** builds the exact messages a model would get
for any case: the system prompt, the worked-example turns and the live scene.
Click a result row to see what was actually sent and what the model replied.
The prompts are in `src/llm/prompts.js`.

These scores were measured on an Apple-silicon Mac. Expect
slower times on a Chromebook; the accuracy should be about the same.

The model sees only `buildContext()`: the room, its exits, the things in view,
what the player carries, and what the parser said. Its output is constrained by
`actionSchema()`, so it can only name ids in that context. `validateResolution`
checks the answer again, and the engine still decides what happens.

### How it got from 37% to 80%

The benchmark has 59 sentences the parser can't understand (`tests/fixtures/nl_cases.json`),
each played from a real game state. Some name things that aren't in the
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

It deploys to CodeAI Cloud as a static site (`codeai-cloud.yaml`, `static.dir: dist`),
at https://adventure-lab.internal.code.org/. CodeAI Cloud serves files and doesn't
build them, so build first, then ship this folder:

```bash
npm run build
codeai-cloud ship .
```

`dist/` is ignored by the repository's root `.gitignore` rather than this folder's,
so git leaves it out while `ship` (which reads only this folder's `.gitignore`)
uploads it.
