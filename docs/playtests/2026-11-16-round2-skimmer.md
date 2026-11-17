# Round 2 playtest: "Dev", the skimmer (2026-11-16)

Port 5184, Learn view, `hoai-adventure`, started in the **Drift** world. Browser pane at 1400x900. Played as Dev (16, skims, clicks Continue and "Next →" early, tries to break things). I did not read source or lesson JSON, and I did not open anything in `docs/playtests/` until my notes were drafted. Model for levels 3-4: **Qwen2.5 1.5B (the one marked "recommended")**. WebGPU was available. It reached "ready" in about 20 seconds, which looks like a cached copy, so I did not see a cold 1.7 GB download.

## Conclusion

Dev has a better time than in round 1, but not enough better to stay for the hour.

- **Better:** Level 1 can now be won (6 to 7 commands, no dead end). The Level 2 hint shows up by itself. The "My AI rules" card, the Level 6 banner and duplicate names behave. Skipped levels show as skipped on the progress bar. The dial sits at the top of the Level 4 panel instead of the bottom.
- **Still bad:** The lesson can still be finished without learning anything. Level 4 passes on the reason "idk". Level 5 passes with the description "lol it is a banana". Level 6 passes with the clinic app set to "Invent" for the reason "lol". The card then prints all of it.
- **New problem:** Level 3 does not work as written with the recommended model. In 5 tries the AI never asked a question. It guessed, and twice it did something I never asked for (see Bug 1). Continue never unlocked, so Dev had to use "Next →". That level is meant to be the "meet the AI" moment.
- **Where Dev checks out:** At the Level 3 wall (nothing he does unlocks it), and at Level 4's long 6-step list. The best moment is Level 4's "AI WROTE THIS" lines, which he does see even though he ignores the steps.

## Verdict

Would Dev stay engaged? Yes for Levels 1, 2 and 4. He had fun winning Drift, the failed "examine coffee mug" in Level 2 is a good surprise, and watching the AI invent a mug and a droid line in Level 4 is the best thing in the lesson. He leaves at Level 3 (stuck) and again at Level 5/6, where nothing he types is checked and the form feels like homework.

## Per-level table

Times are Dev-time estimates (not stopwatch). Level 1 took longer because I replayed it three times: a world switch wiped my win, then a reload wiped it again.

| Level | Minutes | Passed? | Skimming enough? |
|---|---|---|---|
| 1 Play | about 3 per run, 3 runs (about 9 incl. world switch and reload tests) | **Yes, genuinely.** Won Drift in 6 turns (take prybar, south, use prybar on crate, take cell, north, use cell on console). The first time it said "Escaped in 7 turns" because I also typed `talk to droid`. | No. It needs the real puzzle. Clicking Continue early does nothing (greyed out). "Next →" still skips it. |
| 2 Look inside | about 2 | **Yes, genuinely.** Typed `examine coffee mug`, saw the yellow hint appear by itself, clicked the typed line, "How it was understood" opened on the first click. | Barely. Needs two actions, but both are obvious. |
| 3 Meet the AI | about 6 (20 s model load, then 5 AI commands) | **No.** Continue never unlocked. I used "Next →". The progress bar shows the level as skipped (hatched). | Not applicable. Skimming was not enough, and neither was doing the task. |
| 4 The AI dial | about 1 to pass, about 4 more because I tried steps 4 and 5 | **Yes, but not as intended.** Clicked Save with an empty reason, got "Write a reason for your setting first." Typed `idk`, clicked Save, "Your AI boundary is set" appeared and Continue enabled. Steps 1-3 never done. | Yes. |
| 5 Make it real | about 5 | Yes. Needed the name "coffee mug" and an `examine mug`. Description was `lol it is a banana`. | No for the name, yes for the description. |
| 6 Real life | about 1.5 | Yes, with Invent for all three apps and reasons "ai knows best", "lol", "fun". | Yes. |
| My AI rules card | n/a | Card shows my junk answers as written. I did not press "Print my card". | n/a |

## Things that broke or behaved oddly

### Definitely a bug or a design flaw (I reproduced it)

1. **Level 3 never gets the AI to ask a question, and the AI quietly does things you did not ask for.**
   - Steps: Level 3, Interpreter = Qwen2.5 1.5B, wait for "ready", dial Understand. Type, one at a time: `fly to the moon`, `order a pizza`, `hack the mainframe and launch the missiles`, `open it`.
   - Happened: `fly to the moon` became `(listen)` ("A warning light clicks in the silence."). `order a pizza` became `(go south)` and moved me to the Cargo Bay. `hack the mainframe...` became `(use the prybar)` → "Nothing happens." `open it` became `(open the supply crate)` → "You can't open the supply crate." Never a question. The yellow hint ("Now ask for something the game cannot do... watch for a question") stayed on, Continue stayed grey.
   - Expected: either the AI asks "Do you mean...?" for impossible requests, or the level passes on the mistaken guess (the text says "If it guesses a command you did not mean, notice that too"). A silent move south from "order a pizza" is also a real game change.
