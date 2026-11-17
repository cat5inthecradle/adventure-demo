# Playtest round 2: Hour of AI lesson, first-timer ("Maya", 13)

Date: 2026-11-16. Port 5183 (`playtest-c`), in-app browser at 1280x800 (first at 1400x900, see "Might be me"). World: **Hollow House**. Interpreter: Qwen2.5 1.5B ("recommended"). WebGPU was available (`navigator.gpu` present). I played Maya and did not open the round-1 report until after I had finished all six levels and the card.

## Conclusion

Maya finishes all six levels and the card, and has a noticeably better time than in round 1. Every round-1 blocker I could re-test is gone: the Level 1 hint works, Level 3 passed on the first try, replies are fast, and Level 6 no longer lets her skip the reasons. I never got stuck for more than about a minute and never needed the "Next →" skip.

What is left is polish, not blockers:

1. Level 2 and the typed-command inspector still show developer words ("ParseError", "turn_count: 2 → 3", "entity_examined").
2. Level 4's step 6 and the "Saved." message are easy to miss because they sit at the bottom of a scrolling panel.
3. The Level 4 ghost answer ("The poker is in the hall.") is wrong while Maya is holding the poker, and nothing tells her that this is the AI making things up.

**Would Maya finish in a class period?** Yes, easily. I did not use a stopwatch. By my estimate it is about 15 minutes of active play, or 20 to 25 with reading and typos, against 35 to 45 in round 1. The model was ready in under about 30 seconds. I cannot say whether that was cached, so a cold 1.7 GB download in a classroom is untested. **Would she enjoy it?** Mostly yes. Level 1 is a small puzzle with a payoff, and the "AI WROTE THIS" lines and the real portrait in Level 5 are the fun parts. Levels 4 and 6 still read like a worksheet but are short.

## Timing of typed commands

I measured with a polling script, so each number includes about 0.2 to 0.5 s of tool overhead. The inspector's own number for the "fly to the moon" turn was 2633 ms.

| Dial / AI | What I typed | Time to reply |
|---|---|---|
| AI off (Level 1, dial Off) | `look`, `go east`, `use poker on chest`, etc. | Instant. Under 1 s every time. |
| AI on, Understand | `can you grab the poker for me` | About 1.5 s (a "processing…" line showed briefly) |
| AI on, Understand | `fly to the moon` | About 2.6 to 3.6 s |
| AI on, Understand | `pick up the tool on the floor` | About 3.8 s |
| AI on, Fill gaps | `examine the portrait` | About 2.0 s |
| AI on, Improvise | `ask the ghost about the house` | About 3.0 s |
| AI on, Improvise, plain move | `go east` | About 1.4 s |
| Level 5, AI still on | `examine portrait`, `take portrait`, `look at the painting` | About 1.6 to 1.8 s |

Round 1 said 5 to 15 s per command, so this is a big improvement. Nothing felt slow enough to make Maya wonder if it was broken.

## Per-level table

Minutes are estimates, not stopwatch times, except the model load (under about 30 s).

| Level | Est. min | Passed? | Most helped / most hurt |
|---|---|---|---|
| 1 Play | ~3 | Yes. "Escaped in 11 turns." | Helped: "Stuck? Go `east` and `talk to ghost`" works, and the ghost then says to use the poker. Hurt: `open chest` gives only "You can't open the old chest." with no nudge. |
| 2 Look inside | ~1.5 | Yes | Helped: the game saying "I don't see any 'faded portrait' here." right after the panel said to type it. Hurt: "ParseError" in the inspector. |
| 3 Meet the AI | ~2 (2 commands, plus model load) | Yes, first try | Helped: the panel gives both exact sentences, so Maya never guessed. Hurt: the reply "Where do you want to go? The moon is not reachable." reads oddly. |
| 4 The AI dial | ~4 | Yes | Helped: the dial sits beside the game and the six steps name the exact commands. Hurt: steps 1 to 3 never get ticked, and the "Saved." confirmation is easy to miss. |
| 5 Make it real | ~2 | Yes | Helped: examining the portrait she just wrote. Hurt: the inspector shows `entity_examined` and `turn_count: 2 → 3`. |
| 6 Set the dial for real life | ~2 | Yes | Helped: three concrete apps, and the counter "3 still need a setting and a reason." Hurt: "Invent" here vs "Invent events" in Level 4. |
| Card | n/a | Shown after Continue | Looks good and has my reasons. Not printed. |

## Where Maya got stuck or confused

**Level 1**
- Typed `help`, `look`, `examine clock`, `go east`, `talk to ghost`. All worked. The ghost said: `'That chest won't open for bare hands,' the ghost whispers. 'There is a poker in the hall.'`
- Typed `open chest` (a natural guess). Screen: `You can't open the old chest.` I expected a hint, since the ghost had just said the chest needs something. It only worked after `go west`, `pick up the poker`, `go east`, `use poker on chest`. Short-lived confusion, because the ghost had told me where the poker was.
- Panel text: "Stuck? Go `east` and `talk to ghost`." This works now. In round 1 it failed.

