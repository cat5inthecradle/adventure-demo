# Adventure Lab (web)

The engine, parser and renderer, ported to browser JavaScript. The page is a Vue 3
app: a 4:3 terminal on the left, and on the right a panel that shows step by step how
each command was understood, plus a world panel (map, room, raw state).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parity + engine tests
```

It reads the same world file as the Python build: `../worlds/wayfarer.json`.

## Layout

| Path | What it is |
|---|---|
| `src/engine/` | The game, with no UI or Vue imports: `engine.js` (the only thing that mutates a world), `parser.js`, `renderer.js`, `loader.js`, `turn.js` (input routing) |
| `src/engine/interpreter.js` | The plug-in point for an LLM (see below) |
| `src/game.js` | The play session: scrollback, turn history, undo, saves, meta commands |
| `src/components/` | Terminal, parser panel, world panel |
| `tests/parity.test.js` | Replays scripted sessions and checks that every response matches the Python engine's |

The architecture's rules still hold. Only `engine.apply()` mutates the world.
The parser and interpreter produce actions that refer to things by id. The
renderer never makes up facts.

## Tracing

`parse(world, text, trace)` pushes one record per decision it makes: tokens,
typo fixes, verb match, filler words dropped, how each noun was resolved, and
route planning. `takeTurn` adds the interpreter step, the engine events and a
diff of the world. The parser panel draws these records. Tracing only
observes: `parse` returns the same result with or without a trace.

## Adding an interpreter (LLM)

`takeTurn` gives a line to the interpreter only when the parser fails. Implement:

```js
const myInterpreter = {
  name: 'webllm:Qwen2.5-1.5B',
  async interpret(utterance, context, transcript) {
    // context: { roomName, roomDescription, exits, visible, inventory, legalActionTypes }
    // return { kind: 'action', action } | { kind: 'clarify', question } | { kind: 'unavailable', detail }
  },
}
```

and pass it to `createGame({ interpreter: myInterpreter })` in `App.vue`.
`actionSchema(context)` builds a JSON Schema that only accepts ids currently in
view. Pass it to a constrained decoder so a small model cannot name something
the player can't see. `validateResolution` then checks the answer a second
time, and the engine still decides what happens.

## Regenerating parity fixtures

After changing the Python engine or the world file, run this from the repo root:

```bash
.venv/bin/python web/tests/make_golden.py
```
