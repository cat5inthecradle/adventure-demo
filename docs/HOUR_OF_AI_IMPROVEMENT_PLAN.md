# Hour of AI improvement plan

Make Adventure Lab a successful one-hour classroom activity: a manageable core, help that keeps learners moving, and worthwhile extensions for those who finish early. Keep the six-level structure and the small authoring exercise. First make AI behavior and lesson feedback trustworthy, then improve support and pacing, then test the complete classroom experience.

This plan follows the November 17–18 [second-opinion assessment](playtests/second-opinion/2026-11-18-summary.md), its five persona reports and the comparison with the earlier Claude playtests. It also accounts for the current uncommitted implementation. Status: increments 1–4 implemented locally through November 19, 2026; increment 5 is implemented but awaits browser/print verification, and increment 6 remains planned. The broader engine roadmap remains in [ROADMAP.md](../ROADMAP.md); this plan prioritizes the classroom lesson for the next iteration.

## Implementation progress

Increment 1 is implemented in the working tree. Scripted regressions cover the reported wrong targets, unrequested observations, unnamed operands and wrong directions through both interpreter paths. Outcome labels and Level 3 progress distinguish clarification, refusal, unresolved lookup and unavailable AI. Benchmark reporting now exposes incorrect acceptance and requests not executed separately; historical picker accuracy claims were removed.

Validation: 338 tests pass and the production build succeeds. A local in-app browser smoke test with Qwen2.5 1.5B accepted the ordinary prybar request, rejected an unnamed `open it` proposal, and showed unresolved paraphrases without claiming a question. This is a targeted smoke test, not a fresh full-model benchmark or classroom playtest. The conservative check supports 39 of 51 existing action-required benchmark requests; the other 12 remain visible as a cost to address rather than being relabelled as correct answers. These results describe increment 1; see the following updates for later work.

The repeat-testing reset from increment 5 is also implemented: **Reset lesson** clears saved lesson work across all worlds and reloads Level 1, while keeping downloaded models and named game saves. Cancel/Escape and clearing a disposable answer were verified in the local browser. Reset regressions bring the suite to 342 passing tests; the production build passes. Other increment 5 work remains planned.

Increment 2 now provides **Review experiments** and **Use recorded examples** on both AI levels. The five recorded investigations are sourced from the actual Qwen2.5 1.5B Drift playtest and explicitly labelled historical captures. They never run as canned responses in the live game. Live results, including failed interpretations and an unsuccessful Off/Understand comparison, can be reviewed alongside recorded generation examples. Each investigation saves evidence, route, world and a short observation. Dial preferences alone no longer pass Level 4; legacy completion flags are not promoted into new investigation completion. The checklist, final card, exported log and reset include the new records.

Validation: 346 tests pass, production build succeeds, and the in-app browser completed both AI levels with the model Off and retained completion after reload. The fallback is available immediately, including during model loading, rather than appearing after a timer. Observations are checked for a few words, not graded for conceptual correctness. Saved work tracks completion across the lesson; changing worlds does not require repeating the investigations. Classroom pacing, hints, shorter instructional presentation and the remaining card/extension work still need the later increments.

Increment 3 is implemented locally (November 19). **Need a hint?** offers a goal reminder, a clue, and an explicitly requested next command. Puzzle hints read the current world, including dropped tools and collected rewards. All three starter characters change advice when the tool is carried. Containers have useful refusals and an explicit open-state flag; the Temple accepts `cut vines with machete`, and `pry bar` is an alias. Wayfarer pod entry now parses offline and points to the launch lever instead of asking the player to enter again. The natural-language benchmark uses the polite form `could you go into escape pod` to keep testing model grounding; the direct form has its own offline regression.

Each level now starts with a shorter overview, with the full explanation and live checklist expandable. The inspector starts with a plain-language outcome and keeps its technical trace under Details. Direct navigation buttons and Alt+C / Alt+I / Alt+L move between command entry, the latest command's inspector, and lesson instructions. Level changes focus the instructions; command inspection focuses the inspector. Narrow windows stack the terminal and inspector instead of squeezing the game.

Validation: 357 tests pass and the production build succeeds. New regressions follow the hint commands to victory in every starter world, check changed NPC advice, distinguish open/refused/missing objects, and confirm pod entry never moves away from the pod. In-app browser checks covered progressive hints, keyboard model selection/loading (cached Qwen2.5 0.5B), Enter-to-inspect, direct focus shortcuts, and the narrow-window layout. This was a focused browser check, not a full assistive-technology audit or a new five-persona playtest. The next increment is the optional early-finisher challenges.

