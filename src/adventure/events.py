"""The Event discriminated union and failure reason codes. Carries structured facts, never formatted prose."""

from enum import StrEnum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class Reason(StrEnum):
    NO_EXIT = "no_exit"                 # no exit in that direction
    DOOR_CLOSED = "door_closed"         # exit exists but door is shut
    DOOR_LOCKED = "door_locked"         # open attempt failed; door is locked
    ALREADY_OPEN = "already_open"
    NOT_PRESENT = "not_present"         # entity not visible here
    NOT_PORTABLE = "not_portable"
    ALREADY_CARRYING = "already_carrying"
    NOT_CARRYING = "not_carrying"       # drop target not in inventory
    NOT_OPENABLE = "not_openable"       # open target isn't a door
    NOTHING_HAPPENS = "nothing_happens" # no matching interaction / dialogue
    GAME_OVER = "game_over"             # action after the game has ended


class EntityRef(BaseModel):
    id: str
    name: str


class ExitView(BaseModel):
    direction: str
    door: EntityRef | None = None
    door_open: bool | None = None       # None when there is no door


class RoomDescribed(BaseModel):
    type: Literal["room_described"] = "room_described"
    room: EntityRef
    description: str                    # already alt-resolved by the engine
    exits: list[ExitView]
    items: list[EntityRef]              # visible items in the room
    npcs: list[EntityRef]
    # False when the player has stood here before. A fact about the world, not a
    # formatting hint — renderers decide what to do with it. Spoken aloud, hearing
    # the same paragraph every time you cross the corridor is punishing.
    first_visit: bool = True


class EntityExamined(BaseModel):
    type: Literal["entity_examined"] = "entity_examined"
    entity: EntityRef
    description: str                    # already alt-resolved


class Moved(BaseModel):
    type: Literal["moved"] = "moved"
    from_room: EntityRef
    to_room: EntityRef
    through: EntityRef | None = None    # the door passed through, if any
    message: str | None = None          # Exit.pass_message; renderer has a default


class ItemTaken(BaseModel):
    type: Literal["item_taken"] = "item_taken"
    item: EntityRef


class ItemDropped(BaseModel):
    type: Literal["item_dropped"] = "item_dropped"
    item: EntityRef


class DoorOpened(BaseModel):
    type: Literal["door_opened"] = "door_opened"
    door: EntityRef
    message: str | None = None          # Door.open_message; renderer has a default


class ItemUsed(BaseModel):
    type: Literal["item_used"] = "item_used"
    item: EntityRef
    target: EntityRef | None
    message: str                        # Interaction.message


class NpcSpoke(BaseModel):
    type: Literal["npc_spoke"] = "npc_spoke"
    npc: EntityRef
    text: str                           # DialogueRule.text


class Listened(BaseModel):
    type: Literal["listened"] = "listened"
    subject: EntityRef | None = None    # what was listened at, when it was named
    text: str | None = None             # the world's words; renderer has a default


class InventoryListed(BaseModel):
    type: Literal["inventory_listed"] = "inventory_listed"
    items: list[EntityRef]


class Narrated(BaseModel):
    """The world speaking on its own account, rather than in reply to an action —
    what a trigger has to say when it fires."""

    type: Literal["narrated"] = "narrated"
    trigger: str                        # Trigger.id, for logs and tests
    text: str                           # Trigger.text


class GameEnded(BaseModel):
    type: Literal["game_ended"] = "game_ended"
    outcome: Literal["win", "loss"]
    epilogue: str                       # the world's last words for this ending
    banner: str | None = None           # world-supplied closer; renderer has defaults


class ActionFailed(BaseModel):
    type: Literal["action_failed"] = "action_failed"
    reason: Reason
    subject: EntityRef | None = None    # the entity involved, when known
    message: str | None = None          # world-supplied override (e.g. locked_message)


Event = Annotated[
    Union[RoomDescribed, EntityExamined, Moved, ItemTaken, ItemDropped, DoorOpened,
          ItemUsed, NpcSpoke, Narrated, Listened, InventoryListed, GameEnded,
          ActionFailed],
    Field(discriminator="type"),
]
