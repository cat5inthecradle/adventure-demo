# Writing worlds

Everything a player reads lives in the world file, not in the code. If you want to
change what the ship says, you edit JSON — you never touch the engine. That is the
whole point of the engine/content split: `worlds/wayfarer.json` is data, and swapping
it for `worlds/yours.json` gives you a different game with the same engine.

To play your world, point the world import at the top of `web/src/game.js` at it,
then run the app:

```js
import wayfarer from '../../worlds/yours.json'
```

```bash
cd web && npm run dev
```

## The safety net, first

The loader validates the entire file before the game starts, and it names the thing
you got wrong. Check a world without opening the game:

```bash
cd web
npm run check-world -- ../worlds/yours.json
```

```
That world file is not valid: interaction 'try_reactor' names 'reator', which is
not an item, npc, or door id
```

So the loop is: edit the JSON, check it, read the error, fix it. You cannot break
the engine from the world file — the worst you can do is fail to load. Once it loads,
play it with the parser panel open: it shows how each command was matched against
the names and aliases in the room, which is where most authoring mistakes surface.

If you change the Wayfarer itself, `npm test` will fail on every line of prose you
changed, because the golden test replays two full sessions word for word. That is the
point: read the failures, and when they are the changes you meant, re-record with
`npm run golden` and commit the new `web/tests/fixtures/golden.json` with your edit.

## The eight things a world is made of

| | What it is |
|---|---|
| **rooms** | Places, with `exits` pointing at other rooms. Optionally through a door. |
| **doors** | A gate on an exit. Can be shut, locked, unlocked by a flag, walked through, and listened at — all of which it can narrate. |
| **items** | Things. They live in a room, in `"inventory"`, or in `"hidden"` (not yet in the world). |
| **npcs** | People and machines you can `talk to`. They have an ordered list of dialogue rules. |
| **interactions** | The rules for `use X on Y`. This is where most puzzles live. |
| **triggers** | The rules the *world* runs, on where the player is standing rather than what they aimed at. Pressure, ambushes, arrivals, endings. |
| **flags** | Booleans. An unset flag counts as `false`. |
| **counters** | Integers, for what a boolean cannot say: how close the hunters are, how many times you pushed your luck. An unset counter counts as `0`. |

Every id is `snake_case` and unique across *all* of those — no item may share an id
with a room or an npc.

---

## Worked example 1 — giving scenery a response

**The problem, from a real playthrough:** the engine room mentions a reactor. A
player tried `turn on the reactor`, `use reactor`, and `use prybar on reactor`, and
got **"Nothing happens."** three times, then wandered off.

That message is the sound of a content gap. The rule it teaches:

> **If you name a thing in a room description, you owe the player a real answer when
> they touch it.**

The fix is one entry in the `interactions` array:

```json
{
  "id": "try_reactor",
  "item_id": "reactor",
  "target_id": null,
  "requires_flags": {},
  "message": "You work through the cold-start sequence from memory. Nothing answers: no hum, no warmth, not even a fault light on the housing. The primary cells really are slagged. Whatever gets you off this ship, it will not be this.",
  "effects": [],
  "once": false,
  "fired": false
}
```

Field by field:

- **`id`** — any unique name. You will see it in error messages and logs.
- **`item_id`** — the thing being used. Must be an item id.
- **`target_id`** — what it is being used *on*. `null` means bare `use reactor`.
  Set it to another id for `use prybar on crate`.
- **`requires_flags`** — `{}` means always available. `{"power_restored": true}`
  would make this fire only after the lights come back.
- **`message`** — what the player reads. Write full sentences; this is the game's
  voice.
- **`effects`** — `[]` means nothing changes. This one is pure flavour.
- **`once`** — `false` here, so a player who pokes the reactor twice gets an answer
  twice. Set `true` for a step that should only ever happen once, like prying a
  crate open.
- **`fired`** — always start at `false`. The engine flips it, and saves remember it.

