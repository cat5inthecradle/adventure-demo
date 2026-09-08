"""HTTP frontend: the same engine, reached over JSON instead of a terminal.

Every response carries BOTH the rendered prose and the structured events behind it.
That is the point of the architecture, not a convenience: a screen reader speaks the
prose, a visual client draws the room from the events, and neither is the "real"
interface. The engine is unchanged and unaware that a browser exists.

Sessions are held in memory. WorldState already serialises to JSON — that is exactly
what save/load does — so moving them to Redis or a database later is a storage change
that does not touch the engine. Until then, run a single replica or use sticky
sessions.
"""

import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from adventure import engine, queries
from adventure.journal import Journal, JournalSink, build_sink, turn_record
from adventure.loader import load_world
from adventure.models import WorldState
from adventure.nlu import DEFAULT_MODEL, NLUProvider
from adventure import pronouns as pronoun_sets
from adventure.renderer import Style, render_event, render_speech
from adventure.turn import take_turn

STATIC_DIR = Path(__file__).parent / "static"
DEFAULT_WORLD = os.environ.get("ADVENTURE_WORLD", "worlds/wayfarer.json")
SESSION_TTL = timedelta(hours=int(os.environ.get("ADVENTURE_SESSION_TTL_HOURS", "6")))
MAX_SESSIONS = int(os.environ.get("ADVENTURE_MAX_SESSIONS", "500"))
# A path, "file:PATH", or "none". In a container point this at a mounted volume —
# a pod's own filesystem does not outlive the pod.
DEFAULT_JOURNAL = os.environ.get("ADVENTURE_JOURNAL", "logs/playthroughs.jsonl")
TRANSCRIPT_PAIRS = 6


# --- wire models -------------------------------------------------------------


class Ref(BaseModel):
    id: str
    name: str


class ExitInfo(BaseModel):
    direction: str
    door: Ref | None = None
    open: bool | None = None
    passable: bool


class GameView(BaseModel):
    """Enough structure for a client to draw the room without parsing prose."""

    room: Ref
    description: str
    exits: list[ExitInfo]
    items: list[Ref]
    npcs: list[Ref]
    inventory: list[Ref]
    turn_count: int
    won: bool
    ended: bool = False               # a loss ends the game too
    outcome: str | None = None        # "win" | "loss" once it is over
    pronouns: str = pronoun_sets.DEFAULT   # the protagonist's, as chosen


class TurnRequest(BaseModel):
    input: str = Field(min_length=1, max_length=500)


class SettingsRequest(BaseModel):
    """Player settings that can change mid-game. Everything here is presentation:
    nothing in it can alter what is in the room or how the game ends."""

    pronouns: str


class TurnResponse(BaseModel):
    text: str                       # written for the eye: skimmable, decorated
    speech: str                     # written for the ear: no decoration, brief on
                                    # a room already seen, blocked ways as sentences
    speech_parts: list[dict] = []   # the same, split by who is speaking
    events: list[dict]              # the structured truth behind both
    view: GameView
    route: str                      # parser | nlu | unresolved
    clarifying: bool = False
    won: bool = False
    ended: bool = False
    outcome: str | None = None


class NewGameResponse(BaseModel):
    session_id: str
    world_id: str
    title: str
    intro: str
    text: str
    speech: str
    speech_parts: list[dict] = []
    view: GameView
    assistant: str | None


# --- session store -----------------------------------------------------------