Increment 4 is implemented locally (November 19). **Explore optional challenges** is available from Levels 3–6 and the final card. Three cards offer the interpreter investigation (5–8 minutes), object robustness (5–10 minutes), and a Wayfarer clue/dependency mission (10–15 minutes). The times remain planning estimates. Each has a concrete goal, a few steps, an optional observation and an explicit self-check; none affect core completion.

Challenges reuse the game, inspector and authoring form in separate practice sessions. The object challenge begins from a copy of the saved lesson object when available. Practice edits deliberately remain in that copy so returning preserves the core project. Practice positions, definitions, notes and self-checks persist by challenge and lesson world; returning during the same visit also retains command history. Reset lesson clears this work. Models start off in practice; learners may explicitly reuse the loaded lesson model without another download, or use the interpreter challenge's labelled recorded captures.

Validation: 362 tests pass and the production build succeeds. Browser checks confirmed the core transcript was retained on return, Wayfarer's position and note survived reload, and an alias resolved to an object whose pickup rule correctly refused the action. The layout and sticky return control were inspected at the in-app browser's narrow width. Actual extension duration and engagement still require human testing. Next: increment 5's reflection, print layout, and teacher guide.

Increment 5 implementation is now in the working tree. Reflection scenarios show the selected capability beside the reason and offer a consequence-focused sentence starter. The card includes all six activity statuses, live/recorded routes, saved observations, one inspected example with evidence, and the authored object's pickup rule. Level 6 permits a preview with unfinished work. Print styles remove viewport and scrolling constraints and allow long cards to paginate. The repository's [60-minute teacher guide](HOUR_OF_AI_TEACHER_GUIDE.md) is also available in an in-app dialog under For teachers.

Validation: 364 tests pass and the production build succeeds. Regression checks cover incomplete work despite a saved preference or untested object, recorded provenance, and a cleared reflection reason. **Browser and print-preview verification are pending:** the in-app browser tool connection stopped responding before this increment's visual checks. Do not consider print pagination verified from the CSS or unit tests alone. Next: verify completed and incomplete cards in print preview, the teacher-guide dialog, and the reflection screens, then run increment 6's integrated checks.

## What success looks like

By the end, a learner should be able to demonstrate three things: AI can interpret a request incorrectly; generated description is different from an object or rule; and choosing how much AI may do requires explaining a consequence. The card records their work and reasoning, rather than certifying mastery from a word-count check.

Design for a 35–40 minute core, with setup, reflection and flexible exploration bringing the activity to about an hour. These are planning targets, not measured results. Persona estimates suggest substantial room for extension, but are not evidence that actual students will finish that quickly.

| Suggested classroom time | Activity | Flexibility |
|---|---|---|
| 0–5 min | Introduce the question “Who decides what is true?”, choose a world, check model readiness | Offer an explicit model preload during setup; keep playing while it loads. |
| 5–13 min | Levels 1–2: play, encounter a missing object, inspect the response | Hints progress from a nudge to an exact next command. |
| 13–28 min | Levels 3–4: compare interpretations and AI dial settings | Learners can analyze labelled recorded examples if live AI is unavailable or repeatedly unhelpful. |
| 28–35 min | Level 5: author and test an object | Faster learners test aliases and pickup rules, or ask a partner to try it. |
| 35–42 min | Level 6: choose settings and explain consequences | Short reasons are welcome; prompts help connect choices to effects. |
| 42–52 min | Finish core work or choose a challenge | Early finishers can start challenges sooner; others keep working with help. |
| 52–60 min | Compare one decision, share evidence and review the card | Individual written reflection works when pair/class discussion is unavailable. |

A learner who finishes early should see a useful next action immediately. A learner who needs longer should still reach the central concept and reflection. Do not add timers, longer mandatory text, harder puzzles or repeated typing solely to occupy the hour.

## Decisions to carry into implementation

