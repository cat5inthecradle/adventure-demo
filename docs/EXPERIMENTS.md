# Experiments on the language layer

A place to decide what counts as a win *before* running anything, so a result can
disappoint us. Every change to prompting, schema, or model selection goes through
here, because the last three things we learned about this layer all contradicted a
confident guess:

- Haiku "over-clarifies because it is small" — then it played a full game.
- "The prompt is not the problem" — rebalancing one line doubled a 3B's score.
- "More decisive prompting is strictly better" — it made Sonnet fabricate.

## What we measure

The harness is `scripts/nlu_bench.py`. It runs a fixed set of scenarios, each a
`(setup script, utterance, expected outcome)` with a known-correct answer, so
grading is exact rather than a judgement call.

**Primary metric: residue accuracy.** Accuracy over only the scenarios the offline
parser cannot already resolve — the work that actually reaches a model in real play.
Overall accuracy flatters a model by scoring it on turns it would never be asked.

**Hard gate: fabrications must be zero.** A *fabrication* is a world-changing
action taken on a referent the player never supplied — moving, taking, opening,
using, traversing, talking. Answering a trap with `look`, `inventory` or `examine`
is a wrong answer but not a fabrication: nothing became true, so it is reported as a
harmless misfire instead. The distinction is the invariant itself, not a convenience
— the claim is that the model cannot make untrue things happen, and looking around
makes nothing happen.

**Hard gate, restated:** A scenario where the right answer is a
question, answered with a confident action, fails the whole condition regardless of
accuracy. This is not a metric to trade against; it is the property the architecture
exists to provide. A change that buys five points of accuracy and one fabrication is
rejected.

**Secondary:** over-clarification count (our characteristic failure), latency, tokens,
and how often the model needed the prose-JSON fallback instead of honouring the schema.

## Rules that keep results honest

1. **Three runs per condition, minimum.** These models are not deterministic. A
   single run of 18 scenarios cannot distinguish a real effect from a coin landing
   the same way twice. An effect counts only if its direction holds in all three.
2. **Change one thing.** Same scenarios, same setup states, same model — one
   variable. A prompt change measured on a different model measures nothing.
3. **Re-run the control every session.** Endpoints drift, local models get
   requantised, defaults change upstream. Yesterday's baseline is not a baseline.
4. **Test the change on the model it is NOT aimed at.** The action-biased prompt
   helped a 3B and broke Sonnet. Anything intended for small models gets checked
   against the shipped default before it goes near `nlu.py`.
5. **Write the success criterion first**, in the entry below, before the first run.

## Known weaknesses of this harness

Worth stating plainly, because they bound what any result here means.

- **N is small.** 18 scenarios, 13 of them residue. A two-scenario swing is noise.
- **The scenarios are mine.** I wrote them and I know the answers, so they encode my
  phrasing habits. The one real playthrough we have produced failures none of them
  predicted — typos, and referring to things by where they are rather than what they
  are called.
- ~~**The trap set is tiny.**~~ Fixed 2026-09-07: the gate is now 16 scenarios in
  its own suite (`--suite traps`), covering nonexistent referents, unresolvable
  vagueness, scenery the world does not model, actions no verb expresses, meta and
  non-requests, and false presuppositions. Nine of them are utterances a real player
  actually typed, so they cannot be dismissed as strawmen. Capability and safety are
  measured separately on purpose — sharing a denominator degrades both.
- **Latency is measured on one machine** under whatever else it was doing.

**Phase 2 for the harness:** build a second suite from `logs/`, using real logged
utterances with hand-checked expected actions. That set cannot be overfitted to by
the person who wrote it, and it is where the interesting failures already live.

---

## E1 — Inline markup instead of a JSON schema

**Where it came from.** Ian Bicking's Intra notes, which deliberately avoid tool
calls: *"many smaller models aren't good at tool use"* and *"LLMs seem to change
their behavior... when using a tool."*

**Hypothesis.** Constrained JSON decoding suppresses small models' willingness to
commit. Both local models emitted flawless schema-valid JSON (0 fallbacks in 36
calls) while over-clarifying 13 and 15 times out of 16 — fluent in the format,
useless at the task. A looser inline form (`<take>prybar</take>`, regex-parsed)
may recover decisiveness.

**Manipulation.** A third mode in `OpenAICompatibleNLU` beside `schema` and
`prompt`: no `response_format`, markup instructions in the system prompt, parsed
with a regex, then through the same `validate_resolution` funnel.

**Success.** Residue accuracy on `llama-3.2-3b-instruct` improves by ≥15 points,
direction consistent across three runs, inventions still zero.

**Risk.** Regex parsing is laxer than a schema, so malformed output becomes our
problem rather than the decoder's. Watch the unreached/parse-failure count.

**Result (2026-09-07). Fails the hard gate.** Best accuracy and by far the best
latency of anything we have run, and it fabricated.

| Llama 3.2 3B | residue | traps | invented | wall |
|---|---|---|---|---|
| control | 15% (15/15/15) | 100% | 0 | 24s |
| markup | **46%** (54/46/38) | 83% (100/100/50) | **1** | **7s** |

