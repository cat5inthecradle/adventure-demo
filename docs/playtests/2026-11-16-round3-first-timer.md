# Playtest round 3: Hour of AI lesson, first-timer ("Maya", 13)

Date: 2026-11-16. Port 5186 (`playtest-f`), in-app browser emulating 1280x800. World: **Drift**. Interpreter: Qwen2.5 1.5B ("recommended"). WebGPU was present (`navigator.gpu` true). I opened `http://localhost:5186/` with nothing after the slash and played as Maya. I did not open `docs/playtests/` until I had finished the card, and I did not read source or lesson JSON.

## Conclusion

Maya finishes all six levels and gets the card, and she is never stuck for more than about a minute. Every blocker from round 2 that I could re-test is fixed or improved. The lesson now ends with a real lesson-closing moment ("You finished the lesson."), and the card reads well.

What is left, in order of how much it would trip her up:

1. **Level 4 step 3 does not do what the lesson implies.** The panel asks "Which setting worked out what you meant?" for `pick up the tool on the floor`. With the dial on Off it said `I don't see any 'tool floor' here.` With the dial on Understand it said exactly the same thing. Neither setting worked it out. The right answer, which Maya cannot find, is "neither, because the game checked the AI's guess and threw it away". In round 2 this step worked on Understand.
2. **The AI can still be silently wrong, and the lesson does not say so on Level 3.** `call my mom on the phone` became `(listen)` and the game replied `A warning light clicks in the silence.` Nothing in the reply says this was a bad guess.
3. **The inspector still shows developer text** (`item_taken`, `action_failed · already_carrying`, `entity_examined`, `turn_count: 0 → 1`, raw JSON with `"item":"nav_console"`, "969 in / 14 out tokens", "Full prompt"). `ParseError` is gone, which is a real improvement.
4. **Level 1's `open supply crate` still gets a flat "You can't open the supply crate."** with no pointer to the prybar. The droid then says "A prybar was left in the cockpit." even though Maya is already carrying it.

**Would Maya finish in a class period?** Yes, comfortably. My estimate is about 25 minutes including reading and typing (these are my estimates, not stopwatch times). That is more than round 2's ~15 to 25 because Level 4 has six steps and Maya hits the step-3 puzzle. The model was ready in about 25 seconds, but it showed "downloaded" in the menu, so it was already cached on this machine by earlier playtests. **A cold 1.7 GB download was not tested.** **Would she enjoy it?** Mostly yes. Level 1 is a small puzzle with a payoff, the "AI WROTE THIS" lines are fun, and Level 5 (writing her own mug) is a real moment of ownership. Levels 4 and 6 are still worksheet-like but short.

## Landing and first impressions

- Opening `http://localhost:5186/` went straight to `#learn/hoai-adventure/1/1`: "Level 1 of 6", "PLAY AND LOOK INSIDE", "Play", "Choose your world" with Drift highlighted, and the game already on screen with a blinking prompt. It is obvious what to do first: the panel says "Type `help` to see them" and the terminal repeats "Type 'help' for commands."
- The top bar says "Adventure Lab · Drift · Learn · Play · Benchmark". "Benchmark" means nothing to Maya, and "Drift" looks like a label rather than a button. Neither blocks her.
- Level 1's Continue button is greyed with "Continue unlocks when you finish this level. Stuck? Next → at the top skips it." Clear.

## Timing of typed commands

Measured with a polling script that waits for the "processing…" line to disappear. Each number includes 0.3 to 0.5 s of my script's own delay, so subtract that. The inspector's own AI time is given where I read it.

| Dial / AI | What I typed | Time to reply |
|---|---|---|
| AI off (Level 1 and Level 4, Off) | `help`, `take prybar`, `examine the mug`, `pick up the tool on the floor` | About 1.0 to 1.3 s measured, so effectively immediate |
| AI on, Understand, AI used | `fly to the moon` | 4.3 s measured (inspector: 3351 ms) |
| AI on, Understand, AI used | `make me a sandwich` | 3.3 s (2280 ms) |
| AI on, Understand, AI used | `call my mom on the phone` | 3.5 s (1992 ms) |
| AI on, Understand, AI used | `what is the weather like outside` | 4.2 s |
| AI on, Understand, AI used | `eat the coffee mug` | 4.3 s |
| AI on, Understand, AI used | `pik up the prybar` | 3.3 s (1936 ms) |
| AI on, Understand, AI used | `pick up the tool on the floor` | 4.1 s (2754 ms) |
| AI on, Fill gaps | `examine the mug` | 3.1 s |
| AI on, Improvise | `ask the droid about the ship` | 5.3 s (the longest I saw) |
| AI on, but the game's own reader handled it (Level 5) | `examine mug`, `take mug` | About 1.5 to 1.7 s |