**Try it yourself:** the bunks are named in the opening room description but are not
an item, so `check the bunks` — the first thing one real player typed — says nothing.
Add a `bunks` item to `crew_quarters`, then an interaction that searches them.

---

## Worked example 2 — telegraphing an obstacle

**The problem, from the same playthrough:** a player typed `open the crate` five
different ways and got **"You can't open that."** every time, so they concluded the
crate was scenery and left the room. It was not scenery. It was the puzzle.

The rule this teaches is the most useful design lesson we have found so far:

> **A refusal should tell the player the obstacle can be beaten. "You can't" is a
> dead end; "you can't *by hand*" is a puzzle.**

Reserve a flat "you can't" for when you genuinely intend a hard wall.

Two optional fields on any item do this:

```json
"supply_crate": {
  "id": "supply_crate",
  "name": "supply crate",
  "aliases": ["crate", "box", "container"],
  "description": "A sealed cargo crate stenciled SPARES — POWER CELLS. The lid is jammed shut.",
  "location": "cargo_bay",
  "portable": false,

  "open_refusal": "You work your fingers under the lid and heave. It does not give — the crate is banded shut and jammed hard. Bare hands are not going to do it; something with leverage might.",
  "open_refusal_with": {
    "prybar": "You get a grip on the lid and pull, with about as much effect as before — then remember the prybar you are carrying. That flattened end is exactly what this needs."
  }
}
```

- **`open_refusal`** replaces the generic message when the player tries to open this.
- **`open_refusal_with`** maps an item id to a sharper message, used when the player
  is *carrying* that item. The hint escalates as the player gets closer to the
  answer, which is what a good hint system does.

You can list several tools. The first one the player is carrying wins.

**Try it yourself:** the pod bay door already has a `locked_message` — the same idea,
older spelling. Read it and see how it explains *why* it will not open.

---

## Worked example 3 — a countdown that kills

**The problem:** suppose a boarding party is working its way down the ship towards
you. Listening at the hatch is the natural thing to do and it must be *worth doing* —
but three listens should get the player caught, and so should stepping out into the
corridor. The pressure has to be real without a visible timer, because a visible
timer turns a scene into arithmetic.

*(This example is written out rather than shipped: the world in this repository has
no countdown in it. Every field below is real, and the engine tests cover all of
them — what is invented is the scene.)*

That needs two things booleans cannot do: a number, and a rule that fires because of
where the player is standing rather than what they poked.

**The number.** Every act of exposure raises the same counter, from wherever it
happens. Three ordered interactions on the door, each guarded by a different range,
give the player three different paragraphs:

```json
{ "id": "listen_hatch_first",  "item_id": "hatch",
  "requires_counters": { "exposure": { "at_most": 0 } },
  "message": "You go still and let the hull do the work...",
  "effects": [ { "type": "adjust_counter", "counter": "exposure", "delta": 1 } ] }
```

The second is guarded `at_most: 1`, and the third has no counter guard at all — it is
the catch-all, and the same rule applies here as to dialogue: write it, or a player
in a state you did not plan for gets "Nothing happens."

**The rule the world runs.** A trigger fires on the player's *situation*:

```json
{ "id": "the_hatch_comes_in",
  "when": "turn",
  "rooms": ["crew_quarters", "corridor", "cargo_bay"],
  "requires_counters": { "exposure": { "at_least": 3 } },
  "text": "The hatch gives in a single blow, and the corridor fills with light...",
  "effects": [ { "type": "end_game", "outcome": "loss", "epilogue": "..." } ] }
```

- **`when`** — `"enter"` fires only on the turn the player arrived somewhere;
  `"turn"` fires after any action that counted as a turn, arrivals included. Use
  `"enter"` for arrivals and ambushes, `"turn"` for anything that should also catch a
  player standing still.
- **`rooms`** — where it can reach. An empty list means anywhere. This one lists the
  three rooms the boarding party can search, which is what makes the pod bay safe:
  the countdown is still at three out there, and it cannot follow you.

