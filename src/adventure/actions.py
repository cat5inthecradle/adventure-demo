"""The Action discriminated union: structured player intents referencing entity IDs. Never checks legality."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter

from adventure.models import Direction


class Look(BaseModel):
    type: Literal["look"] = "look"


class Examine(BaseModel):
    type: Literal["examine"] = "examine"
    target: str                       # item, npc, or door id


class Go(BaseModel):
    type: Literal["go"] = "go"
    direction: Direction


class Traverse(BaseModel):
    """Go through a named portal — a door, hatch, window, gap — rather than in a
    compass direction. "get in the pod", "jump out the window", "go through the
    hatch". The engine works out which exit it is and what it takes to pass."""

    type: Literal["traverse"] = "traverse"
    target: str                       # door id


class Listen(BaseModel):
    """Hear. With no target, or with one the world has nothing particular to say
    about, this is the room's own sound — hearing belongs to a place, not to every
    object in it. Portals may answer for themselves."""

    type: Literal["listen"] = "listen"
    target: str | None = None         # door id, or None for "just listen"


class Take(BaseModel):
    type: Literal["take"] = "take"
    item: str


class Drop(BaseModel):
    type: Literal["drop"] = "drop"
    item: str


class Open(BaseModel):
    type: Literal["open"] = "open"
    target: str                       # door id


class Use(BaseModel):
    type: Literal["use"] = "use"
    item: str
    target: str | None = None


class Talk(BaseModel):
    type: Literal["talk"] = "talk"
    npc: str


class ShowInventory(BaseModel):
    type: Literal["inventory"] = "inventory"


Action = Annotated[
    Union[Look, Examine, Go, Traverse, Listen, Take, Drop, Open, Use, Talk,
          ShowInventory],
    Field(discriminator="type"),
]
ACTION_ADAPTER: TypeAdapter[Action] = TypeAdapter(Action)