The fabrication: *"put the thing in the thing"* returned `Use(supply_crate)` — an
arbitrary visible entity picked for a meaningless utterance. Under our rules that
rejects the condition regardless of the accuracy gain, and the gain is real, which is
exactly why the rule is written down in advance.

**Two findings worth more than the verdict.**

*Constrained decoding costs 3.4x wall time* on a local model — 24s to 7s across 18
scenarios. The schema forces all seven fields including nulls; the markup reply is
about five tokens. For the audio work, where latency is the experience, that is the
largest single lever we have found. It suggests **E1c: keep constrained decoding but
shrink the schema** — fewer fields, no null padding — to buy back speed without
giving up the constraint.

*Unconstrained generation is much less stable.* Run-to-run residue was 54/46/38,
against 15/15/15 for control and 31/38/38 for guided. Freedom bought capability and
spent determinism.

**Parser note.** Two scenarios in run 2 were lost to my regex, not the model: it
emitted `<go south/>` and `<talk R-6/>`, a form I had not anticipated. Fixed
afterwards, so the 46% understates markup slightly. Those failures were *safe* —
an unreadable reply becomes "unavailable" and nothing happens — which is the
distinction that matters: format failures are harmless, judgement failures are not.

**Status:** complete, rejected on the gate.

---

## E1b — markup and guided together

**Hypothesis.** E1 gave speed and accuracy but fabricated; E2 gave safety. Enumerating
candidates in freeform text before the tag might buy both.

**Result. Worse than either alone, and still fails the gate.**

| Llama 3.2 3B | residue | traps | invented | wall |
|---|---|---|---|---|
| markup-guided | 31% (46/15/31) | 67% | 1 | 12s |

**Why this matters more than the numbers.** It reframes what E2 was actually doing.
Guided works *because the schema forces the enumeration to be emitted before the
answer* — the decoder makes the ordering mandatory. Written as an instruction in a
freeform prompt, the same words are a suggestion a 3B can skip, and it does. The
constraint was doing the work, not the request.

Which turns Bicking's claim into something more specific for our case: constrained
decoding really does cost small models accuracy and a great deal of latency, and it
is also what buys the determinism that keeps them from inventing. In a game where
fabrication is the cardinal failure, that trade is the right way round — so we keep
the schema and pay for it, rather than following the source's advice.

**Status:** complete, rejected.

---

## E2 — Guided thinking: enumerate candidates before choosing

**Where it came from.** Intra's "guided thinking" — an explicit ordered question
sequence (*is it possible, is it trivial, what are the outcomes, difficulty, roll*)
that forces an order of commitment rather than relying on a reasoning model.

**Hypothesis.** Our models fail by refusing to choose, not by choosing wrongly: the
3B over-clarified 13 times and misidentified only 2. If the model must first write
down which visible entities could match, then a model that has just written
`["prybar"]` has made the decision self-evident. This is the same effect the
rebalanced prompt achieved, but reached through the model's own output rather than
through instructions to be bolder — so it should not carry the fabrication risk that
broke Sonnet.

**Manipulation.** Add a `candidates: list[str]` field to `NLUWireResponse`, declared
*before* `result` so constrained decoding fills it first, plus one prompt line
telling the model to list the ids that could match before deciding.

**Success.** Residue accuracy on `llama-3.2-3b-instruct` improves by ≥15 points
across three runs, **and** Sonnet's residue accuracy and trap accuracy are unchanged
within run-to-run variance. Both halves are required.

**Assumption to verify, not assume.** That constrained decoding actually emits
fields in schema order. Check real outputs rather than trusting it.

**Risk.** Extra output tokens on every call, on the latency path that the audio work
cares about most. Measure it.

**Result (2026-09-07).** Passed both halves.

| | residue accuracy | over-clarified | traps | invented | wall |
|---|---|---|---|---|---|
| Llama 3.2 3B, control | **15%** (15/15/15) | 13.7 | 100% | 0 | 24s |
| Llama 3.2 3B, guided | **36%** (31/38/38) | 8.7 | 100% | 0 | 26s |
| Sonnet 5, control | 85% (85/85/85) | 0.0 | 100% | 0 | 40s |
| Sonnet 5, guided | 85% (85/85/85) | 1.7 | 100% | 0 | 44s |

+21 points on the 3B, with every guided run beating every control run and no
overlap between the distributions. Sonnet unchanged on the primary metric.

