# Playtest: Hour of AI lesson, first-timer ("Maya", 13)

Date: 2026-11-16. Port 5181, Chrome-based in-app browser at 1280x800. World chosen: **Hollow House**. Interpreter: Qwen2.5 1.5B (the "recommended" option). WebGPU was available.

## Conclusion

Maya finishes all six levels and gets her "My AI rules" card. The lesson idea is good: Off vs Understand vs Fill gaps vs Improvise is easy to *see*, and the "AI wrote this" labels are the best moment in it. But the first two minutes and Level 3 are rough enough that a real 13-year-old would likely stall or give up there.

The three things that most hurt:

1. **The Level 1 hint fails.** The hint says "Try `talk to ghost`". Typed literally in the first room it returns `I don't see any 'ghost' here.` The goal text also says "wind the stopped clock", and `wind the clock` returns `I don't know the word 'wind'.` Both are literal instructions that fail in the first minute.
2. **Level 3 is nearly unpassable on purpose.** The step says "ask for something impossible, such as opening a door with a sandwich". That did not produce a clarification. It took six tries to pass, and most of the wrong answers looked like the game being broken.
3. **Level 4 is a long scroll-and-click recipe with two vague steps.** Most of its length is setup, and nothing marks the steps done.

**Would Maya finish in a class period?** Yes if the AI model loads (it did in about 25 seconds for me, but it may have been cached; see "Could not verify"). I did not record clock time per level. My estimates: ~35–45 minutes of active play including waiting on responses. Each typed command takes roughly 5–15 seconds to answer. **Would she enjoy it?** Levels 1, 2 and 5 are fun. Level 3 is frustrating. Levels 4 and 6 are fine but read like a worksheet.

## Per-level table

Minutes are my estimates, not stopwatch times.

| Level | Est. min | Passed? | Most helped / most hurt |
|---|---|---|---|
| 1 Play | ~6 | Yes (escaped in 10 turns) | Hurt: the hint `talk to ghost` and the goal "wind the clock" both fail at the start. Helped: the `help` list, and the ghost saying "There is a poker in the hall." |
| 2 Look inside | ~2 | Yes | Helped: the amber callout "Now click the command you typed to see why the game didn't understand it." Hurt: the step-by-step panel uses jargon (see below). |
| 3 Meet the AI | ~10 (6 attempts) | Yes, on the 6th try | Hurt: the "impossible request" example gets misread instead of producing a clarification, with no hint on what to try. |
| 4 The AI dial | ~8 | Yes | Helped: the "AI wrote this" labels. Hurt: the dial controls are at the bottom of a long panel, so Maya scrolls back and forth. |
| 5 Make it real | ~4 | Yes | Helped: examining the thing she just wrote. Hurt: panel and green message disagree on the command (see below). |
| 6 Set the dial for real life | ~3 | Yes | Helped: three concrete apps. Hurt: it passes before the reasons are written, so reasons feel optional. |
| Card | n/a | Shown | Looks good. Not printed. |

## Where Maya got stuck or confused

**Level 1**
- Panel text: "Try `talk to ghost`." Typed `talk to ghost` in the Entrance Hall. Screen: `I don't see any 'ghost' here.` I expected the hint to work. The room text lists "fire poker and grandfather clock", with no ghost. The ghost is in the library, one room east. Maya has no reason to leave.
- Panel text: "find a way to wind the stopped clock." Typed `wind the clock`. Screen: `I don't know the word 'wind'. Type 'help' for commands.` I expected the verb in the instructions to work. The `help` list has no "wind" either. The key is used with `use X on Y`.
- Typed `look at the clock`. Worked: `The hands are frozen at midnight. A small keyhole waits in the clock's face.` That was the first thing that helped.
- Exit works fine (`go east`, `talk to ghost`, `take the poker`, `open the chest with the poker`, `take the key`, `use the key on the clock`).
- The Play-again button showed only a ▶ in the page text on first render and "Play again" a moment later. Not a problem.