**Order is the whole design.** Triggers are *not* first-match-wins like dialogue and
interactions. Every matching trigger fires, in file order, each judged against the
world the one before it left behind. So this pair, in this order:

```json
{ "id": "the_deck_plate_rings", "when": "enter", "rooms": ["corridor"],
  "effects": [ { "type": "adjust_counter", "counter": "exposure", "delta": 1 } ] },
{ "id": "the_hatch_comes_in",  "when": "turn",  "requires_counters": { "exposure": { "at_least": 3 } } }
```

means a player who has listened twice and then steps into the corridor dies *on that
step*. Swap them and the death arrives a turn late, for no reason the player can see.
**Put every trigger that raises a counter above every trigger that reads one.**

An ending stops the cascade, so nothing happens after the last word.

**Try it yourself:** build the pair above into a copy of the Wayfarer and walk into
it. Then add a room that kills regardless of the counter — a trigger with no
`requires_counters` at all, because being outnumbered is not a countdown — and a
second `"when": "turn"` trigger that says something the third time the player loiters
somewhere. Watch where each one has to sit in the list.

---

## The other pieces, briefly

**Making something appear.** Items start in `"hidden"` and get moved into the world
by an effect. That is how the power cell works:

```json
"effects": [
  { "type": "set_flag", "flag": "crate_open", "value": true },
  { "type": "move_item", "item_id": "power_cell", "to": "cargo_bay" }
]
```

The effect types are `set_flag`, `adjust_counter`, `move_item`, `move_npc`,
`move_player`, `set_door`, and `end_game`. (`win_game` is the old spelling of
`end_game` with `outcome: "win"`, and still works.)

**Changing a description after something happens.** Any room or item can carry an
alternative:

```json
"alt_flag": "power_restored",
"alt_description": "White light floods the corridor and the air recyclers hum steadily."
```

When `power_restored` is true, players see the alternative instead. This is how the
ship visibly comes back to life.

**Guarding a rule.** Interactions, dialogue rules and triggers all carry the same
three guards, and all three must pass:

```json
"requires_flags":    { "power_restored": true },
"requires_counters": { "exposure": { "at_least": 2, "at_most": 4 } },
"requires_doors":    { "pod_door": true }
```

Counter bounds are inclusive and either may be left out. `requires_doors` asks
whether a door is open — use it instead of shadowing door state with a flag, which
desyncs the moment a player types `open` instead of solving your puzzle.

**Ending the game.** One world can end in several ways, and each ending brings its
own last words:

```json
{ "type": "end_game", "outcome": "loss",
  "epilogue": "The lights go out one bank at a time, and the ship keeps drifting." }
```

`outcome` is `"win"` or `"loss"`, and it is the only thing the engine reads — it
decides whether the player can still act, not how the ending feels. A win with no
`epilogue` falls back to the world-wide `win_epilogue`. The closing banner defaults
to "You have escaped" or "You have died"; add `"banner"` when neither fits, which is
how an unfinished world can stop at *to be continued* instead of ending.

**Companions.** An npc with `"follows_player": true` walks with the player, through
doors and out of windows, with no scripting per room.

**Portals, and giving movement a voice.** Players name the way through at least as
often as they name a bearing: `get in the pod`, `go out the window`, `climb through
the hatch`, `exit the airlock`. All of those resolve the same way — if the name is a
door on an exit from here, the player goes through it, opening it on the way if it is
merely shut. A *locked* door still refuses, in its own `locked_message`.

That means a door is the one piece of scenery every player walks into, so it is worth
letting it speak:

```json
"window": {
  "id": "window", "name": "shuttered window", "aliases": ["window", "shutters"],
  "description": "Two shutters on a bar, swollen with salt air...",
  "open_message": "You get your fingers under the shutter bar and lift. It is swollen with salt and comes up grudgingly, in two grating stages..."
}
```

```json
"exits": {
  "down": {
    "to": "slate_roof", "door_id": "window",
    "pass_message": "You put a hand on the sill and go out of it without pausing, because pausing is a sound."
  }
}
```

