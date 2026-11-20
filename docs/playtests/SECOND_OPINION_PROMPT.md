# Second-opinion playtest: prompt

Give everything below the line to the reviewing model. It is written to be run from the root of this repository.

---

I want an independent second opinion on a web-based lesson, from the point of view of the students it is meant for. Run a set of user-testing sessions, one per persona, each as its own agent, and write up what each one found. Another team has already playtested it three times; I want to know what you see without being steered by what they saw.

## What you are testing

Adventure Lab is a six-level "Hour of AI" lesson for students aged 13 to 18, built on a short text adventure. Its idea is that an AI may work out what a player means, but only the game's author and its rules decide what is true. The levels are: 1 Play, 2 Look inside, 3 Meet the AI, 4 The AI dial, 5 Make it real, 6 Set the dial for real life. Finishing opens a printable "My AI rules" card. A separate, longer game called The Wayfarer sits behind "Play" in the top bar.

It is meant to be used in a classroom in one period, on school Chromebooks or laptops, by students working alone with a teacher in the room.

## Where to find it

Open **https://adventure-lab.apps.code.org/** in a real browser. There is no sign-in. The bare address opens the lesson at Level 1. Use a window at least 1280 by 800. A window narrower than 700 pixels or shorter than 500 is treated as a phone and opens the longer game instead of the lesson.

You have the right version if the page has a cream or navy retro look with three coloured stripes across the top, the top bar reads "Learn, Play, Benchmark", and the lesson says "Level 1 of 6". If you see a "Build" tab or eight levels, stop and tell me.

Test the published site, not a local copy. Do not start the dev server in this repository.

## How to run each session

- One agent per persona, each in a fresh browser profile or private window, so one tester's saved answers do not carry into the next. The site keeps answers in the browser's storage.
- Drive the page with real clicks and typing. If you cannot drive a real browser, say so and stop; do not review the lesson by reading its source.
- Stay in character. Type what that student would type, mistakes included, and use only what that student would know.
- You are running inside the lesson's own repository. While playing, do not read the source code, the lesson content in `curriculum/`, or anything in `docs/playtests/`. A student cannot, and the earlier reports would bias you. You may read them once all your sessions are finished, as described under "What to write".
- Levels 3 and 4 use an AI model that runs in the browser. It is chosen from the "AI Interpreter" menu at the top right, is a download of 1 GB or more, and needs WebGPU. Pick the one marked recommended. If it is not loaded and working within about five minutes, or WebGPU is missing, record exactly what the page showed and carry on with "Next →". Say clearly which steps you could not experience. This is a likely outcome in a headless browser, and it is a useful finding, because many school devices will hit it too.
- Have each tester play a different one of the three worlds where possible (Drift, Hollow House, Temple of Vines).
- Take a screenshot at each level and whenever something confuses, impresses or annoys the tester, so the notes are grounded in what was on screen.
- Do not change any file in the repository other than your reports, and do not commit.

## The personas

Three are fixed, so your results can be set beside the earlier rounds:

1. **Maya, 13, 8th grade.** Has never played a text adventure and does not know words like "parser" or "interpreter". Reads instructions carefully and takes them literally. Gets discouraged if she is stuck for more than a couple of minutes with no hint.
2. **Dev, 16, 11th grade.** Plays a lot of video games and uses chatbots every day, so he thinks he already knows what AI is. Skims anything longer than two sentences, clicks Continue and "Next →" as early as he can, and tries to break things: junk answers, empty forms, reloading mid-level, going back and forth, switching worlds.
3. **Riley, 18, a senior in the school's game design club.** Loves games, has played text adventures before and has made small games. Reads properly, notices pacing, puzzle fairness and feedback, and pokes at how the AI is wired into the game on purpose. Should also spend ten minutes in The Wayfarer afterwards.

Then **invent two more personas of your own** and run them the same way. Choose people the three above do not cover and whose experience you expect to differ. Some directions, none required: a student who reads below grade level or is learning English; a student using a screen reader or only a keyboard; a student who distrusts or dislikes AI; a teacher with no computer science background running this for the first time; a student on a slow or locked-down school device. For each one you invent, say in a sentence why you chose them.

## What to look for

For every persona:

- Whether they finish, roughly how long each level takes, and where they would give up.
- Every place they got stuck or confused: what they typed or clicked, exactly what the page said back (quote it), and what they expected instead.
- Wording that persona would not understand, quoted.
- Whether each level can be passed without doing what it asks.
- On Level 3 and Level 4, every sentence typed at the AI and exactly what came back. Include requests the game obviously cannot do, and attempts to get the AI to move the player or take, open or use something without the player naming it. For each, open "How it was understood" by clicking the command, and report whether the AI's answer was accepted, overruled by the game, or was a question. Note any time the AI did something the player did not ask for, and any time a reasonable request was refused.
- Whether text the AI wrote was always labelled as written by the AI.
- Anything that looked broken, with steps to reproduce. Keep "definitely a bug" apart from "might be me or my tools".
- What that person would say they learned about AI, in their own words, and whether that matches what the lesson seems to be trying to teach.

Report only what you saw. Where you did not reach something or could not test it, say so plainly; do not fill the gap with a guess. Estimates of time are fine if you label them as estimates.

## What to write

Put everything in `docs/playtests/second-opinion/`.

- One report per persona, named `YYYY-MM-DD-<persona>.md` with today's date, for example `2026-11-17-maya.md`. Lead with the conclusion in a few sentences. Then give a table with one row per level (time, passed or not, the one thing that most helped or hurt), then the findings under the headings above, then that persona's top five fixes, most valuable first.
- One `YYYY-MM-DD-summary.md` that I can act on without opening the others. Lead with your overall verdict: is this ready to put in front of a real class, and what are the three things most likely to go wrong? Then one combined list of fixes, ranked, each marked with which personas hit it and how sure you are. Then a short list of what you could not test.
- Only after every session is finished and your own reports are written: read `docs/playtests/2026-11-16-round3-first-timer.md`, `2026-11-16-round3-skimmer.md` and `2026-11-16-round3-gamer.md`, and add a last section to the summary called "Compared with the earlier round". Say where you agree, where you saw something they missed, and where you think they were wrong. Do not go back and change your own findings to match.