A "processing… Esc to skip" line shows while waiting, so it never looks frozen. Nothing was slow enough for Maya to think it was broken. I did not notice the AI-on `can you grab the prybar for me` time exactly; it was under 8 s on a screenshot taken about 8 s after Return.

## Per-level table

Minutes are my estimates of what Maya would take, not stopwatch times, except the model load (about 25 s, cached).

| Level | Est. min | Passed? | Most helped / most hurt |
|---|---|---|---|
| 1 Play | ~4 | Yes, "Escaped in 7 turns." Panel turned green: "The ship is awake. You made it home!" | Helped: the "Stuck? Go `south` and `talk to droid`" hint works, and `use prybar on supply crate` is a satisfying click. Hurt: `open supply crate` gives "You can't open the supply crate." with no nudge, and the droid says the prybar is in the cockpit when Maya already holds it. |
| 2 Look inside | ~1.5 | Yes ("You found the gap between the words and the world.") | Helped: the amber note "Now click the command you typed to see why the game didn't understand it." Hurt: "109 words" in the explanation. |
| 3 Meet the AI | ~5 (model load ~25 s plus 7 sentences) | Yes, after the first two sentences. Panel: "You got a question, not a guess." | Helped: the panel gives `can you grab the prybar for me` and `fly to the moon`, and tells her where the menu is. Hurt: the `call my mom` guess is accepted as `(listen)` and not flagged. |
| 4 The AI dial | ~8 | Yes. "Your AI boundary is set. Be ready to explain it." | Helped: the dial sits next to the game, and step 5 now tells her to check the droid's line with `look` and `inventory`. Hurt: step 3 gives the same failure on both settings (see below), and the panel scrolls. |
| 5 Make it real | ~4 | Yes. "The mug is real now: it is in the rules, not only in the words." | Helped: examining her own description. Hurt: `entity_examined` / `turn_count` in the inspector. |
| 6 Set the dial for real life | ~3 | Yes. Footer counted "3 still need…" down to "All three are set." | Helped: three concrete apps and the counter. Hurt: no real problems. |
| Card | n/a | Shown after Continue: "You finished the lesson." | Looks good and quotes her reasons. I did not press "Print my card". |

## Level 3: everything I typed and what came back

The AI was on, dial Understand, Qwen2.5 1.5B. The panel said: "Type a normal sentence that means a game command, like `can you grab the prybar for me`."

| # | I typed | Screen said | Notes |
|---|---|---|---|
| 1 | `can you grab the prybar for me` | `(take the prybar)` / `You take the prybar.` | Works and shows what the AI turned it into. |
| 2 | `fly to the moon` (cannot do) | `What do you want to do? I can't do that here, and I won't guess. Type 'help' to see the commands I know.` | The AI guessed `go south`; the game threw it away. Panel turned green. |
| 3 | `make me a sandwich` (cannot do) | Same "What do you want to do? I can't do that here, and I won't guess…" | AI guessed `use prybar`; thrown away. |
| 4 | `call my mom on the phone` (cannot do) | `(listen)` / `A warning light clicks in the silence.` | **The AI guessed `listen`, and the game did it.** Looks like the game accepted a wrong guess. No warning. |
| 5 | `what is the weather like outside` (cannot do) | `I don't see any 'outside' here.` | The AI said "look outside"; the game's check found no "outside". |
| 6 | `eat the coffee mug` (cannot do) | `I don't see any 'coffee mug' here.` | Odd: the room text says "a forgotten coffee mug", so Maya thinks the game is wrong. This is the point of Level 4/5, but it is not explained here. |
| 7 | `pik up the prybar` (typo) | `(take the prybar)` / `You already have the prybar.` | The game's own typo fixer refused ("pik: too close to pick to guess"), then the AI fixed it. Nice example. |