**Level 2**
- Typed `examine faded portrait`. Screen: `I don't see any 'faded portrait' here.` The amber note said: "Now click the command you typed to see why the game didn't understand it." Because I clicked at 1400 px wide and could see only part of the page (see "Might be me"), I had to click the command again. The panel then said: "You found the gap between the words and the world." Passed.
- The inspector had these steps: "Split into words", "Fix typos" ("A word the game does not know is swapped for one of the 108 words it does know here, but only when exactly one is close."), "Find the command word", Look for "faded portrait" ("No match."), "What the game understood" (`ParseError: nothing called “faded portrait” here`), "AI" ("The AI is off. This is where an AI would try to work out what the game could not."), "Write the reply". It is much shorter than round 1 and mostly readable. I would still stumble on "ParseError" and "108 words".

**Level 3**
- Panel: "Turn on the AI: pick a model from the **Interpreter** menu at the top right and wait for it to load." I found the menu because the panel says where. The dropdown lists each model with plain text such as "gets 8 in 10 right".
- After picking the model I saw a progress percentage and then "ready" next to the menu. The terminal printed `⚙ AI rules: model webllm · Qwen2.5 1.5B · prompt v3 · dial Understand · tone any · theme any`. Maya would skip over this line.
- Typed `can you grab the poker for me`. Screen: `(take the fire poker)` then `You take the fire poker.` Good, and the bracketed line shows what the AI turned it into.
- Typed `fly to the moon`. Screen: `Where do you want to go? The moon is not reachable.` The panel turned green: "You saw the AI turn your words into a command, and ask when it was not sure." Passed. The wording is odd, since the game is asking where to go and then saying the answer is impossible. Maya would still get the idea.
- The inspector for that turn showed `ParseError: unknown verb “fly”`, `asked a question`, the raw reply `{"means":"type":"clarify","question":"Where do you want to go? The moon is not reachable."}`, "966 in / 29 out tokens" and a "Full prompt" link. This is the one place the lesson shows what the AI actually did, and it is mostly JSON and token counts.

**Level 4**
- Step 2, dial Off, typed `examine the portrait`. Screen: `I don't see any 'portrait' here.`
- Step 3, still Off, typed `pick up the tool on the floor`. Screen: `I don't see any 'tool floor' here.` Maya would ask where "tool floor" came from, because the game dropped her words "the", "on" and "up" and joined the rest. Then Understand, same command: `(take the fire poker)` then `You take the fire poker.` The panel asks "Which setting worked out what you meant?" but there is nowhere to answer it.
- Step 4, Fill gaps, `examine the portrait`. Screen: `AI WROTE THIS` / `The faded portrait hangs on the wall, its colors dulled by time and age.` This is the best moment in the level.
- Step 5, Improvise, `go east`, then `ask the ghost about the house`. Screen: `AI WROTE THIS` / `The pale ghost says, 'The chest won't budge. The poker is in the hall.'` Two problems. The ghost talks about the chest, not the house. And I was already holding the poker. Nothing in the lesson tells Maya that this is a made-up line that is wrong for the game state.
- Step 6: I first pressed "Save my setting" with Improvise selected and Reason empty. I saw no message, then the form shifted down by about 10 px, so I could not tell what happened. Then I chose Fill gaps, typed `it describes stuff but does not change the game` in Reason and pressed Save. Screen: `Saved.` next to the button, and, further down the instruction panel (below the visible area), "Your AI boundary is set. Be ready to explain it." and Continue. Maya has to scroll the instruction panel to find Continue.
- The checkmarks: steps 4 and 5 turn into ✓ when done. Steps 1, 2, 3 and 6 stay as plain numbers. In round 1 the numbering was inconsistent too, and it is less so now.

**Level 5**
- The form was already filled with Name `faded portrait`. I pressed "Add it to the world" with the description empty. Screen: the browser's `Please fill out this field.` That is clear.
- Typed a description and pressed the button. Screen: `Added. Now examine it in the game.` and in the terminal `— The world has changed. Your game carries on from where you were. —`, and the room now lists "fire poker, grandfather clock and faded portrait".
- Typed `examine portrait`. Screen: `A woman in an old dress stares at you. Her eyes seem to follow you around the room.` (my own words). Typed `take portrait`. Screen: `You take the faded portrait.` The panel turned green: "The portrait is real now: it is in the rules, not only in the words."
- Typed `painting, picture` into "Also called", pressed "Save changes". Screen: `Saved. Try it in the game.` Typed `look at the painting`. Screen: my description again. The AI was still on (dial Fill gaps), so I cannot say whether the alias or the AI made this work.
- After "Save changes" the terminal again printed "The world has changed...", and the room list afterwards showed only "fire poker and grandfather clock", with no portrait in the room. That is consistent with the portrait still being in my pocket. I did not type `inventory` to confirm.
- The inspector for these turns shows `entity_examined` and `turn_count: 2 → 3` in plain code type.