**Level 2**
- Typed `examine faded portrait` (as instructed). Screen: `I don't see any 'faded portrait' here.` The room text says "a faded portrait", so this looks like a game bug until you click the command. The panel does say this is the point, so passing was easy. The inspector then explained "nothing called 'faded portrait' here", which is a useful moment.
- Seen once: right after I submitted the command the side panel took a moment to appear and the screen layout shifted.

**Level 3**
- Panel text: "Turn on the AI interpreter and type a natural sentence." No hint says where. I found the "Interpreter" menu top right myself, since I knew where to look. Maya might not.
- Menu options show "36%", "51%", "80%" with no explanation of what the percent means.
- The terminal printed `# AI rules: model webllm · Qwen2.5 1.5B · prompt v3 · dial Understand · tone any · theme any`. Not understandable to a 13-year-old.
- Typed `can you grab the poker for me`. Worked: `(take the fire poker)` then `You take the fire poker.`
- Typed `open the front door with a sandwich`. Screen: `(open the grandfather clock)` then `You can't open the grandfather clock.` The AI swapped in the clock. Not a clarification, and Maya never mentioned a clock.
- Typed `eat a sandwich`. Screen: `(listen)` then `Somewhere upstairs, a floorboard creaks.` The AI changed it into a different command. Confusing.
- Typed `use the thing`. Screen: `(use the fire poker)` then `Nothing happens.`
- Typed `pick it up`. Screen: `(take the fire poker)` then `You already have the fire poker.`
- Typed `fly to the moon`. Screen: `Where do you want to go? The moon is very far away. What would help here?` Panel turned green: "You saw the AI translate and admit uncertainty." Pass. That took six commands. Maya would be stuck for several minutes here with no hint.

**Level 4**
- Step 1 says "Choose a model from the menu at the top right and wait for it to load." I had already done that on Level 3.
- Steps 1–3 are numbered but steps 4–5 show empty circles and step 6 is "6", so the numbering is inconsistent.
- Step 3: "type `pick up the tool on the floor`". There is no tool on the floor in the room. With the dial Off: `I don't see any 'tool floor' here.` With Understand: `(take the fire poker)` then `You take the fire poker.` The comparison works, but Maya may not realize the AI guessed "tool" meant the poker.
- Step 4: "Set it to Fill gaps and try once more." It doesn't say *which* command. I retried `examine the portrait` and it worked (`AI WROTE THIS ... The faded portrait hangs loosely on the wall`). A different Maya might retype the tool command and see nothing new.
- Step 5 (Improvise): `ask the ghost about the house` gave `The pale ghost says, 'It's my home. The chest is in the attic, closed.'` The chest is in the same room. This is a good example of the AI making things up, but the lesson doesn't point it out.
- The dial radio buttons sit at the bottom of a long scrolling panel, so for each step Maya scrolls down to change the dial, then clicks the game input.
- Pressing "Save my setting" shows "Saved." and a green "Your AI boundary is set. Be ready to explain it." I left Tone on "Any" and filled Theme and Reason.

**Level 5**
- Panel text: "Type `examine portrait`, then `take portrait`." The green message in the form says: `Added. Now type "examine faded portrait" in the game.` Two different commands. I followed the panel. Both worked.
- `examine portrait` worked without any "Also called", so the "Also called" step doesn't show why it matters. Maya can't tell if `look at the painting` worked because of her alias or because the AI is still on.
- After "Save changes" the screen printed `— The world has changed. Your game carries on from where you were. —` and the room showed the portrait back on the floor even though I had just done `take portrait`. So the take was undone without saying so.

**Level 6**
- Level 6 shows "Invent" with "The AI decides whether your answer is right and gives you the grade." while Level 4 calls the same setting "Invent events" and says it is locked.
- Continue turned on after the three dials were chosen, before the third "Why there?" was filled. The card then included my third reason. Reasons are effectively optional.

## Wording a 13-year-old would not understand

