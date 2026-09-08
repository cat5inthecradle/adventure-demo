"""Where play data goes, behind an interface so it can go somewhere else later.

A journal records one structured record per turn. Today the only destination is a
local JSONL file; tomorrow it might be an HTTP collector, a queue, or a warehouse.
That choice lives behind `JournalSink`, so adding a backend means writing one small
class and teaching `build_sink` its name — no frontend changes, no engine changes.

Two rules hold for every sink:

1. **A journal never breaks the game.** Any failure disables the sink and play
   continues. Losing analytics is always preferable to losing a player's session.
2. **The engine never knows it exists.** Journaling happens in the frontends, on
   the way out, from data the turn already produced.
"""

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from adventure.turn import TurnResult

SCHEMA_VERSION = 1
MAX_RESPONSE_CHARS = 300


class JournalSink(Protocol):
    """A destination for turn records."""

    name: str

    def emit(self, record: dict[str, Any]) -> None:
        """Record one turn. Must not raise."""
        ...

    def describe(self) -> str:
        """Human-readable destination, for startup messages."""
        ...


class NullSink:
    """Journaling off. Every call is a no-op."""

    name = "none"

    def emit(self, record: dict[str, Any]) -> None:
        return

    def describe(self) -> str:
        return "disabled"


class FileSink:
    """Append-only JSONL on local disk.

    One line per turn, so the file stays readable with `jq`, pandas, or
    scripts/analyze_log.py, and a truncated write costs at most one record.
    """

    name = "file"

    def __init__(self, path: Path) -> None:
        self.path: Path | None = path
        self._lock = threading.Lock()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            self.path = None

    def emit(self, record: dict[str, Any]) -> None:
        if self.path is None:
            return
        line = json.dumps(record, ensure_ascii=False) + "\n"
        try:
            # The web server handles turns on a thread pool; one lock and one
            # write call keeps concurrent sessions from interleaving mid-line.
            with self._lock, self.path.open("a", encoding="utf-8") as handle:
                handle.write(line)
        except OSError:
            self.path = None            # stop trying; never take the game down

    def describe(self) -> str:
        return str(self.path) if self.path else "disabled (write failed)"


def build_sink(spec: str | None) -> JournalSink:
    """Turn a configuration string into a sink.

        None, "", "none", "off"        journaling disabled
        "file:PATH" or a bare PATH     append JSONL to PATH

    Unknown schemes raise, rather than silently discarding a session's data.
    """
    if spec is None:
        return NullSink()
    value = spec.strip()
    if value == "" or value.lower() in {"none", "off", "disabled"}:
        return NullSink()
    if value.lower().startswith("file:"):
        return FileSink(Path(value[5:]))
    if "://" in value:
        scheme = value.split("://", 1)[0]
        raise ValueError(
            f"unsupported journal backend '{scheme}://' — this build knows "
            "'file:' and 'none'. Add a JournalSink to support it."
        )
    return FileSink(Path(value))


class Journal:
    """Stamps the common fields onto each record and hands it to a sink.

    One journal per play session; sinks are shared, since they own a resource.
    """

    def __init__(self, sink: JournalSink, world_name: str,
                 session_id: str | None = None) -> None:
        self.sink = sink
        self.world_name = world_name
        self.session_id = session_id or uuid.uuid4().hex[:8]

    @property
    def enabled(self) -> bool:
        return self.sink.name != "none"

    def describe(self) -> str:
        return self.sink.describe()

    def log_turn(self, **fields: Any) -> None:
        """Record one turn. Never raises."""
        if not self.enabled:
            return
        record = {
            "schema": SCHEMA_VERSION,
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "session": self.session_id,
            "world": self.world_name,
            **fields,
        }
        if isinstance(record.get("response"), str):
            record["response"] = _truncate(record["response"])
        self.sink.emit(record)


def turn_record(result: TurnResult, room: str) -> dict[str, Any]:
    """Flatten a turn into the journal's record shape.

    Shared by every frontend so one analyzer understands all of them.
    """
    error = result.parse_error
    record: dict[str, Any] = {
        "room": room,
        "route": result.route,
        "response": result.text,
        "parse": ({"ok": True} if error is None else
                  {"ok": False, "error": error.kind, "noun": error.noun,
                   "verb": error.verb}),
    }
    if result.nlu is not None:
        record["nlu"] = result.nlu
    if result.action is not None:
        record["action"] = result.action.model_dump()
        record["events"] = [event.type for event in result.events]
        record["failure"] = next(
            (e.reason.value for e in result.events if e.type == "action_failed"), None
        )
    return record


def _truncate(text: str) -> str:
    collapsed = " ".join(text.split())
    if len(collapsed) <= MAX_RESPONSE_CHARS:
        return collapsed
    return collapsed[:MAX_RESPONSE_CHARS] + "…"