**Level 6**
- Three cards, each with five radio buttons and a one-line "Why there?" box. At first I misclicked "Understand" instead of "Fill gaps" on the third card because the cards are different heights. Fixed by clicking again.
- While I filled things in, the footer said "3 still need a setting and a reason.", then "2 still need...", then "All three are set." Continue stayed greyed out until the last reason was typed. After Continue the card appeared and the panel said "You finished the lesson." with a button "See my AI rules card", although the card was already on screen.
- Level 6 names the last setting "Invent" ("The AI decides whether your answer is right and gives you the grade."). Level 4 calls it "Invent events" and says it is locked. Still inconsistent.

## Wording a 13-year-old would not understand

- "ParseError: nothing called “faded portrait” here" (Level 2 inspector), and "ParseError: unknown verb “fly”" (Level 3).
- "A word the game does not know is swapped for one of the 108 words it does know here" (Level 2 inspector). Round 1 said 108 too, so the count is now repeated in the explanation.
- "⚙ AI rules: model webllm · Qwen2.5 1.5B · prompt v3 · dial Understand · tone any · theme any" (terminal line each time the dial changes).
- `{"means":"type":"clarify","question":"..."}`, "966 in / 29 out tokens", "Full prompt" (Level 3 inspector).
- "entity_examined", "turn_count: 2 → 3" (Level 5 inspector).
- "The AI can write words, not rules." and "Invent events is locked—use what happened in the game to debate why." (Level 4 panel).
- "Why is this locked? Inventing events can change the story without the player or author choosing." (Level 4 dial).
- "Interpreter" (menu name), "model webllm", "prompt v3", "tone", "theme". Maya would not know what a "tone" or "theme" box is for, but they are optional.
- "Your AI boundary is set. Be ready to explain it." ("boundary" is an unusual word here.)

## Anything that looked broken

**Definitely a bug or content mistake**
1. **Level 4 step 5 answer contradicts the game.** With dial Improvise, I was carrying the fire poker and typed `ask the ghost about the house`. Screen: `The pale ghost says, 'The chest won't budge. The poker is in the hall.'` The ghost ignores "the house" and says the poker is in the hall. This is a good teaching example if the lesson points it out, but it does not.
2. **Level 4 step 3 replaces her words.** `pick up the tool on the floor` with the dial Off gives `I don't see any 'tool floor' here.` The game quotes a phrase Maya never typed. The same text appeared in round 1, so it is still there.
3. **Level 6 vs Level 4 naming.** "Invent" vs "Invent events". Same as round 1.
4. **Duplicated text in the page.** Every game reply and room description appears twice in the page text (for example "You take the fire poker.You take the fire poker.", and "The WayfarerThe Wayfarer"). A hidden copy of the Play view with the Drift world is also in the page. A student would not see it. A screen-reader user would hear every reply twice.

**Might be me**
- At first the window was 1400x900. The screenshot tool then showed only the top-left 800x600 of the page, so the right-hand "How it was understood" panel was off-screen and a click on the typed command seemed to do nothing. After I resized to 1280x800 everything was visible. I believe this was my tool (round 1 saw the same), but I cannot rule out that the first click toggled the panel open and the second click closed and reopened it.
- Screenshots often showed the page one step behind. I re-took them when something looked wrong.
- Level 4: my first "Save my setting" click (Improvise, empty Reason) showed nothing and the form moved down about 10 px. I may have missed the button as it moved. I do not know whether that click saved anything.

## What Maya would say she learned (in her words)

"The game only knows a few words. When I typed the poker sentence the AI changed it into the real command, `take the fire poker`, and I could see that. When I asked for something silly like flying to the moon it asked me a question instead of just doing something. When I turned the dial up, the AI wrote its own lines, like the picture description and the ghost, and those were labeled 'AI wrote this', but the ghost said something that was not even true because I already had the poker. So the AI can write words but it can't change what is real in the game. I had to add the portrait myself to make it real. I get to pick how much the AI is allowed to do. For homework I would let it explain what the teacher wrote, and for medicine I would turn it off, because a wrong answer could hurt someone."

What she would not say is anything about parsing or tokens, which is a good outcome. The one thing she might get wrong is the ghost's line: she might think the AI is just "dumb" instead of seeing it as an example of the AI making things up.

## Compared with round 1