- "Tokenize — Lowercase, strip punctuation, split on spaces." (Level 2 panel)
- "Fix typos — Unknown words are nudged toward the 108 words this room knows"
- "Match verb — The longest known verb phrase at the start wins."
- "Resolve 'faded portrait' — Match the words against everything you can see or carry."
- "Parser result", "ParseError: nothing called 'faded portrait' here"
- "Interpreter — No interpreter connected. This is where a language model would try to understand what the parser could not."
- "Drop filler words — Words like 'the' and 'at' carry no meaning for the game."
- "Engine events — Structured facts. The engine decides; nothing else does."
- "World changes — items.fire_poker.location: 'entrance_hall' → 'inventory'"
- "Action — The only thing the engine ever receives. {"type":"take","item":"fire_poker"}"
- "# AI rules: model webllm · Qwen2.5 1.5B · prompt v3 · dial Understand"
- "The AI can write words, not rules." (Level 4)
- "Invent events is locked—use what happened in the game to debate why."
- "Why is this locked? Inventing events can change the story without the player or author choosing."
- Interpreter menu: "~1.7 GB · 80% · recommended" (what is the 80%?)

## Anything that looked broken

**Definitely a bug (or a content mistake)**
1. Level 1 hint `talk to ghost` and the goal "wind the clock" don't work as written (see above). Steps: Learn → Level 1 → Hollow House → type `talk to ghost`.
2. Level 5 panel says `examine portrait` while the form's own message says `examine faded portrait`.
3. Level 4 numbering: steps 4 and 5 have no number, step 6 is numbered.
4. Level 5 "Save changes" silently undoes the player's last move (the taken portrait returns to the room).

**Might be me / could not tell**
- Level 3: the AI turned `open the front door with a sandwich` into `open the grandfather clock` and `eat a sandwich` into `(listen)`. That could be normal for the small model (Qwen2.5 1.5B), not a bug, but it makes the "ask for something impossible" step unreliable. A larger or smaller model might behave differently.
- My screenshots often showed the page a moment *before* the latest change (stale frames). I took a second screenshot when something looked wrong. I do not think the app has a lag bug, but I can't be sure.
- At first load the page was in a 1440x900 emulation and screenshots were cropped on the right. At 1280x800 it looked fine. I believe this was my tool, not the app.

## What Maya would say she learned (in her words)

"The game doesn't understand normal sentences by itself. It only knows certain words. The AI can turn what I say into the words the game knows. If I turn it up too far, it makes stuff up, like the ghost saying the chest is in the attic when it's right there. I get to choose how much the AI is allowed to do. For something like medicine you should keep it off, because wrong answers could hurt someone."

This matches what the lesson seems to be teaching (the AI as a translator vs a storyteller, and choosing a boundary), and the Level 6 card puts it in the right terms. What she would *not* say is anything about parsers, tokenizing or engine events, even though Level 2 spends most of its screen on them. She might also think the AI is "dumb" because it misread her sandwich request, rather than learning that translators can guess wrong.

## Top five fixes (most valuable first)

1. **Fix the Level 1 hint and goal.** Change "Try `talk to ghost`" to something that works in the first room (for example `examine grandfather clock`, then `go east`), and either teach `wind`/`use key on clock` or drop the verb "wind" from the goal text.
2. **Make Level 3's "impossible" step reliable.** Give an exact sentence that gets a clarification from the recommended model, or accept any "asked a question" or "didn't understand" result, and add a hint after two misses ("try something the game has no word for, like `fly to the moon`").
3. **Cut or simplify Level 2's jargon.** Show only "words you typed → what the game understood → what it couldn't find". Keep the full step list behind a "Details" toggle.
4. **Tighten Level 4.** Put the dial next to the game, number all steps, say which command to retry in step 4, and remove the already-done "choose a model" step.
5. **Make Level 5 and Level 6 consistent.** Use one command everywhere (`examine faded portrait` or `examine portrait`), say what "Also called" does, don't undo moves on "Save changes", and use the same name ("Invent events") in both levels. Require at least a few words in "Why there?" if reasons matter.

## Could not verify

- I played only **Hollow House**. I did not try Drift or Temple of Vines.
- I did not print the card or test the "Print my card" button.
- The model loaded in about 25 seconds. It may have been cached from earlier runs on this machine, so I cannot say how long a first-time 1.7 GB download takes.
- I did not test phone or tablet sizes, or sizes below 1280x800.
- I did not test Back/Previous navigation after finishing, or whether answers survive a reload.
- Console showed no errors.