2. **Level 4 still passes without doing the task, and a one-word reason counts.**
   - Steps: Level 4, click **Save my setting** (blocked with "Write a reason first"), type `idk` in Reason, click Save.
   - Happened: "Your AI boundary is set. Be ready to explain it." and Continue enables. None of the steps were done. Improvement from round 1: an empty reason is now blocked.
3. **Level 5 does not check the description.**
   - Steps: Level 5, name `coffee mug`, description `lol it is a banana`, Add it to the world, `examine mug`.
   - Happened: "The mug is real now: it is in the rules, not only in the words." and Continue enables. The card prints the banana line under "coffee mug".
4. **Level 6 accepts any answer, including Invent for medicine with the reason "lol".**
   - Steps: pick Invent for all three apps, type one short reason each, Continue.
   - Happened: "You set all three. Be ready to explain what made them different." They were not different. The card prints them as written. There is no pushback on "The AI decides how much medicine you should take."
5. **Switching worlds loses the Level 1 win and the Level 5 mug, with no warning, but keeps everything else.**
   - Steps (a): win Drift in Level 1 (Continue turns teal), click the Hollow House card, then click Drift again. Result: game reset, Continue greyed. No confirmation.
   - Steps (b): finish all six levels in Drift, go back to Level 1, click Hollow House, go to Level 6, open the card. Result: the card says "In my game, Hollow House: I set the AI dial to Understand ... Why: idk", but "What I made real" says "I have not added anything to the world yet." while Level 5 still shows as done. The dial and reason silently moved from Drift to Hollow House.
6. **A win in Level 1 is lost on reload, and a completed Level 1 stays locked when you come back.**
   - Steps (a): win Level 1, reload without clicking Continue. Result: game reset, Continue greyed. (The game state is not saved, so this is arguably expected.)
   - Steps (b): finish the lesson, navigate to `#learn/hoai-adventure/1/1`. The progress bar shows Level 1 as done, but Continue is greyed and the game is fresh. I have to win again or use "Next →". Reloading mid-Level-5 kept the saved mug but re-locked Continue until I examined it again (same as round 1).

### Might be me (not sure it is a bug)

1. **Typing a command while the model is still loading answers as if the AI were off.** Steps: choose a model, immediately type `fly to the moon` while the bar is at about 18%. The inspector said "The AI is off." and the reply was "I don't know the word 'fly'", then a line "AI rules: model webllm..." was printed. Confusing for a moment. I do not know whether "AI is off" is meant to say "not loaded yet".
2. **AI-on error text leaks a wrong guess.** Before the mug existed, `examine mug` with AI on said "I don't see any 'thing' here." The model had guessed "thing". The student never typed "thing".
3. **Level 3 with a different model.** I only tried Qwen2.5 1.5B. A smaller model might ask questions more or less often. I did not test it.
4. **Accessibility tree names.** In the first read of the page the three world cards showed up as buttons with no name. A screenshot shows the names, so this may only be how my tools read them.
5. **Screenshot cropping at 1400x900.** With the viewport emulated at 1400x900 my screenshots showed only the left part of the page (the "How it was understood" panel was cut off). It went away when I cleared the emulation. This looks like my tooling, not the app.
6. **Empty-form message.** With the description box empty, **Add it to the world** shows the browser's own "Please fill out this field." bubble. That works, but it is not styled like the rest of the app. Same as round 1.

## Timing

- **AI off:** `look` and `take prybar` in Level 2 each showed "processing…" for about 1.1 to 1.4 seconds (measured with a page observer). In Level 1 I typed six commands back to back and they all registered, but I did not time them.
- **AI on (Qwen2.5 1.5B):** the inspector reports 1.8 to 3.4 seconds for the model alone. From pressing Enter to the reply in the transcript was about 4 to 9 seconds. `can you grab the prybar for me` took about 3.5 seconds. `open it` still showed "processing…" 4 seconds after I pressed Enter and finished by about 9 seconds. This is estimated, not a stopwatch.
- In Level 4, Fill gaps and Improvise replies took roughly 5 to 8 seconds each.

## Whether the lesson can be passed without learning anything

Yes, and it is still easy. Level by level, in the order Dev would do it:

1. **Level 1:** needs the real puzzle, or click **Next →** (the bar shows it was skipped).
2. **Level 2:** type `examine coffee mug`, click the typed line. This one still needs a little attention.
3. **Level 3:** click **Next →** (the level cannot be passed with this model, as above).
4. **Level 4:** type `idk` in Reason, click **Save my setting**.
5. **Level 5:** name `coffee mug`, any description, `examine mug`.
6. **Level 6:** click any dial for each app, type a word as the reason.
7. **Card:** shows whatever was typed.

## What Dev says he learned about AI