**The mechanism was verified, not inferred.** Raw output on "pick up that steel
bar": `{"candidates": ["prybar"], "result": "action", "action_type": "take",
"entity_id": "prybar"}`. The model enumerates, sees one, and commits — which is the
hypothesis working rather than a number moving.

**Cost.** Roughly 10% more wall time on both models, and it makes Sonnet slightly
*less* decisive (0 → 1.7 over-clarifications) for no accuracy gain. So this is a
per-provider win, not a global one: on for small local models, off for the default.
That is the shape E5 wanted and could not have safely.

**Caveat on the Sonnet baseline.** 85% here versus 100% in the round-2 bakeoff is
not drift — it is a confound. A parallel session's in-flight `traverse` action is in
the working tree, and Sonnet now answers `traverse` on two door scenarios where the
bench still expects `open`. Arguably the model is right and the fixture is stale.
The A/B is unaffected (both arms carry it), but the expected answers need updating
once that work lands.

### Re-test on implementation (2026-09-07) — the safety result did not replicate

Implemented as a real per-provider option, corrected the fixture (see below), and
re-ran. The accuracy gain held. The safety property did not.

| Llama 3.2 3B, corrected fixture | residue | traps | invented |
|---|---|---|---|
| guided off | 21% (23/23/15) | 100% | 0 |
| guided on | 38% (38/23/54) | 83% (100/50/100) | **1** |

The fabrication was *"open the airlock with my sandwich"* → `Open(pod_door)`: the
same trap, and the same failure, that the action-biased prompt produced on Sonnet in
E5. Across every trap trial we have on this model — six runs, two traps each —
unguided is 0/12 and guided is 1/12.

**The correction.** I argued guided was safe *because* it worked through the model's
own output rather than instructing it to be bolder. That reasoning was wrong.
Enumerating candidates and then acting on a single entry **is** an action bias; it is
simply a structural one. It belongs to the same failure family as E5, and being
reached by a different route does not exempt it.

**What the first result actually was.** Not a fluke, but not evidence either: three
runs times two traps is six trials. The doc says at the top that two trap scenarios
carry the whole safety gate and that zero inventions across them is weak evidence.
That warning was written before the run and then not applied to the result — which is
the failure mode pre-registration exists to prevent, and it still nearly got through.

**Shipped as:** `guided=False` on every provider, available per instance. A switch
you throw for a model you have measured, not a default.

**Prerequisite met, and it settled the question.** With 16 traps instead of 2,
48 trials per condition on Llama 3.2 3B:

| | fabrications | rate |
|---|---|---|
| guided off | 3/48 | 6.2% |
| guided on | **8/48** | **16.7%** |

Guided is nearly three times worse, and the failures show the mechanism plainly:
*"talk to the captain"* → `Talk(maintenance_droid)`, three times over. Enumerating
candidates finds the only NPC in the room, sees a single entry, and commits.
**Candidate enumeration converts "no valid referent" into "the nearest referent",**
which is the fabrication mode itself. Confirmed: opt-in only, and not recommended.

The old gate had reported 0 fabrications for both conditions. It was not measuring
safety; it was measuring two scenarios the 3B happened to handle.

**Fixture correction made during this work.** `try_door` and `door_again` expected
`open`, but the engine has since grown a `traverse` action and both models now answer
with it — arguably more correctly. The bench now accepts a tuple of acceptable
answers, because "try to get through the door" genuinely has two right readings and
scoring one wrong measures the fixture's opinion rather than the model.

**Status:** complete. Accuracy gain real and reproducible; safety unproven; shipped
off by default.

---

## E3 — Transcript shaping

**Where it came from.** Intra: *"LLMs are very susceptible to 'fixation': an
inability to ignore something."* Independent corroboration of something we half-saw
— during the Haiku playthrough, a history full of clarifications appeared to beget
more clarifications, though a synthetic test did not confirm it.

**Hypothesis.** Feeding back our own clarifying questions teaches the model that
clarifying is what happens here.

**Manipulation.** Bench variants: no transcript; transcript with clarification turns
filtered out; transcript of 2 pairs instead of 6.

**Success.** Any variant beats the 6-pair default by ≥10 points of residue accuracy,
consistently. A null result is worth having and should be recorded as one.

**Note.** The current harness passes an empty transcript, so this experiment needs
the harness extended before it can run at all.

**Status:** not started.

---

## E4 — Aligning entity ids with names

**Where it came from.** Intra: *"Entity titles and ids closely match. For instance
the id for the room titled 'The Quiet Plaza' is `The_Quiet_Plaza`."*

**Hypothesis.** Models must copy ids exactly, so every divergence between an id and
the name a player says is a chance to slip. `pod_door` versus "pod bay door" is the
shape to worry about.

**Manipulation.** A check in `scripts/lint_world.py` reporting divergence, then a
world variant with ids aligned to names, benched against the current one.

**Success.** Any measurable improvement, on any model. Expected to be small — this
is cheap insurance rather than a fix.

**Status:** not started.

---

## E5 — Per-provider prompt bias

**Already run, and the result is a warning.** Rebalancing `SYSTEM_PROMPT` toward
action took `llama-3.2-3b-instruct` from 3/18 to 6/18 and cut over-clarification
from 13 to 7 — and made `claude-sonnet-5` fabricate for the first time in 19+ trap
encounters: *"open the airlock with my sandwich"* returned `Open(pod_door)`. Trap
accuracy halved.

**Conclusion.** Not shippable globally. It remains viable *per provider* — a local
provider whose failure mode is the opposite could carry its own prompt — but only
gated on that specific model's traps staying clean, and only after E2, which aims at
the same problem without asking the model to be bolder.

**Status:** complete, shelved.