- Keep Next as a visible “Skip for now” route. Distinguish visited, completed, skipped and completed using recorded examples. Do not trap a learner on a device/model failure.
- Do not require a stochastic model to give one particular answer. Completing an experiment means observing and explaining its result, including failure, rather than forcing a successful generation.
- Apply intent checks to observation commands as well as movement and object actions. An unrelated listen or examine is still a misleading interpretation, even when it cannot solve a puzzle.
- Keep generated prose labelled and preserve the engine as the authority for world changes. Explain both boundaries: an action may obey the game rules while still misrepresenting the player's request.
- Keep Level 5 small. Alias, pickup and prediction experiments can supply depth without rebuilding the removed Blockly authoring system.
- Improve reflection prompts rather than building an AI grader or a large nonsense blacklist. Do not make vocabulary sophistication a prerequisite for completing the lesson.
- Maintain local-only operation. This plan adds no accounts, analytics, class dashboard, server inference or collection of real learner records.

## Existing changes to preserve and reassess

The working tree already includes intent grounding, typo/paraphrase handling, persistence and skip messaging, nonempty-description checks, reason checks, model status improvements and tests. Begin implementation from that reviewed working tree; do not overwrite those changes or treat every report as an unfixed issue.

Specific current behavior explains several findings:

- [grounding.js](../web/src/engine/grounding.js) accepts an action based on a matching action word **or** entity token. It exempts look/listen/examine/inventory. Movement can pass on a room-name token without verifying that the proposed direction leads toward that named destination. Its tests explicitly permit unnamed take and unrelated observation actions. Tightening this is a deliberate policy change, not just adding a missing call.
- [turn.js](../web/src/engine/turn.js) calls a failed paraphrase lookup “clarify,” even when its text is a statement. A successful reparse can also substitute a different target before the later prose-gap protection is reached.
- [AdventureValidator.js](../web/src/adventure/AdventureValidator.js) treats any interpreter route without an action as clarification, and uses command-word presence to distinguish understanding from guessing. Neither establishes that the requested action was understood.
- [Level 4 curriculum](../curriculum/hour-of-ai/level_properties.json) requires only `ai_dial_set` for completion. Fill gaps and Improvise have activity checks but are not prerequisites. Level 5 explicitly says examination completes the level, making its optional pickup/alias tests a wording and scope decision rather than inherently a broken gate.
- [InterpreterPicker.vue](../web/src/components/InterpreterPicker.vue) uses a labelled native select with a focus indicator. Sam's failed selection warrants a direct human keyboard check before replacing this control.
- [grounding tests](../web/tests/grounding.test.js) and [acceptance tests](../web/tests/acceptance/playtest_fixes.test.js) verify several earlier fixes, but some encode the permissive behavior or prescribed copy that this iteration should change.

The published build used in playtesting and this working tree are not assumed identical. Record the revision and environment for the next deployed test.

## Implementation sequence

Each increment should be reviewable on its own, with its user-visible behavior and focused checks. Sizes are relative scope estimates, not delivery promises.

### 1 Make interpretation and feedback agree

**Priority:** first. **Scope:** medium to large. **Depends on:** reviewing the existing grounding changes.

Preserve explicit entity identity and requested destinations. Matching “open” must not license opening an unrelated object, and matching one room-name word must not license any movement. Resolve known aliases and supported paraphrases; when intent remains ambiguous, ask a useful question. Default unnamed `take it` and similar requests to clarification unless an explicit, tested referent rule exists. Do not silently introduce conversation memory to make the existing guesses look correct.

Use the same policy for both the reparsed paraphrase and structured-action fallback. Validate observational intent too: flying cannot become listening, and inspecting a statue cannot become inspecting an altar. A refused proposal must not advance the game turn. Preserve legitimate natural language such as a named tool request, an alias, a valid named-room route and a clear typo.

Represent model clarification, engine refusal, unresolved noun, unavailable model and accepted action as distinct outcomes. Derive inspector labels, transcript feedback and lesson progress from those outcomes. Avoid calling an accepted proposal “correct understanding” solely because the sentence contains a known verb. Label the visible echo “AI interpreted…” and separate “command interpreted by AI” from “description written by AI.”

**Likely files:** engine grounding/turn routing, adventure validator and conditions, ParserPanel, curriculum messages; related engine and lesson tests.

**Done when:** deterministic model stubs reproduce all reported substitution paths and none executes an unrelated action. Missing-object statements and unavailable-model errors never count as genuine clarification. Correct named requests still succeed. Expand the benchmark expectations with these negative cases and report correct-action acceptance separately from incorrect-action acceptance; do not preserve the old score by retaining permissive rules.

### 2 Make the AI experiments completable on every supported path

**Priority:** first, after the outcome model in increment 1. **Scope:** medium to large.