Four of the "cannot do" requests (#2 to #6) got four different kinds of reply, which is confusing if Maya expects one consistent "can't do that" answer.

## Where Maya got stuck or confused

**Level 1**
- Typed `help` (list worked), `take prybar`, `go south`, `open supply crate`, `talk to droid`, `use prybar on supply crate`, `take power cell`, `go north`, `use power cell on navigation console`.
- `open supply crate` returned `You can't open the supply crate.` I expected a hint like "it needs something". It came from the droid on the next command: `'That crate needs leverage,' the droid says. 'A prybar was left in the cockpit.'` I already had the prybar in my hand, so the droid felt like it was not paying attention. Short confusion, about 20 seconds.
- Panel says "find a power cell for the navigation console" but the first thing Maya sees in the game is "Bring the navigation console back online." Close enough.

**Level 2**
- Typed `examine coffee mug` exactly as asked. The terminal said `I don't see any 'coffee mug' here.` I clicked the typed line and the inspector opened with "Split into words / Fix typos / Find the command word / Look for 'coffee mug' / What the game understood: Could not understand: nothing called “coffee mug” here / AI: The AI is off / Write the reply". It read clearly. Panel: "You found the gap between the words and the world."
- The explanation "A word the game does not know is swapped for one of the 109 words it does know here, but only when exactly one is close." is dense for Maya.

**Level 3**
- Panel step 1: "Turn on the AI: pick a model from the **AI Interpreter** menu at the top right and wait for it to load." The control is at the top right with an arrow "← pick a model". Easy to find. The options read "Qwen2.5 0.5B · ~1 GB · fastest · gets about 4 in 10 right", "Llama 3.2 1B · ~1 GB · gets about 5 in 10 right" and "Qwen2.5 1.5B · ~1.7 GB · recommended · gets 8 in 10 right". The recommended one is obvious. After choosing, a percentage bar appeared, then "✓ ready" about 25 s later with the menu text changed to "downloaded · recommended".
- The terminal printed `⚙ AI rules: model webllm · Qwen2.5 1.5B · prompt v3 · dial Understand · tone any · theme any`. Maya would not know what this is.
- The panel says: "You are done when the AI has understood one request, and another has ended in a question or a guess." Then a green box: "You got a question, not a guess. Click the command to see whether the AI asked, or guessed and was overruled." The second half is confusing: the green box says "asked, or guessed and was overruled", but Maya has not clicked and cannot tell which happened without opening the inspector. When I did open it, the AI line said "The AI guessed go south. Nothing you typed asked for that, so the game threw the guess away and asked you instead." That sentence is good.

**Level 4**
- Panel: "Set the dial to **Off** and type `examine the mug`." Screen: `I don't see any 'mug' here.` Fine.
- Step 3, Off: `pick up the tool on the floor` → `I don't see any 'tool floor' here.` Maya asks where "tool floor" came from, because the game dropped "the", "on", "up" (same as rounds 1 and 2).
- Step 3, Understand, same sentence → still `I don't see any 'tool floor' here.` Panel asks "Which setting worked out what you meant?" Neither did. The inspector says the AI replied `{"means":"take the tool from the floor","type":"take","item":"prybar"}` and then "The parser re-read its paraphrase… nothing called “tool floor” here. So the player is told, instead of the model guessing." That is a fair rule, but it makes the step's question unanswerable. Maya would think the AI was broken. I spent about two minutes here.
- Step 4, Fill gaps, `examine the mug` → `AI WROTE THIS` / `The forgotten coffee mug lies on the navigation console, untouched.` Step ticked. This is the best moment of the level.
- Step 5, Improvise, `go south`, `ask the droid about the ship` → `AI WROTE THIS` / `The maintenance droid says, 'The ship is almost ready. The last bolt needs to be tightened, but I'm not sure where that's at.'` Then `look` (unchanged room) and `inventory` (`You are carrying nothing.`). The panel's new wording "Is what it says true in the game? Check with `look` and `inventory`." works: there is no bolt anywhere, so Maya can see the droid made it up. This fixes round 2's biggest Level 4 complaint.
- Step 6: I chose Understand, typed a theme ("a lost spaceship") and a reason, and pressed Save my setting. `Saved.` appeared next to the button and the left panel showed "Your AI boundary is set. Be ready to explain it." with Continue. Because I had scrolled the panel for steps 5 and 6, I saw it. At the top of the page, steps 1 to 3 are plain numbers and steps 4 to 6 get ticks, as in round 2.
- The dial now says "Understand — the AI turns your words into commands", "Fill gaps — the AI writes when you didn't", "Improvise — the AI talks beyond your lines", "Invent — the AI decides what happens" (greyed). "Why is this locked? Inventing events can change the story without the player or author choosing." Readable.

**Level 5**
- The form was already named "coffee mug". I typed a description (`A chipped blue mug that still smells like cold coffee.`) and pressed "Add it to the world". Screen: `Added. Now examine it in the game.`, plus in the terminal `— The world has changed. Your game carries on from where you were. —` and the room now listed the mug.
- `examine mug` → my own words. `take mug` → `You take the coffee mug.` Panel: "The mug is real now: it is in the rules, not only in the words."
- Added "cup, drink" to "Also called", pressed "Save changes" (`Saved. Try it in the game.`). `drop cup` → `You put down the coffee mug.` `examine drink` → my description. Confirms that "Save changes" keeps what Maya is carrying (round 2 could not confirm this).
- The inspector shows `entity_examined` and `turn_count: 3 → 4`.

**Level 6**
- Three cards, each with five radio options and a "Why there?" box. I picked Understand, Off and Improvise with a reason each. The footer counted "3 still need a setting and a reason." down to "All three are set." and Continue stayed grey until the last reason was typed. Panel: "You set all three. Be ready to explain what made them different."
- After Continue the card showed. Panel: "You finished the lesson." and "Want more? Play The Wayfarer, a longer game →". Buttons "Print my card" and "Back to my answers". The card has "My AI rules", my Drift setting and reason, the mug, "Also called: cup, drink", and all three real-life choices. A banner at the top said "In your game, you set the dial to Understand."

## Wording a 13-year-old would not understand

- `⚙ AI rules: model webllm · Qwen2.5 1.5B · prompt v3 · dial Understand · tone any · theme any` (terminal, every time the dial changes)
- "A word the game does not know is swapped for one of the 109 words it does know here, but only when exactly one is close." (Level 2 and later inspector)
- "pik: too close to pick to guess" (inspector, Level 3)
- "The parser gave up, so the line went to the model, with only what you can see:" and "The parser re-read its paraphrase, “take the tool from the floor”:" and "Its own reading wins over the model’s choice of command." (inspector). "Parser", "model", "paraphrase" are never explained.
- `{"means":"take the prybar","type":"take","item":"prybar"}`, `"item":"nav_console"`, "969 in / 14 out tokens", "Full prompt" (inspector)
- `item_taken`, `action_failed · already_carrying`, `entity_examined`, `turn_count: 0 → 1`, `items.prybar.location: "cockpit" → "inventory"` (inspector)
- "The AI can write words, not rules." and "The mug never becomes a real object: the AI can write words, not rules. Improvise lets characters say things the author never wrote." (Level 4 panel). "The author" is the person who built the game, and Maya has not been told that.
- "Why is this locked? Inventing events can change the story without the player or author choosing." (Level 4)
- "Your AI boundary is set. Be ready to explain it." ("boundary", and to whom?)
- "AI Interpreter", "tone", "theme" (menu and optional boxes).
- "Benchmark" (top bar).
- "Words the parser doesn’t know, so the model’s own command is used." (inspector, for `make me a sandwich`)

## Anything that looked broken

**Definitely a bug or content mismatch**
1. **Level 4 step 3 cannot be answered.** Off and Understand both returned `I don't see any 'tool floor' here.` for `pick up the tool on the floor`, while the panel asks "Which setting worked out what you meant?" Steps to reproduce: Level 4, dial Off, type the sentence; set dial Understand with the model loaded; type it again. Reply is the same both times. The inspector shows the AI said `take` + `prybar` and the game discarded it because the AI's own paraphrase "take the tool from the floor" matched no item.
2. **Wrong guess accepted silently.** Level 3, dial Understand: `call my mom on the phone` → AI said `{"means":"make a phone call","type":"listen"}` → the game ran `listen` and printed `(listen)` / `A warning light clicks in the silence.` Maya sees an odd line and nothing says "the AI guessed wrong". Whether this is a bug or the intended lesson depends on the lesson's goal; either way nothing on screen points it out.
3. **Droid's hint ignores state.** Level 1: after taking the prybar and going south, `talk to droid` says "A prybar was left in the cockpit." I already carried it.
4. **World-picker buttons have no accessible names.** `read_page` showed three unnamed `button` elements for Drift / Hollow House / Temple of Vines in the lesson panel. A screen-reader user would hear nothing useful.
5. **Duplicated text in the page.** Every game reply appears twice in the page text (for example `You take the prybar.You take the prybar.`), and "The Wayfarer" appears in a hidden copy of the Play view. A student does not see it; a screen-reader user would hear replies twice. This was also in round 2.

**Might be me**
- At 1280x800 emulation, the first screenshots showed only the top-left 800x600 of the page, so the right-hand panel was cut off. A re-sized window fixed it (this happened in rounds 1 and 2 too). The pane's own size without emulation is 1024x768.
- Screenshots often lagged one step behind what I had just done. Twice I thought the model had not been selected because the screenshot and my `select.value` read both showed "Off", but a later screenshot showed it loaded. Pressing Escape while the dropdown was open may have undone one selection before I noticed. I believe both are tool timing, not app bugs.
- I did not scroll the Level 4 panel to the top between steps. If Maya does not scroll, step 6 and the "Saved." / Continue box would be below the visible part of the panel.

## What Maya would say she learned (in her words)

"The game only knows a few words. If I type a normal sentence, like 'can you grab the prybar for me', the AI turns it into the real command, and it showed me 'take the prybar'. When I typed something the game can't do, the AI guessed a command anyway, like 'go south' or 'listen', and the game either threw the guess away or, once, just did it, which was weird. Turning the dial up made the AI write its own lines, like what the droid said about the ship, but the droid talked about a bolt that doesn't exist, so the AI can make stuff up. The AI can write words but the game's rules decide what's real, so I had to add the mug myself to make it a real thing. I can choose how much the AI is allowed to do: homework helper gets some help, medicine gets none because a wrong answer could hurt someone, and the story game can improvise because it's just for fun."

She would not say anything about parsing or tokens. The step-3 puzzle on Level 4 could leave her thinking Understand "didn't work", which is a different lesson from the intended one.

## Compared with round 2

Round 2 played **Hollow House** and this round played **Drift**, so a few items have different wording (poker/ghost became prybar/droid).

| Round-2 problem | This time |
|---|---|
| Level 1: `open chest` gives only "You can't open the old chest." with no nudge | **Still there.** `open supply crate` → "You can't open the supply crate." |
| Level 1: the "Stuck?" hint works | **Fixed and still working.** "Stuck? Go `south` and `talk to droid`." worked. |
| Level 1: `wind the clock` error | **Not tested** (different world). |
| Level 2: "ParseError" in the inspector | **Fixed.** It now says "Could not understand: nothing called “coffee mug” here". |
| Level 2: "108 words" in the explanation | **Still there** (now "109 words"). |
| Level 2: right panel off-screen at larger window sizes | **Same tool problem**, appeared once, went away after I re-set the size. |
| Level 3: Interpreter menu location | **Fixed.** "AI Interpreter menu at the top right", with an arrow "← pick a model". |
| Level 3: model options with plain labels | **Still good.** "recommended · gets 8 in 10 right". |
| Level 3: `⚙ AI rules: model webllm · …` line | **Still there.** |
| Level 3: odd reply "Where do you want to go? The moon is not reachable." | **Fixed.** Now "What do you want to do? I can't do that here, and I won't guess." |
| Level 3: inspector mostly JSON and token counts | **Still there**, though the new plain sentence "The AI guessed go south. Nothing you typed asked for that, so the game threw the guess away and asked you instead." is a real help. |
| Level 4: step 3 "tool floor" message | **Still there**, and now **worse**: on Understand it no longer works (see bug 1). Round 2 said Understand fixed it. |
| Level 4: nowhere to answer "Which setting worked out what you meant?" | **Still there.** |
| Level 4: Improvise ghost answer contradicts the game and is not pointed out | **Improved.** Step 5 now says "Is what it says true in the game? Check with `look` and `inventory`." The droid's made-up bolt was easy to spot. |
| Level 4: "Saved." and Continue below the fold | **Partly improved.** `Saved.` shows next to the button and the box appears below step 6; still needs scrolling the panel if you have not already. Step 6 now gets a tick. |
| Level 4: steps 1 to 3 never ticked | **Still there.** Only steps 4 to 6 get ticks. |
| Level 4: first "Save my setting" with empty reason showed nothing | **Not tested** (I always filled the reason). |
| Level 5: `entity_examined` / `turn_count` in the inspector | **Still there.** |
| Level 5: does "Save changes" undo the player's move? | **Fixed (confirmed).** I held the mug, saved the alias, typed `drop cup` → `You put down the coffee mug.` |
| Level 5: "Also called" alias vs AI | **Fixed.** `drop cup` and `examine drink` worked after saving "cup, drink". (The AI was set to Understand, but the game's own reader handled `drop cup`, so I am fairly sure it was the alias.) |
| Level 6: "Invent" vs "Invent events" | **Fixed.** Level 4 now says "Invent — the AI decides what happens" and the card says "Invent". |
| Level 6: "See my AI rules card" button stays after the card is showing | **Fixed.** Now "Print my card" and "Back to my answers". |
| Duplicated text in the page | **Still there.** |
| Replies 1.4 to 3.8 s | **Same range.** AI on is about 2 to 5 s, Improvise the longest. |
| Round 2 "Could not verify": Drift, `inventory` | **Now covered.** Played Drift; `inventory` works (`You are carrying nothing.`). |

**New this round:**
- Level 4 step 3 no longer demonstrates "Understand works" (bug 1).
- `call my mom on the phone` becomes `(listen)` and is accepted (bug 2).
- Four different replies for four different "cannot do" requests on Level 3.
- The droid's hint ignores that Maya already holds the prybar.
- The world-picker buttons are unnamed for assistive tech.

## Top five fixes (most valuable first)

1. **Make Level 4 step 3 work, or change the question.** Either pick a sentence the AI can resolve safely (for example `grab the bar`, if the game accepts it) or reword the step: "Notice the game said no on both. Open the second one and read why." Add a place for Maya to see the answer.
2. **Flag wrong AI guesses on screen.** When the AI's guess is accepted (like `call my mom` → `(listen)`), say so in the reply, e.g. "(the AI guessed: listen)". Add one sentence to Level 3 saying that the AI can get it wrong.
3. **Plain-English inspector.** Replace `item_taken`, `action_failed · already_carrying`, `entity_examined`, `turn_count`, the raw JSON, tokens, "parser" and "paraphrase" with sentences, and put the raw details behind a "Details" toggle.
4. **Give the Level 1 crate a hint and make the droid notice the prybar.** `open supply crate` should say something like "It's stuck shut. Maybe a tool would help." The droid should say "Nice, you have the prybar" once Maya has it.
5. **Finish the small wording and layout fixes.** Show Maya her own words in failure messages (not "tool floor"), tick steps 1 to 3 in Level 4, remove "109 words", rename "Benchmark" and "boundary", and give the world-picker buttons accessible names.

## Could not verify

- A cold model download. The model said "downloaded" on first selection, so another playtest had already cached it; I cannot say how long 1.7 GB takes in a classroom.
- **Level 3 and Level 4 were done with a model that was available.** All AI steps were experienced.
- Hollow House and Temple of Vines (I played only Drift).
- `wind the clock` and any step that depends on another world.
- Printing the card (I did not press "Print my card"), phone or tablet sizes, sizes below 1280x800 (the pane's natural size was 1024x768), Back/Previous after finishing, and whether answers survive a reload.
- I did not read the console for errors or check the network.
- Timing: I used a polling script, not a stopwatch; numbers include about 0.3 to 0.5 s of script overhead. The per-level minutes are estimates of what Maya would spend, not measured.
