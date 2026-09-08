"""Read a playthrough journal and report where the language layer was doing work
the world data could have done for free.

The headline section is ALIAS CANDIDATES: lines the offline parser could not
resolve, that the language assistant then resolved to a specific entity. Each one
is a phrase a real player used for a thing your world does not call by that name.
Adding it as an alias moves that phrase from the model to the parser — instant,
offline, free, and it works with the assistant turned off.

Usage:  python scripts/analyze_log.py [logs/playthroughs.jsonl] [--world worlds/wayfarer.json]
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# $ per million tokens, input/output.
PRICES = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
}

# Articles and demonstratives, stripped from a proposed alias. Deliberately does
# NOT include words like "thing" — "glowing thing" is exactly what players say, and
# is a perfectly good alias.
STOPWORDS = {"the", "a", "an", "that", "this", "there", "here"}


def load(path: Path) -> list[dict]:
    if not path.is_file():
        sys.exit(f"No journal at {path}. Play a session first, or pass a different path.")
    records = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            records.append(json.loads(raw))
        except json.JSONDecodeError:
            print(f"  (skipping malformed line {line_no})", file=sys.stderr)
    return records


def entity_names(world_path: Path) -> dict[str, str]:
    """id -> display name, for readable output."""
    if not world_path.is_file():
        return {}
    world = json.loads(world_path.read_text(encoding="utf-8"))
    names = {}
    for table in ("items", "npcs", "doors"):
        for entity_id, entity in world.get(table, {}).items():
            names[entity_id] = entity.get("name", entity_id)
    return names


def action_target(action: dict) -> str | None:
    """The entity id an action is about, if it is about one."""
    for field in ("item", "target", "npc"):
        value = action.get(field)
        if isinstance(value, str):
            return value
    return None


def resolved_by_model(record: dict) -> bool:
    return (record.get("route") == "nlu"
            and (record.get("nlu") or {}).get("result") == "action")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("journal", nargs="?", default="logs/playthroughs.jsonl", type=Path)
    ap.add_argument("--world", default="worlds/wayfarer.json", type=Path)
    args = ap.parse_args()

    records = load(args.journal)
    names = entity_names(args.world)
    if not records:
        sys.exit("Journal is empty.")

    sessions = {r["session"] for r in records}
    # A lost game is a finished game. Counting only wins hid every death in the
    # log behind "N sessions", which is the half of the data a designer most wants:
    # not whether people won, but where they stopped.
    finished = {r["session"]: r.get("outcome") or ("win" if r.get("won") else None)
                for r in records if r.get("outcome") or r.get("won")}
    wins = {s for s, o in finished.items() if o == "win"}
    losses = {s for s, o in finished.items() if o and o != "win"}
    routes = Counter(r.get("route", "?") for r in records)
    game_turns = [r for r in records if r.get("route") in {"parser", "nlu", "unresolved"}]

    abandoned = len(sessions) - len(finished)
    print(f"\n{len(records)} records · {len(sessions)} sessions · "
          f"{len(wins)} won · {len(losses)} lost · {abandoned} unfinished\n")

    if losses:
        print("HOW PEOPLE DIED  (the last thing they did, and where)")
        for session in losses:
            last = [r for r in records if r["session"] == session][-1]
            print(f"  in {last.get('room', '?')}: {last['input']!r}")
        print()

    print("ROUTING")
    for route, count in routes.most_common():
        share = count / len(records)
        print(f"  {route:12} {count:4}  {share:5.0%}")
    reached_model = routes["nlu"]
    if game_turns:
        print(f"\n  {reached_model}/{len(game_turns)} game turns needed the model "
              f"({reached_model / len(game_turns):.0%}). The rest were free.")

    # --- the payoff: two different gaps, two different fixes ------------------
    #
    # unknown_noun -> the parser understood the verb and failed on the NAME.
    #                 That is a vocabulary gap: add an alias to the world file.
    # unknown_verb -> the parser did not recognise the VERB at all.
    #                 That is a grammar gap: add a verb phrase to parser.py.
    aliases: dict[str, Counter] = defaultdict(Counter)
    verbs: dict[tuple[str, str], Counter] = defaultdict(Counter)
    other: list[dict] = []

    for record in records:
        if not resolved_by_model(record):
            continue
        parse_info = record.get("parse") or {}
        target = action_target(record.get("action") or {})
        action_type = (record.get("action") or {}).get("type", "?")
        match parse_info.get("error"):
            case "unknown_noun" if target:
                aliases[target][parse_info.get("noun") or record["input"]] += 1
            case "unknown_verb" if parse_info.get("verb"):
                verbs[(parse_info["verb"], action_type)][record["input"]] += 1
            case _:
                other.append(record)

    print("\nVOCABULARY GAPS  (parser knew the verb, not the name)")
    print("  Fix: add the phrase to that entity's `aliases` in the world file.")
    if not aliases:
        print("  none")
    for entity_id, phrases in sorted(aliases.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"\n  {names.get(entity_id, entity_id)}  [{entity_id}]")
        for phrase, count in phrases.most_common():
            words = [w for w in re.findall(r"[a-z0-9'-]+", phrase.lower())
                     if w not in STOPWORDS]
            suggestion = " ".join(words)
            note = f'  ->  add alias "{suggestion}"' if 0 < len(words) <= 3 else ""
            print(f'      {count}x  "{phrase}"{note}')

    print("\nGRAMMAR GAPS  (parser did not know the verb at all)")
    print("  Fix: add the verb phrase to VERB_PHRASES in parser.py.")
    if not verbs:
        print("  none")
    for (verb, action_type), lines in sorted(verbs.items(), key=lambda kv: -sum(kv[1].values())):
        count = sum(lines.values())
        print(f'\n  {count}x  "{verb}"  ->  {action_type}'
              f'      ("{verb}",): "{action_type}",')
        for line, seen in lines.most_common(3):
            print(f'      e.g. "{line}"')

    if other:
        print(f"\nOTHER MODEL SAVES  ({len(other)} — phrasing with no single obvious fix)")
        for record in other[:8]:
            reason = (record.get("parse") or {}).get("error", "?")
            print(f'  [{reason}] "{record["input"]}"  ->  {(record.get("action") or {}).get("type")}')

    # --- where the model itself struggled ------------------------------------
    stuck = [r for r in records
             if (r.get("nlu") or {}).get("result") == "clarify"]
    if stuck:
        print(f"\nMODEL ASKED FOR CLARIFICATION  ({len(stuck)}/{reached_model} of model calls)")
        for record in stuck:
            model = (record.get("nlu") or {}).get("model", "?")
            print(f'  [{model}] "{record["input"]}"')
            print(f"      → {record.get('response', '')[:90]}")

    # --- engine-level friction ------------------------------------------------
    failures = Counter(r["failure"] for r in records if r.get("failure"))
    if failures:
        print("\nREFUSED BY THE ENGINE  (legal parse, illegal move — puzzle friction)")
        for reason, count in failures.most_common():
            print(f"  {count:3}x  {reason}")

    unresolved = [r for r in records if r.get("route") == "unresolved"]
    if unresolved:
        print(f"\nUNRESOLVED WITH NO ASSISTANT  ({len(unresolved)})")
        for record in unresolved[:10]:
            print(f'  "{record["input"]}"')

    # --- spend ----------------------------------------------------------------
    spend: dict[str, dict[str, int]] = defaultdict(lambda: {"in": 0, "out": 0, "calls": 0})
    for record in records:
        nlu = record.get("nlu") or {}
        model = nlu.get("model")
        if not model:
            continue
        bucket = spend[model]
        bucket["calls"] += 1
        bucket["in"] += nlu.get("input_tokens", 0)
        bucket["out"] += nlu.get("output_tokens", 0)
    if spend:
        print("\nSPEND")
        total = 0.0
        for model, bucket in spend.items():
            price_in, price_out = PRICES.get(model, (0.0, 0.0))
            cost = bucket["in"] * price_in / 1e6 + bucket["out"] * price_out / 1e6
            total += cost
            per_session = cost / max(len(sessions), 1)
            print(f"  {model:28} {bucket['calls']:3} calls  "
                  f"{bucket['in']:6} in  {bucket['out']:5} out  "
                  f"${cost:.4f}  (${per_session:.4f}/session)")
        print(f"  {'total':28} {'':28} ${total:.4f}")
    print()


if __name__ == "__main__":
    main()
