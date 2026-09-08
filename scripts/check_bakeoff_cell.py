"""Verify one bakeoff cell. Exit 0 only if the cell really ran and really reported.

Prints the reason for every failure — the retry prompt and the run log both depend
on this output being specific.
"""

import argparse
import json
import sys
from pathlib import Path

REQUIRED_SECTIONS = ["# bakeoff cell", "model:", "## failure modes", "## evidence",
                     "## residue"]
EXPECTED_SCENARIOS = 18


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session-dir", required=True, type=Path)
    ap.add_argument("--expected-model", required=True)
    args = ap.parse_args()

    results = args.session_dir / "results.json"
    notes = args.session_dir / "evaluator-notes.md"

    if not results.is_file():
        fail(f"{results} missing — the benchmark did not run to completion")
    if not notes.is_file():
        fail(f"{notes} missing — no write-up was produced")

    try:
        data = json.loads(results.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"results.json is not valid JSON: {exc}")

    if data.get("model") != args.expected_model:
        fail(f"results.json ran model {data.get('model')!r}, expected {args.expected_model!r} "
             "— this cell did not test the model it was assigned")

    rows = data.get("rows") or []
    if len(rows) != EXPECTED_SCENARIOS:
        fail(f"expected {EXPECTED_SCENARIOS} scenarios, found {len(rows)} "
             "— the benchmark was cut short")

    # Recompute the headline number: never trust a reported score.
    recomputed = sum(1 for row in rows if row.get("correct"))
    if recomputed != data.get("correct"):
        fail(f"reported correct={data.get('correct')} but rows contain {recomputed}")

    unavailable = sum(1 for r in rows if r.get("result") in {"unavailable", "provider_raised"})
    if unavailable > EXPECTED_SCENARIOS // 2:
        fail(f"{unavailable}/{len(rows)} scenarios failed to reach the model — "
             "this is an outage or a bad model id, not a score")

    body = notes.read_text(encoding="utf-8").lower()
    missing = [s for s in REQUIRED_SECTIONS if s not in body]
    if missing:
        fail(f"evaluator-notes.md is missing required sections: {', '.join(missing)}")
    if "verdict:" not in body:
        fail("evaluator-notes.md has no final 'VERDICT:' line")
    if args.expected_model.lower() not in body:
        fail(f"evaluator-notes.md never names the model under test ({args.expected_model})")

    print(f"PASS: {args.expected_model} scored {recomputed}/{len(rows)} "
          f"(actions {data.get('action_accuracy')}, traps {data.get('trap_accuracy')}, "
          f"unavailable {unavailable}); notes complete")


if __name__ == "__main__":
    main()