- **`open_message`** belongs to the door — opening it is the same event from either
  side. Without it, opening reads "You open the shuttered window."
- **`pass_message`** belongs to the **exit**, because an exit already knows which way
  you are facing. Dropping ten feet onto a roof is not the event you get climbing
  back in through the same window, and the two exits say so separately. It works on
  doorless exits too, for a passage worth narrating.

**Listening.** `listen` answers the room. `listen at X` answers the room too, unless
X is a portal with something of its own to say:

```json
"hatch": {
  "id": "hatch", "name": "hatch",
  "listening": [
    { "requires_counters": {"exposure": {"at_most": 0}},
      "text": "You go still and let the hull do the work. Someone is arguing two decks down...",
      "effects": [{"type": "adjust_counter", "counter": "exposure", "delta": 1}],
      "once": false, "fired": false }
  ]
}
```

```json
"corridor": {
  "sounds": "The corridor is dead quiet. Every sound you make goes the whole length of it and comes back.",
  "alt_sounds": "Fans, the steady hum of restored power, and the corridor lights ticking as they warm."
}
```

`listening` is an ordered list with the same guards and effects as dialogue: first
match wins, write the catch-all last. `sounds` swaps to `alt_sounds` on the room's
existing `alt_flag`, so a ship that comes back to life sounds like it.

**Why the fallback matters more than the content.** If only the doors hiding
something answered, then *getting an answer at all* would be the tell, and a world
would give away every ambush by having written for it. Because every ordinary door
returns the room's sound, listening tells a player nothing they have not earned — and
the doors worth listening at have to advertise themselves the honest way, in the name
the exits line already reads out: a *scorched iron door*, a *shuttered window*.

That is also why hearing is the only sense with a verb. Sight and touch are properties
of particular objects, so giving them verbs would oblige a careful player to examine
and prod everything, every room, forever. A smell or a sound worth knowing about goes
in the room description, where it arrives for free. **Never build a mechanic that
rewards exhaustive checking; a player who finds that shortcut has stopped playing.**

**Do not build a portal twice.** Before these existed, one world had a window that was
a door *and* a pair of `use window` interactions moving the player with `move_player` —
which duplicated the exit it sat on and skipped the `Moved` event, so anything reading
events rather than prose never saw the player leave. If a player can walk through it,
make it a door and let the engine move them. Reach for `move_player` only when there
is no exit: a trapdoor that dumps you somewhere, a trigger that drags you off.

**Dialogue.** An npc has an ordered list; the first rule whose guards match
is the one that fires. Put the most specific rules first:

```json
"dialogue": [
  { "requires_flags": {"droid_active": false}, "text": "The droid is dark and unresponsive.", "effects": [], "once": false, "fired": false },
  { "requires_flags": {"droid_active": true, "power_restored": false}, "text": "R-6 boots with a rising whir...", "effects": [{"type": "set_flag", "flag": "power_restored", "value": true}], "once": true, "fired": false },
  { "requires_flags": {"droid_active": true, "power_restored": true}, "text": "R-6 beeps politely...", "effects": [], "once": false, "fired": false }
]
```

Note the last rule has no unmet condition, so it is the catch-all. Always write one,
or a player who talks to an npc in an unexpected state gets "Nothing happens."

---

## Pronouns the player chooses

The protagonist is "you" almost everywhere, so their pronouns barely surface — and
that is worth defending, because second person never has to agree with anything. But
the moment somebody in the world talks *about* the player, you need a word, and the
word is not yours to pick. Write a token instead:

```json
"text": "\"{They} came aboard alone,\" R-6 reports. \"{They} {are} still in the hold.\""
```

At render time that becomes *He came aboard*, *She came aboard*, or *They came
aboard*, depending on what the player chose with the `pronouns` command. A world declares
the default its prose was written for:

```json
{ "title": "The Wayfarer", "pronouns": "they" }
```