@dataclass
class GameSession:
    id: str
    world: WorldState
    journal: Journal
    transcript: list[tuple[str, str]] = field(default_factory=list)
    touched: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class SessionStore:
    """In-memory, TTL-bounded. Swap for a shared store to run multiple replicas."""

    def __init__(self, sink: JournalSink, world_name: str) -> None:
        self._sessions: dict[str, GameSession] = {}
        self._sink = sink
        self._world_name = world_name

    def create(self, world: WorldState, world_name: str | None = None) -> GameSession:
        self._evict()
        session_id = uuid.uuid4().hex
        session = GameSession(
            id=session_id,
            world=world,
            # One journal per player, all sharing the process-wide sink; the
            # session id ties a player's turns together in the analyzer.
            journal=Journal(self._sink, world_name or self._world_name,
                            session_id=session_id[:8]),
        )
        self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> GameSession:
        session = self._sessions.get(session_id)
        if session is None:
            raise HTTPException(
                status_code=404,
                detail="That game has expired or was never started. Start a new one.",
            )
        session.touched = datetime.now(timezone.utc)
        return session

    def drop(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def _evict(self) -> None:
        cutoff = datetime.now(timezone.utc) - SESSION_TTL
        for key in [k for k, s in self._sessions.items() if s.touched < cutoff]:
            del self._sessions[key]
        while len(self._sessions) >= MAX_SESSIONS:
            oldest = min(self._sessions.values(), key=lambda s: s.touched)
            del self._sessions[oldest.id]

    def __len__(self) -> int:
        return len(self._sessions)


# --- views -------------------------------------------------------------------


def _valid_pronouns(choice: str) -> str:
    """A player setting arriving over the wire. Unknown values are a client bug and
    are rejected loudly, rather than quietly becoming the default."""
    if choice not in pronoun_sets.SETS:
        raise HTTPException(
            status_code=400,
            detail=f"No pronoun set called {choice!r}. "
                   f"Try one of: {', '.join(pronoun_sets.SETS)}.",
        )
    return choice


def build_view(world: WorldState) -> GameView:
    described = engine.describe_room(world)
    exits = [
        ExitInfo(
            direction=view.direction,
            door=Ref(id=view.door.id, name=view.door.name) if view.door else None,
            open=view.door_open,
            passable=view.door is None or bool(view.door_open),
        )
        for view in described.exits
    ]
    return GameView(
        room=Ref(id=described.room.id, name=described.room.name),
        # A client that draws the room from structure rather than prose still gets
        # prose here, so it goes through the same substitution the transcript does.
        description=pronoun_sets.apply(described.description, world.pronouns),
        exits=exits,
        items=[Ref(id=i.id, name=i.name) for i in described.items],
        npcs=[Ref(id=n.id, name=n.name) for n in described.npcs],
        inventory=[Ref(id=i.id, name=i.name) for i in queries.inventory(world)],
        turn_count=world.turn_count,
        won=world.won,
        ended=world.ended,
        outcome=world.outcome,
        pronouns=world.pronouns,
    )


# --- app ---------------------------------------------------------------------


def load_worlds(world_path: str | Path) -> dict[str, WorldState]:
    """Every world sitting beside the one we were pointed at.

    Validated at startup, so a broken world file is a loud failure now rather than
    a 500 for whoever picks it later. The named world always comes first, since it
    is the default.
    """
    primary = Path(world_path)
    worlds: dict[str, WorldState] = {primary.stem: load_world(primary)}
    for candidate in sorted(primary.parent.glob("*.json")):
        if candidate.stem in worlds:
            continue
        try:
            worlds[candidate.stem] = load_world(candidate)
        except Exception as exc:                # a bad neighbour must not stop the game
            print(f"skipping world {candidate.name}: {exc}")
    return worlds


def create_app(world_path: str | Path = DEFAULT_WORLD,
               nlu: NLUProvider | None = None,
               journal: str | None = DEFAULT_JOURNAL) -> FastAPI:
    worlds = load_worlds(world_path)           # validated once, at startup
    default_world = Path(world_path).stem
    template = worlds[default_world]
    sink = build_sink(journal)
    store = SessionStore(sink, default_world)
    app = FastAPI(title=template.title, docs_url="/api/docs")
    app.state.store = store
    app.state.nlu = nlu
    app.state.template = template
    app.state.worlds = worlds
    app.state.sink = sink

    @app.get("/api/pronouns")
    def list_pronouns() -> dict:
        """The choices a settings panel offers, and the default when none is made.

        Served rather than hard-coded into the page so that the browser and the
        engine can never disagree about what a valid choice is.
        """
        return {"default": pronoun_sets.DEFAULT, "options": pronoun_sets.options()}

    @app.get("/api/worlds")
    def list_worlds() -> list[dict]:
        """What a player can choose between."""
        return [
            {"id": key, "title": world.title, "default": key == default_world}
            for key, world in worlds.items()
        ]

    @app.get("/healthz")
    def healthz() -> dict:
        """Liveness and readiness for Kubernetes. Cheap and dependency-free."""
        return {"status": "ok", "world": template.title, "worlds": list(worlds),
                "sessions": len(store), "journal": sink.describe()}

    @app.post("/api/sessions", response_model=NewGameResponse)
    def new_game(world_id: str | None = None,
                 pronouns: str | None = None) -> NewGameResponse:
        chosen = world_id or default_world
        if chosen not in worlds:
            raise HTTPException(
                status_code=404,
                detail=f"No world called {chosen!r}. Try one of: {', '.join(worlds)}.",
            )
        world = worlds[chosen].model_copy(deep=True)
        # Omitted means "whatever this world was written for" — a returning player
        # sends their own choice, a first-time player gets the author's.
        if pronouns is not None:
            world.pronouns = _valid_pronouns(pronouns)
        session = store.create(world, world_name=chosen)
        return NewGameResponse(
            session_id=session.id,
            world_id=chosen,
            title=world.title,
            intro=pronoun_sets.apply(world.intro, world.pronouns),
            text=render_event(engine.describe_room(world), pronouns=world.pronouns),
            speech=render_event(engine.describe_room(world), Style.SPEECH, world.pronouns),
            speech_parts=render_speech([engine.describe_room(world)], world.pronouns),
            view=build_view(world),
            assistant=getattr(app.state.nlu, "_model", None) if app.state.nlu else None,
        )

    @app.get("/api/sessions/{session_id}", response_model=TurnResponse)
    def current(session_id: str) -> TurnResponse:
        return _look(store.get(session_id))

    @app.put("/api/sessions/{session_id}/settings", response_model=TurnResponse)
    def settings(session_id: str, request: SettingsRequest) -> TurnResponse:
        """Change a presentation setting without spending a turn.

        Substitution happens at render time, so this takes effect on the next
        sentence the game speaks — including in prose written before the change.
        The current room comes back rendered, which is what the client redraws.
        """
        session = store.get(session_id)
        session.world.pronouns = _valid_pronouns(request.pronouns)
        return _look(session)

    def _look(session: GameSession) -> TurnResponse:
        """The room as it stands, spending no turn and changing nothing."""
        described = engine.describe_room(session.world)
        chosen = session.world.pronouns
        return TurnResponse(
            text=render_event(described, pronouns=chosen),
            speech=render_event(described, Style.SPEECH, chosen),
            speech_parts=render_speech([described], chosen),
            events=[described.model_dump()],
            view=build_view(session.world),
            route="parser",
            won=session.world.won,
            ended=session.world.ended,
            outcome=session.world.outcome,
        )

    @app.post("/api/sessions/{session_id}/turn", response_model=TurnResponse)
    def turn(session_id: str, request: TurnRequest) -> TurnResponse:
        session = store.get(session_id)
        room = session.world.player_location
        result = take_turn(session.world, request.input, app.state.nlu, session.transcript)
        session.transcript.append((request.input, result.text))
        del session.transcript[:-TRANSCRIPT_PAIRS]
        session.journal.log_turn(
            input=request.input,
            turn=session.world.turn_count,
            won=session.world.won,
            outcome=session.world.outcome,
            **turn_record(result, room),
        )
        return TurnResponse(
            text=result.text,
            speech=result.speech or result.text,
            speech_parts=result.speech_parts,
            events=[event.model_dump() for event in result.events],
            view=build_view(session.world),
            route=result.route,
            clarifying=result.clarifying,
            won=result.won,
            ended=result.ended,
            outcome=result.outcome,
        )

    @app.delete("/api/sessions/{session_id}", status_code=204)
    def end_game(session_id: str) -> None:
        store.drop(session_id)

    if STATIC_DIR.is_dir():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

        @app.get("/")
        def index() -> FileResponse:
            # The page changes every deploy and a cached copy looks exactly like a
            # bug in the new one — which is a very expensive way to debug nothing.
            return FileResponse(
                STATIC_DIR / "index.html",
                headers={"Cache-Control": "no-store, must-revalidate"},
            )

    return app


def build_default_app() -> FastAPI:
    """Entry point for `uvicorn adventure.web:build_default_app --factory`."""
    from adventure.cli import _build_nlu, _load_dotenv

    _load_dotenv()
    mode = os.environ.get("ADVENTURE_LLM", "auto")
    model = os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
    return create_app(DEFAULT_WORLD, nlu=_build_nlu(mode, model))


def run() -> None:
    """`adventure-web` — a local dev server."""
    import uvicorn

    uvicorn.run(
        "adventure.web:build_default_app",
        factory=True,
        host=os.environ.get("ADVENTURE_HOST", "127.0.0.1"),
        port=int(os.environ.get("ADVENTURE_PORT", "8000")),
    )
