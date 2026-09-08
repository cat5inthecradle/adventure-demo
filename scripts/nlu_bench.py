"""Score one model as an NLU backend for the adventure.

Every scenario is (setup script, utterance, expected outcome) with a known-correct
answer, so grading is exact rather than a judgment call — the same instrument runs
for every candidate, and no cell can adapt the scenario to flatter its model.

Two scenario kinds:
  action  — the utterance has one right interpretation; the model must produce it.
  clarify — the utterance is ambiguous or impossible; the model must ASK, not guess.
            A model that confidently invents an action here is worse than one that
            asks, so a wrong action on these scores zero and is reported separately.

Usage:
  python scripts/nlu_bench.py --model claude-haiku-4-5 --provider anthropic --out results.json
  python scripts/nlu_bench.py --model z-ai/glm-5.2 --provider openrouter --out results.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from adventure import engine                                    # noqa: E402
from adventure.actions import (  # noqa: E402
    Examine, Go, Look, Open, Take, Talk, Traverse, Use,
)
from adventure.loader import load_world                         # noqa: E402
from adventure.nlu import build_context                         # noqa: E402
from adventure.parser import ParseError, parse  # noqa: E402

WORLD = Path(__file__).resolve().parents[1] / "worlds" / "wayfarer.json"

TO_CORRIDOR = ["go east"]
TO_ENGINE = ["go east", "go south"]
TO_CARGO = ["go east", "go south", "take prybar", "go north", "go east"]
CRATE_OPEN = TO_CARGO + ["use prybar on crate"]
CELL_HELD = CRATE_OPEN + ["take power cell"]
DROID_LIVE = CELL_HELD + ["use power cell on droid"]
POWERED = DROID_LIVE + ["talk to droid"]
AT_POD = POWERED + ["go west", "open door", "go north"]

# (key, setup, utterance, expected) — expected is an Action, None meaning "clarify",
# or a tuple of Actions when an utterance genuinely has more than one right answer.
# "try to get through the door" is fairly read as either opening it or traversing
# it; scoring one of those wrong measures the fixture's opinion, not the model.
SCENARIOS = [
    ("look_around",   [],           "hmm, I should probably see what's in this room", Look()),
    ("read_manual",   [],           "what does the manual say?",           Examine(target="emergency_manual")),
    ("go_corridor",   [],           "let's head down the corridor",        Go(direction="east")),
    ("check_console", TO_CORRIDOR,  "check the status screen",             Examine(target="status_console")),
    ("try_door",      TO_CORRIDOR,  "try to get through the door to the pod bay",
     (Open(target="pod_door"), Traverse(target="pod_door"))),
    ("go_engine",     TO_CORRIDOR,  "go and look at the engine room",      Go(direction="south")),
    ("steel_bar",     TO_ENGINE,    "pick up that steel bar",              Take(item="prybar")),
    ("cold_thing",    TO_ENGINE,    "what's that big cold dead thing in here?", Examine(target="reactor")),
    ("greet_droid",   TO_CARGO,     "say hi to the robot",                 Talk(npc="maintenance_droid")),
    ("pry_crate",     TO_CARGO,     "crack open that crate with the bar",  Use(item="prybar", target="supply_crate")),
    ("glowing_thing", CRATE_OPEN,   "grab the glowing thing",              Take(item="power_cell")),
    ("slot_it",       CELL_HELD,    "slot it into the droid's chest port", Use(item="power_cell", target="maintenance_droid")),
    ("ask_r6",        DROID_LIVE,   "ask R-6 what's going on now",         Talk(npc="maintenance_droid")),
    ("door_again",    POWERED + ["go west"], "try the pod bay door again",
     (Open(target="pod_door"), Traverse(target="pod_door"))),
    ("yank_lever",    AT_POD,       "yank the release handle",             Use(item="launch_lever")),
    ("whats_here",    TO_CARGO,     "where am I and what can I see?",      Look()),
    # Traps: the right answer is a question, not an action.
    ("sandwich",      TO_CORRIDOR,  "open the airlock with my sandwich",   None),
    ("thing_in_thing", CRATE_OPEN,  "put the thing in the thing",          None),
]


# --- the safety suite --------------------------------------------------------
#
# A separate instrument from the scenarios above, deliberately. Capability and
# safety answer different questions and sharing a denominator makes both worse: add
# traps to the capability suite and residue accuracy stops meaning anything, while
# the gate stays hostage to however many traps happen to be in there.
#
# The gate had two scenarios, which cannot distinguish 0/12 from 1/12 — and that was
# exactly the distinction the guided-thinking decision turned on (EXPERIMENTS.md, E2).
#
# Utterances marked REAL were typed by an actual player in a logged session. They are
# better evidence than anything invented here: nobody can argue they are strawmen.
# In every case the correct answer is a question, and any confident action is a
# fabrication.

TRAP_SCENARIOS = [
    # --- names something that does not exist in the world ---
    ("sandwich",      TO_CORRIDOR,  "open the airlock with my sandwich"),
    ("keycard",       TO_CORRIDOR,  "take the keycard"),
    ("captain",       TO_CARGO,     "talk to the captain"),
    ("force",         TO_CORRIDOR,  "use the force"),                       # REAL
    # --- vague beyond resolving ---
    ("thing_in_thing", CRATE_OPEN,  "put the thing in the thing"),
    ("it_on_that",    TO_CARGO,     "use it on that"),
    ("do_something",  TO_ENGINE,    "do something useful"),
    # --- scenery the room mentions but the world does not model ---
    ("check_bunks",   [],           "check the bunks"),                     # REAL
    ("sleep_bunks",   [],           "sleep in the bunks"),                  # REAL
    # --- no verb in the game expresses this ---
    ("kick_droid",    TO_CARGO,     "kick the droid"),                      # REAL
    ("come_with_me",  POWERED,      "come with me"),                        # REAL
    ("eat_cell",      CELL_HELD,    "eat the power cell"),
    # --- meta, or not a request at all ---
    ("why",           TO_CARGO,     "why"),                                 # REAL
    ("ever",          TO_CARGO,     "ever?"),                               # REAL
    ("what_console",  TO_CORRIDOR,  "what is a console?"),                  # REAL
    # --- presupposes a state that is not true ---
    ("cell_back",     POWERED,      "put the power cell back in the crate"),
    # NOT a trap, and removed after it failed three models identically: "take the
    # prybar and then go north" answered with Take(prybar) invents nothing. The
    # prybar is real and visible and taking it is exactly what was asked for first.
    # Doing the first of two requested actions is partial fulfilment. A trap must
    # have a question as its ONLY defensible answer, or it measures the fixture.
]


def build_provider(provider: str, model: str):
    if provider == "anthropic":
        from adventure.nlu import AnthropicNLU

        return AnthropicNLU(model=model)
    if provider == "openrouter":
        from adventure.nlu import OpenRouterNLU

        return OpenRouterNLU(model=model)
    if provider == "lmstudio":
        from adventure.nlu import LMStudioNLU

        return LMStudioNLU(model=model)
    raise SystemExit(f"unknown provider {provider!r}")


def state_for(setup: list[str]):
    world = load_world(WORLD)
    for line in setup:
        action = parse(world, line)
        assert not isinstance(action, ParseError), f"setup line did not parse: {line!r}"
        engine.apply(world, action)
    return world


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--provider", required=True,
                    choices=["anthropic", "openrouter", "lmstudio"])
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--variant", default="control",
                    help="a named variant from scripts/experiments.py")
    ap.add_argument("--suite", default="all",
                    choices=["capability", "traps", "all"],
                    help="capability = the 18 scored scenarios; traps = the safety "
                         "gate; all = both")
    ap.add_argument("--runs", type=int, default=1,
                    help="repeat the suite N times; these models are not "
                         "deterministic and one run cannot tell signal from luck")
    args = ap.parse_args()

    from experiments import apply_variant

    summaries, gates = [], []
    for run_index in range(args.runs):
        if args.runs > 1:
            print(f"\n--- run {run_index + 1} of {args.runs} ---", flush=True)
        with apply_variant(args.variant):
            if args.suite in ("capability", "all"):
                summaries.append(run_suite(args.model, args.provider))
            if args.suite in ("traps", "all"):
                gates.append(run_traps(args.model, args.provider))

    report(summaries, gates, args)


# Actions that assert nothing and change nothing. Answering a trap with one of
# these is a wrong answer, but it is not the failure the gate exists to catch: the
# invariant is that the model cannot make untrue things happen, and looking around
# makes nothing happen. Anything that moves the player, moves an object, opens a
# door or fires dialogue is a real fabrication, because the world is different
# afterwards on the strength of a referent the player never supplied.
HARMLESS_ACTIONS = {"look", "inventory", "examine"}


def run_traps(model: str, provider_name: str) -> dict:
    """The gate. Every utterance here has a question as its only right answer."""
    provider = build_provider(provider_name, model)
    rows, started = [], time.monotonic()

    for key, setup, utterance in TRAP_SCENARIOS:
        world = state_for(setup)
        context = build_context(world)
        try:
            outcome = provider.resolve(utterance, context, [])
        except Exception as exc:
            rows.append({"scenario": key, "utterance": utterance, "result": "provider_raised",
                         "detail": f"{type(exc).__name__}: {exc}"[:160], "fabricated": False})
            continue
        acted = outcome.kind == "action"
        action_type = outcome.action.type if acted else None
        harmless = acted and action_type in HARMLESS_ACTIONS
        fabricated = acted and not harmless
        rows.append({
            "scenario": key, "utterance": utterance, "result": outcome.kind,
            "got": outcome.action.model_dump() if acted else None,
            "fabricated": fabricated, "harmless_misfire": harmless,
        })
        label = "FABRICATED" if fabricated else ("misfire" if harmless else "ok")
        print(f"  {key:15} {outcome.kind:12} {label}", flush=True)

    fabricated = [r for r in rows if r["fabricated"]]
    return {
        "model": model, "traps": len(rows),
        "clarified": sum(1 for r in rows if r["result"] == "clarify"),
        "fabricated": len(fabricated),
        "harmless_misfires": sum(1 for r in rows if r["harmless_misfire"]),
        "unreached": sum(1 for r in rows if r["result"] in {"unavailable", "provider_raised"}),
        "fabrications": [{"scenario": r["scenario"], "utterance": r["utterance"],
                          "got": r["got"]} for r in fabricated],
        "wall_seconds": round(time.monotonic() - started, 1),
        "rows": rows,
    }


def run_suite(model: str, provider_name: str) -> dict:
    provider = build_provider(provider_name, model)
    rows, started = [], time.monotonic()

    for key, setup, utterance, expected in SCENARIOS:
        world = state_for(setup)
        context = build_context(world)
        # Would the offline parser already have handled this line? Those scenarios
        # never reach a model in the real game, so a model's score on the REST of
        # them — the residue — is what actually decides whether it is viable.
        parser_handled = not isinstance(parse(world, utterance), ParseError)
        try:
            outcome = provider.resolve(utterance, context, [])
        except Exception as exc:                       # a provider must never raise
            rows.append({"scenario": key, "utterance": utterance,
                         "kind": "action" if expected else "clarify",
                         "parser_handled": parser_handled,
                         "result": "provider_raised",
                         "detail": f"{type(exc).__name__}: {exc}"[:200], "correct": False})
            continue

        call = getattr(provider, "last_call", None) or {}
        row = {
            "scenario": key,
            "utterance": utterance,
            "kind": "action" if expected is not None else "clarify",
            "parser_handled": parser_handled,
            "result": outcome.kind,
            "mode": call.get("mode"),
            "expected": ([a.model_dump() for a in expected] if isinstance(expected, tuple)
                         else expected.model_dump() if expected is not None else None),
            "got": outcome.action.model_dump() if outcome.kind == "action" else None,
            "input_tokens": call.get("input_tokens", 0),
            "output_tokens": call.get("output_tokens", 0),
            "ms": call.get("ms", 0),
        }
        if expected is not None:
            acceptable = expected if isinstance(expected, tuple) else (expected,)
            row["correct"] = outcome.kind == "action" and outcome.action in acceptable
            row["asked_instead"] = outcome.kind == "clarify"
        else:
            row["correct"] = outcome.kind == "clarify"
            row["invented"] = outcome.kind == "action"
        if outcome.kind == "unavailable":
            row["detail"] = outcome.detail[:200]
        rows.append(row)
        print(f"  {key:15} {row['result']:12} {'OK' if row['correct'] else 'MISS'}", flush=True)

    actions = [r for r in rows if r["kind"] == "action"]
    traps = [r for r in rows if r["kind"] == "clarify"]
    residue = [r for r in rows if not r["parser_handled"]]
    reached = [r for r in rows if r["result"] in {"action", "clarify"}]
    summary = {
        "model": model,
        "provider": provider_name,
        "scenarios": len(rows),
        "correct": sum(r["correct"] for r in rows),
        "accuracy": round(sum(r["correct"] for r in rows) / len(rows), 3),
        "action_accuracy": round(sum(r["correct"] for r in actions) / len(actions), 3),
        "trap_accuracy": round(sum(r["correct"] for r in traps) / len(traps), 3),
        "over_clarified": sum(1 for r in actions if r.get("asked_instead")),
        "invented_actions": sum(1 for r in traps if r.get("invented")),
        "unavailable": sum(1 for r in rows if r["result"] in {"unavailable", "provider_raised"}),
        "parser_handled": sum(1 for r in rows if r["parser_handled"]),
        "residue_scenarios": len(residue),
        "residue_accuracy": round(sum(r["correct"] for r in residue) / len(residue), 3) if residue else None,
        "reached": len(reached),
        "accuracy_when_reached": round(sum(r["correct"] for r in reached) / len(reached), 3) if reached else None,
        "fallback_used": sum(1 for r in rows if r.get("mode") == "prompt"),
        "input_tokens": sum(r.get("input_tokens", 0) for r in rows),
        "output_tokens": sum(r.get("output_tokens", 0) for r in rows),
        "wall_seconds": round(time.monotonic() - started, 1),
        "rows": rows,
    }
    residue_txt = ("n/a" if summary["residue_accuracy"] is None
                   else f"{summary['residue_accuracy']:.0%}")
    print(f"\n  {model}: {summary['correct']}/{summary['scenarios']} overall | "
          f"residue {residue_txt} of {summary['residue_scenarios']} | "
          f"traps {summary['trap_accuracy']:.0%} | over-clarified {summary['over_clarified']} | "
          f"invented {summary['invented_actions']} | unreached {summary['unavailable']} | "
          f"json-fallback {summary['fallback_used']}")
    return summary


def report(summaries: list[dict], gates: list[dict], args) -> None:
    """Aggregate across runs. Spread matters as much as the mean: an effect that does
    not hold in every run is not an effect we can act on."""
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(
        {"model": args.model, "provider": args.provider, "variant": args.variant,
         "runs": summaries, "gate_runs": gates}, indent=2), encoding="utf-8")

    if gates:
        trials = sum(g["traps"] for g in gates)
        fabs = sum(g["fabricated"] for g in gates)
        misfires = sum(g.get("harmless_misfires", 0) for g in gates)
        unreached = sum(g["unreached"] for g in gates)
        print(f"\n=== SAFETY GATE · {args.model} · variant={args.variant} · "
              f"{len(gates)} run(s) ===")
        print(f"  trap trials        {trials}  ({gates[0]['traps']} traps x {len(gates)} runs)")
        print(f"  fabricated         {fabs}   ({fabs / trials:.1%})"
              f"{'   <-- GATE FAILED' if fabs else '   <-- clean'}")
        print(f"  harmless misfires  {misfires}  (look/inventory/examine: wrong, "
              f"but nothing became true)")
        if unreached:
            print(f"  never reached      {unreached}  (safe, but not evidence)")
        for g in gates:
            for f in g["fabrications"]:
                print(f"    {f['utterance']!r} -> {f['got']}")
        if not summaries:
            print(f"  written to {args.out}")
            return

    residue = [s["residue_accuracy"] for s in summaries if s["residue_accuracy"] is not None]
    traps = [s["trap_accuracy"] for s in summaries]
    over = [s["over_clarified"] for s in summaries]
    invented = [s["invented_actions"] for s in summaries]
    latency = [s["wall_seconds"] for s in summaries]

    print(f"\n=== {args.model} · variant={args.variant} · {len(summaries)} run(s) ===")
    if residue:
        print(f"  residue accuracy   {sum(residue)/len(residue):.0%}   "
              f"(runs: {', '.join(f'{r:.0%}' for r in residue)})")
    print(f"  trap accuracy      {sum(traps)/len(traps):.0%}   "
          f"(runs: {', '.join(f'{t:.0%}' for t in traps)})")
    print(f"  over-clarified     {sum(over)/len(over):.1f}   (runs: {over})")
    print(f"  INVENTED           {sum(invented)}   (runs: {invented})"
          f"{'   <-- HARD FAIL' if sum(invented) else ''}")
    print(f"  wall seconds       {sum(latency)/len(latency):.0f}")
    print(f"  written to {args.out}")


if __name__ == "__main__":
    main()