Turn the Level 3/4 sequence into short experiments: predict, try, inspect, explain. Keep an overview and show one current task with a clear next step; allow revisiting previous results. Reword the Off/Understand comparison so “both failed” is a legitimate observation with a recovery action. Do not relabel a deterministic parser command as an AI success merely to make the example work.

Offer **Use recorded examples** immediately for unsupported hardware or download failure and after roughly two minutes of waiting, without forcing a switch. Also offer it after repeated unhelpful outputs. Use fixed, reviewed captures from an actual model run, labelled as recorded with the model and context. Let learners inspect a successful interpretation, a wrong proposal stopped by the engine, generated scenery and improvised dialogue. Ask them to identify the evidence. Do not present recordings as live output or apply hidden canned responses to arbitrary commands.

Separate saving a dial preference from completing its experiments. For the live route, record the attempted comparison and inspected outcomes, followed by a short observation; a failed model response can still teach something. Missing generation can be covered by the recorded route. Preserve Skip for now. The card should state which route was used and which core activities remain unfinished. Do not silently upgrade old saved preferences into completed experiments when introducing this tracking.

**Likely files:** LessonController, adventure conditions/validator, curriculum properties, InstructionsPanel, AiDial, InterpreterPicker, AiRulesCard; a small recorded-example data module and view.

**Done when:** successful AI, repeated clarification, model unavailable, model loading and recorded-example paths all reach an honest result. No-model learners can learn the distinction without waiting indefinitely, and preference-only saving no longer claims completed practice. Reload preserves the selected route and recorded evidence without fabricating live activity.

### 3 Add help that supports independent progress

**Priority:** high. **Scope:** medium. **Can proceed after:** increment 1 behavior is defined; most content work is independent.

Provide a persistent “Need a hint?” affordance with three levels: goal reminder, relevant object/action, exact next command. Keep the exact solution behind an explicit request, while making help easy to discover. Hints should use current state: carrying the prybar should change the droid's advice. A failed command can offer a relevant hint without immediately revealing the puzzle solution.

Give crate refusals actionable wording, add the `pry bar` alias, and define unfamiliar tool words briefly. Support the Temple's clue about cutting vines consistently with its urn puzzle. Distinguish an already-open object, an object that cannot open and something not present. For Wayfarer, first fix the contradictory boarding response with an accurate next action such as using the launch lever, whose authored outcome already includes boarding. A new pod-interior room is unnecessary for this iteration. Ensure `go into escape pod` cannot route away from it.

Use short instructions and a concise inspector explanation first, with technical traces available in Details. Mention both clicking a command and focusing it then pressing Enter. Keep keyboard focus predictable after transitions and offer a direct route between command entry, inspector and lesson navigation without traversing the entire command history. Check the model menu with real keyboard input before changing its implementation.

**Likely files:** starter worlds, Wayfarer world, curriculum instructions, TerminalPane, InstructionsPanel, LessonView, ParserPanel; targeted parser/renderer changes only where world content cannot express the behavior.

**Done when:** a beginner can recover from each reported puzzle stall using visible help; all three starter worlds have coherent hint paths. A human keyboard check can select/load a model, inspect a command, return to input, author an object and continue. No repeated failure requires guessing the interface's preferred wording without guidance.

### 4 Build an early finisher path with useful depth

**Priority:** high for the hour-long goal. **Scope:** medium. **Depends on:** reliable interpretation and return navigation.

Offer three challenge cards at appropriate levels and at the final card. Mark them optional, show approximate duration, state a concrete goal and let learners return to the lesson without losing answers. Do not require every learner to finish all three.

| Challenge | Target time | Activity and evidence |
|---|---|---|
| Test the interpreter | 5–8 min | Write three ways to request one action and one impossible request. Predict, inspect the actual action, and explain a disagreement. Use recorded examples if necessary. |
| Make your object foolproof | 5–10 min | Add two aliases, choose whether it can be picked up, predict the results, then test them. Optional partner tries an unexpected name; revise based on that evidence. |
| Investigate The Wayfarer | 10–15 min | Explore with a mission: find two clues, solve a dependency, and inspect one interpretation. Finishing the whole game is optional; prompts keep an early escape from becoming an immediate dead end. |

Keep progress lightweight: a short observation or self-check tied to the challenge, not another mandatory worksheet. Preserve the learner's lesson state and make the return path obvious. Do not silently download/reload a model on transfer; show its readiness and allow intentional reuse where feasible.