| Token | he | she | they |
|---|---|---|---|
| `{they}` | he | she | they |
| `{them}` | him | her | them |
| `{their}` | his | her | their |
| `{theirs}` | his | hers | theirs |
| `{themselves}` | himself | herself | themselves |
| `{s}` | s | s | *(nothing)* |
| `{es}` | es | es | *(nothing)* |
| `{are}` | is | is | are |
| `{were}` | was | was | were |
| `{have}` | has | has | have |
| `{do}` | does | does | do |

Capitalise the token to capitalise the word: `{They}` → *He*.

**The verbs are the part that bites.** "They walks away" is what makes people give up
on this and hand-write three versions of a line. Every verb after a pronoun token
needs its ending marked — `{They} walk{s} away`, `{They} watch{es} the road` — and the
four irregulars above cover most of the rest. Read the line back as they/them before
you save it: if it is grammatical there, it is grammatical everywhere.

**Two things that make this cheap:**

- **Prefer names and roles.** "R-6 is already awake beside you" needs no token at
  all, and reads better than the version that does.
- **Avoid gendered nouns.** *girl*, *his own man*, *the kind of woman who* — none of
  those can be substituted, and each one is a rewrite later.

A typo like `{thier}` reaches the player as literal punctuation: the renderer leaves
unknown tokens visible rather than deleting them, so the mistake shows up the first
time anyone reads the line instead of silently disappearing.

*Only the protagonist has tokens.* Other characters' pronouns are written into their
prose as words, which is correct — a character is who they are, not a setting.

## Naming things

Players type names, so names are an interface.

- **Give each thing distinct words.** Two things a player can see at once must never
  answer to the same word. If they do, the game asks "Which do you mean?" — and the
  parser panel's resolve step shows both things lighting up for the one word.
- **Disambiguate at the noun, not the adjective.** "steel bar" and "iron bar" both
  answer to `bar`; "prybar" and "wrench" never collide.
- **Portable items need globally distinct names.** A carried item is in scope in
  every room, so it can collide with something three rooms away.
- **Watch the generic words.** Players type `door`, `console`, `panel`, `screen`
  whatever you named the thing. One per room, or accept that word as a permanent
  source of "which do you mean?".
- **Aliases are cheap; add the words players actually use.** Watch someone play with
  the parser panel open: every "I don't see any '…' here" is a word the parser
  missed, and with a language model on, the panel shows what the model thought it
  meant. Those are alias candidates in real players' own words — but read them with
  judgement, since a misspelling is not a synonym.

## Design rules we learned the hard way

1. **If you name it, answer it.** Scenery mentioned in a description will be poked.
2. **Telegraph beatable obstacles.** Save the flat refusal for real walls.
3. **Write the catch-all dialogue rule.** Someone will talk to the droid in a state
   you did not plan for.
4. **A hint can escalate.** `open_refusal_with` says more once the player holds the
   tool — closer to the answer, louder the nudge.
5. **Point only at verbs the game has.** A message that tells the player to do
   something the parser cannot understand is worse than no message, because they
   trust it. If your prose says "you'll need to go into it", `enter`/`get in` must
   work — or the prose should name the action that does.
6. **Red herrings still need a voice.** The reactor is deliberately unfixable, and it
   still deserved three paragraphs rather than "Nothing happens."
7. **Raise a counter before you read it.** Triggers fire in file order and every
   match fires, so the trigger that spends the player's last margin has to sit above
   the trigger that kills them for spending it.
8. **Scope a countdown to the rooms it can reach.** A `rooms` list is what makes
   somewhere safe. Without one, the thing chasing the player follows them out of the
   building.
9. **Give every room a sound.** Listening falls back to the room, so a room without
   one answers with a shrug — and the rooms that do answer become a map of where you
   hid things.
10. **If they can walk through it, it is a door.** Anything you can pass through
   belongs in `exits` and `doors`, where it shows up in the exits line and every
   travel verb finds it. An interaction that moves the player is a second, invisible
   copy of a route the map already had.