| Round-1 problem | This time |
|---|---|
| L1: hint `talk to ghost` fails in the first room | **Fixed.** Panel now says "Stuck? Go `east` and `talk to ghost`." and both work. |
| L1: goal "wind the stopped clock"; `wind the clock` returns "I don't know the word 'wind'" | **Fixed in the text, not typed.** The goal now says "find the key for the stopped clock" and "You're done when the clock chimes." I did not type `wind the clock`, so I do not know what it answers. |
| L2: "examine faded portrait" looks like a game bug until you click it | **Better.** The game's reply is the same, but the amber note tells Maya what to do next and the inspector explains it. |
| L2: heavy jargon in the step list ("Tokenize", "Match verb", "Resolve...", "Parser result") | **Mostly fixed.** Now "Split into words", "Fix typos", "Find the command word", "Look for…". "ParseError" is still there. |
| L3: no hint where the Interpreter menu is | **Fixed.** The panel says "the **Interpreter** menu at the top right". |
| L3: menu shows "36%", "51%", "80%" with no explanation | **Fixed.** Now "gets about 4 in 10 right", "gets about 5 in 10 right", "gets 8 in 10 right". |
| L3: "impossible request" example misread; six tries to pass | **Fixed.** The panel gives `can you grab the poker for me` and `fly to the moon`. Passed on the first try, two commands. |
| L3: `# AI rules: ...` line not understandable | **Still there.** Same line, shown each time the dial changes. |
| L4: step 1 asks her to choose a model again | **Fixed.** Now "If you have not already, choose a model...". |
| L4: numbering inconsistent, steps not marked done | **Partly fixed.** Steps 4 and 5 get ticks when done; steps 1 to 3 and 6 do not. |
| L4: step 4 does not say which command to retry | **Fixed.** Step 4 says `examine the portrait`. |
| L4: dial controls at the bottom of a long panel | **Fixed.** The dial is now a panel beside the game. |
| L4: "tool floor" message and ghost making things up are not pointed out | **Still there** (and the ghost answer was wrong in a different way this time). |
| L5: panel says `examine portrait`, form message says `examine faded portrait` | **Fixed.** The form message now says "Now examine it in the game." |
| L5: "Also called" does not show why it matters | **Still there.** `look at the painting` worked, but the AI was on, so I could not tell why. |
| L5: "Save changes" undoes the player's move | **Probably fixed, not confirmed.** The room list afterwards did not show the portrait on the floor, but I did not check inventory. |
| L6: Continue unlocks before the third reason is typed | **Fixed.** Continue stayed grey until all three had a setting and a reason. |
| L6: "Invent" vs "Invent events" | **Still there.** |
| Models/laggy replies: 5 to 15 s per command | **Fixed.** 1.4 to 3.8 s with the AI on, under 1 s with it off. |

New this round, not in round 1:
- The Level 4 "Saved." message and Continue button sit below the fold of the instruction panel, so Maya has to scroll to find them.
- The Level 4 Improvise example (`ask the ghost about the house`) produced an answer about the chest, and told Maya the poker was in the hall while she held it.
- The Level 6 "See my AI rules card" button stays after the card is already showing.
- Duplicated text in the page (see "Definitely a bug", item 4).
- Level 5's inspector shows `entity_examined` and `turn_count: 2 → 3`.

## Top five fixes (most valuable first)

1. **Replace the developer words in the inspector.** Show "the game could not find a 'faded portrait'" instead of `ParseError: nothing called “faded portrait” here`, and hide `entity_examined`, `turn_count: 2 → 3`, the raw JSON, and token counts behind a "Details" toggle.
2. **Make the Level 4 ending visible.** Show the "Saved." message and the Continue button in view without scrolling, and tick steps 1 to 3 and 6 too.
3. **Use the Improvise example to teach something.** Either change `ask the ghost about the house` so that the AI's invented line is obviously made up (and say so), or add a line to the panel: "Did the ghost say something that was not true? That is the AI making things up."
4. **Make the names match.** Use the same name for the last dial setting in Level 4 and Level 6, and say plainly in Level 6 what "Invent" means and why it is locked in the game.
5. **Fix small wording.** Show her own words in the failure message (`I don't see any 'tool floor' here.` becomes something with "tool on the floor"), reword `Where do you want to go? The moon is not reachable.`, and give `open chest` a hint pointing to the ghost's clue.

## Could not verify

- I played only **Hollow House**. I did not try Drift or Temple of Vines.
- I did not type `wind the clock` or `inventory`, so the "wind" error and whether Level 5's "Save changes" keeps the held portrait are not confirmed.
- I did not print the card or press "Print my card".
- The model was ready in under about 30 s on this port. I cannot tell if it was cached, so a first download of 1.7 GB in a classroom is untested.
- I did not test phone, tablet, or sizes below 1280x800, or Back/Previous after finishing, or whether answers survive a reload.
- I did not read the console for errors or check the network.