"Most of it I knew. Chatbots make stuff up, sure. Two things were new. One: in Fill gaps it wrote 'the forgotten coffee mug lies on the navigation console, its surface cold and lifeless' and the panel said AI wrote this, so the mug isn't actually in the game. I couldn't pick it up until I made it in the form. That's kind of cool. Two: when I typed 'order a pizza' the game just walked me south. I didn't ask for that. Does the AI just guess when it doesn't get you? That's a bit scary for a clinic app. The rest of it, the three apps and the dial reasons, I just clicked through. I wrote 'lol' for the medicine one and nothing happened." (Everything else did not land.)

## Compared with round 1

| Round-1 problem | This time |
|---|---|
| Every command shows "processing…" for 5-10 s, even with AI off | **Mostly fixed.** AI off: about 1.1-1.4 s in Level 2 (measured). I did not see 5-10 s. AI on is still 4-9 s per command. |
| Level 1 dead end (goal verb "wind clock" does not work in Hollow House) | **Not tested.** I only played Drift, where there is no dead end, and I did not play Hollow House or Temple of Vines past the first room. |
| Level 1 can be skipped and the lesson still ends in success | **Better, still possible.** "Next →" still skips Level 1 and Level 3, but the progress bar now shows skipped levels as hatched instead of filled. The card and "You finished the lesson" still appear. |
| Level 2: first click on the typed command did not open the panel | **Fixed.** Opened on the first click. The yellow hint appeared by itself. |
| Level 3 pass message did not match what it checked | **Different problem.** This time I could not pass it at all (Bug 1). |
| Level 4 passes with zero engagement (empty Save) | **Partly fixed.** An empty reason is blocked, but `idk` passes (Bug 2). |
| Level 4: dial at the bottom of a long panel | **Fixed.** The dial and Save sit at the top right, with the steps on the left. Steps now get tick marks. The steps are still long. |
| Level 5: duplicate name gives an unusable question ("prybar or prybar") | **Fixed.** Adding a thing named `prybar` says: "The game already has something called 'prybar'. Pick a different name." |
| Level 5: description not checked | **Still there** (Bug 3). |
| Level 5: Continue greyed with no explanation | **Fixed.** The yellow note "The mug is in the world. Now examine it in the game." shows what is left. |
| Level 6 banner and card report the live dial, not the saved one | **Fixed.** I saved Understand, switched the radio to Improvise without saving, and both the banner and card said Understand. |
| Switching worlds gives no warning and leaves stale state | **Still there**, in a new form (Bug 5): no warning, and the card now moves the dial and reason to the new world. |
| Level 6 reasons optional / card has blank "Why:" lines | **Partly fixed.** The "Why there?" field is now required (the "3 still need a setting and a reason" line). Any text counts. |
| Interpreter menu percentages mean nothing | **Fixed.** The menu now says "recommended" and "gets 8 in 10 right". I did not test whether Dev would understand it. |
| Level 5 empty form shows the browser's own bubble | **Still there** (minor). |
| Input row drifting up in Level 5 | **Not seen.** |
| Printing the card | **Not tested.** |

New this round:
- Level 3 never gets a question from the AI, the silent "go south" from `order a pizza` (Bug 1).
- A completed Level 1 stays locked when you revisit it (Bug 6b).
- A command typed while the model is loading is answered as "AI is off" (Might be me, 1).
- The "AI WROTE THIS" lines in Level 4 are a clear win.

## Top five fixes (most valuable first)

1. **Make Level 3 reachable.** Make the AI ask a clarifying question for impossible requests (or pass the level when the AI visibly guessed wrong). Stop it from silently running `go south` for "order a pizza".
2. **Check what the student wrote in Levels 4, 5 and 6.** Level 4 needs at least a changed dial. Level 5 needs a description that is not obviously junk, or a line saying that the game does not check it. Level 6 should push back when Invent is chosen for medicine with a one-word reason.
3. **Warn before switching worlds, and keep the dial and reason with the world they were set in.** Say what will be lost (the Level 1 win, the Level 5 mug).
4. **Keep Level 1 completion.** A finished Level 1 should keep Continue enabled when the student comes back or reloads.
5. **Shorten Level 4's step list** (or show one step at a time), and show a clear "AI is still loading" state so a command typed too early is not answered as "AI is off".

## What I could not test

- **Hollow House and Temple of Vines gameplay.** I only played Drift. I did not test round 1's `wind clock` dead end.
- **Cold model download.** The 1.5B model loaded in about 20 seconds, apparently cached. I did not see a first-time 1.7 GB download. I did not try the 0.5B or Llama models. The WebGPU-missing case did not happen (WebGPU was available).
- **Level 3 pass.** I never saw the AI ask a question, so I do not know what the pass looks like, or whether Continue unlocks.
- **Level 4 steps 1-3.** I did not run the Off / Understand comparison. I did steps 4 and 5 (Fill gaps and Improvise). Step 5's tick did not appear in my screenshot.
- **Printing the card.** On screen only.
- **Timings** are estimates, except the two AI-off measurements in Level 2.