**Likely files:** curriculum challenge definitions, InstructionsPanel, lesson completion view, App navigation and LessonController. Reuse existing inspector, authoring form and Wayfarer rather than creating a second game builder.

**Done when:** a learner who completes core work in 25 minutes has at least 20 minutes of optional purposeful exploration, and a learner who needs 50 minutes can skip all extensions. This is a content-capacity target to validate with human timing, not a promise from the simulated runs.

### 5 Strengthen reflection and classroom operation

**Priority:** high. **Scope:** medium. **Depends on:** increment 2 progress distinctions; extension links from increment 4.

Keep the three real-life scenarios, but add concise prompts such as “What can AI do here?” and “What happens if it is wrong?” Offer a sentence starter, not a minimum essay length. Accept concise language. Show the chosen capability next to the reason so mismatches are easier to notice. Preserve discussion of different choices, including high-risk choices, rather than silently grading the dial setting as right or wrong. No automated semantic grader is required.

Make the card a useful reflection artifact: authored object, chosen boundary, one observed example, scenario reasons and a compact account of completed/skipped/recorded work. Include that account in the printed card, not only the surrounding page. Validate print preview as well as the on-screen result.

Add a short teacher guide with the suggested 60-minute schedule, a model/device preflight, no-model route, hint guidance, extension menu and debrief questions. Put help where it is needed while retaining a single overview for preparation.

Provide explicit **Start a new lesson** behavior that clears lesson answers, authored additions and lesson progress, while retaining downloaded model assets by default. Explain its scope and confirm before clearing. Keep lesson reset distinct from restarting only the game. Preserve per-world authored content on ordinary world switching and make any world-specific versus shared preference behavior explicit.

**Likely files:** RealLifeView, AiRulesCard, LessonController/storage, curriculum teacher notes and a teacher guide. Reuse the existing storage layer and keep everything local.

**Done when:** short meaningful reasons remain usable, choices are reviewable without claiming automated proof of understanding, cards accurately show the activity route, and a new persona starts with blank lesson state without needing browser-settings intervention. Print preview includes the evidence and status without clipping.

### 6 Validate the classroom experience before expanding scope

**Priority:** release criterion. **Scope:** medium. **Depends on:** the previous increments being integrated.

Start with focused regression tests for intent and progress, then run the existing suite and production build. Mock model replies for repeatable acceptance tests; separately exercise the recommended model in the browser because mocks cannot establish model quality. Keep positive paraphrases alongside adversarial cases so greater caution does not turn Understand into “reject everything.”

Run a targeted browser check after each relevant increment rather than repeating five long personas for every copy edit. Once integrated, run a new five-persona round on a recorded revision: careful beginner, skimmer, game designer, English learner and keyboard-only. Include a deliberately unavailable-model route and test reset between sessions. Record actual elapsed interaction time separately from tool overhead where possible.

Before a broader rollout, validate on representative school hardware and with real learners through the project's normal classroom research process. The simulated sessions cannot establish hour-long engagement or real accessibility. Do not introduce collection of student identities or transcripts as part of this engineering work.

**Release checks:** no accepted unrelated actions in the regression set; no false clarification/completion labels; a usable recorded route; visible hint recovery; keyboard access verified; complete and skipped cards print accurately; an early finisher can find an extension unaided; a slow learner can reach a meaningful reflection without being blocked by the model. In a classroom pilot, use the 35–40 minute core and 60-minute full activity as hypotheses and revise from observed timing.

## Work to defer

Defer a full world builder, additional compulsory levels, more complex mandatory puzzles, replacing the model solely to chase a benchmark percentage, and automated grading of open-ended reasons. Speech and other broader engine roadmap items remain valuable, but this plan does not represent a screen-reader or speech-accessibility certification. Fix confirmed keyboard barriers now and schedule specialist accessibility testing separately.

## Recommended first implementation slice

Start with increment 1: reproduce the statue-to-altar, flight-to-listen and pod-to-south cases using scripted model replies; tighten intent checks while retaining positive cases; then correct outcome classification and the lesson messages that consume it. Some existing tests intentionally assert the current permissive policy, so update those expectations explicitly with the rationale in the change description.

Increments 1–4 are now implemented locally. Increment 5's implementation is also present; finish its browser and print checks before validating the integrated experience in increment 6. Preserve unrelated working-tree changes and keep increments reviewable. No commit or deployment has been made.
