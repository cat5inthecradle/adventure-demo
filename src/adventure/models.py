"""World state and entity models (Pydantic v2). Data only — never mutates itself, never performs I/O."""

from typing import Literal

from pydantic import BaseModel, Field

from adventure.pronouns import DEFAULT as PRONOUNS_DEFAULT

Direction = Literal["north", "south", "east", "west", "up", "down"]

# The fixed order exits are listed and searched in, so descriptions and
# pathfinding are deterministic.
DIRECTION_ORDER: tuple[Direction, ...] = (
    "north", "south", "east", "west", "up", "down",
)

# Special location values for Item.location (besides room IDs):
LOC_INVENTORY = "inventory"   # carried by the player
LOC_HIDDEN = "hidden"         # not in the world (not yet revealed, or consumed)


class Exit(BaseModel):
    to: str                       # destination room id
    door_id: str | None = None    # if set, this exit passes through a Door
    # Narration for going this way. It lives on the exit rather than the door
    # because an exit already knows which way you are facing: a window you drop out
    # of is not the same event as the window you climb back in through.
    pass_message: str | None = None


# How a game can be over. There is no "in progress" value — that is `outcome is None`.
Outcome = Literal["win", "loss"]


class CounterCondition(BaseModel):
    """A range test against one counter. Both bounds are inclusive, and an omitted
    bound is unbounded — `{"at_least": 3}` means 3 or more.

    An unset counter reads as 0, exactly as an unset flag reads as False.
    """

    at_least: int | None = None
    at_most: int | None = None


class Item(BaseModel):
    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    description: str
    location: str                     # room id | "inventory" | "hidden"
    portable: bool = True
    alt_description: str | None = None  # used instead of description when...
    alt_flag: str | None = None         # ...world.flags.get(alt_flag) is True
    # Shown when the player tries to open this. "You can't do that" is a dead end;
    # a good refusal telegraphs that the obstacle CAN be beaten, and how.
    open_refusal: str | None = None
    # item_id -> message, used when the player is carrying that item, so the hint
    # sharpens once they are holding the tool that would work.
    open_refusal_with: dict[str, str] = Field(default_factory=dict)


class Effect(BaseModel):
    """One world mutation. Discriminated by `type`."""

    type: Literal[
        "set_flag", "move_item", "move_npc", "move_player",
        "adjust_counter", "set_door", "end_game", "win_game",
    ]
    # set_flag:
    flag: str | None = None
    value: bool | None = None
    # move_item / move_npc / move_player:
    item_id: str | None = None
    npc_id: str | None = None
    to: str | None = None             # room id, or "inventory" | "hidden" for items
    # adjust_counter:
    counter: str | None = None
    delta: int | None = None
    # set_door:
    door_id: str | None = None
    open: bool | None = None
    locked: bool | None = None
    # end_game: the world supplies its own last words, so one world can end in
    # several different ways. `win_game` is the older spelling of end_game(win)
    # taking its epilogue from WorldState.win_epilogue.
    outcome: Outcome | None = None
    epilogue: str | None = None
    banner: str | None = None


class Rule(BaseModel):
    """An ordered, guarded thing the world can say. Used for npc dialogue and for
    listening at a portal: in both, the first rule whose guards match is the one
    that fires, so the most specific goes first and the last one is the catch-all."""

    # Where the player must be standing. Empty means anywhere. A companion who
    # follows you says different things in different rooms, and a window heard from
    # the roof is not the window heard from the bed.
    rooms: list[str] = Field(default_factory=list)

    requires_flags: dict[str, bool] = Field(default_factory=dict)
    requires_counters: dict[str, CounterCondition] = Field(default_factory=dict)
    requires_doors: dict[str, bool] = Field(default_factory=dict)   # door id -> open?
    text: str
    effects: list[Effect] = Field(default_factory=list)
    once: bool = False
    fired: bool = False               # mutable state, persisted in saves


DialogueRule = Rule                   # the older name, kept for readability at NPCs


class Door(BaseModel):
    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    description: str
    open: bool = False
    locked: bool = False
    unlock_flag: str | None = None    # opening succeeds only when this flag is True
    locked_message: str | None = None # narration when opening fails while locked
    # A door is the one piece of scenery every player touches, and until now the
    # only thing it could say was no. These are its yes.
    open_message: str | None = None   # narration when it is opened
    # What listening at this portal gets you, first match wins. A door with none
    # falls back to the room's own sound, so an ordinary door never gives away that
    # it is ordinary — and a door worth listening at has to earn it with its name.
    listening: list[Rule] = Field(default_factory=list)


class NPC(BaseModel):
    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    description: str
    location: str                     # room id
    # A companion walks with you. The engine moves them whenever the player moves,
    # so a world never has to script a follower room by room.
    follows_player: bool = False
    dialogue: list[Rule]              # evaluated top to bottom; first match wins


class Room(BaseModel):
    id: str
    name: str
    description: str
    exits: dict[Direction, Exit] = Field(default_factory=dict)
    alt_description: str | None = None
    alt_flag: str | None = None
    # What you can hear standing here. Hearing is a property of a place, not of
    # each object in it, so this answers `listen` and every listen at something the
    # world has nothing particular to say about.
    sounds: str | None = None
    alt_sounds: str | None = None     # swapped in on the same alt_flag


class Interaction(BaseModel):
    """A 'use X [on Y]' rule."""

    id: str
    item_id: str                      # the entity being used: item, NPC, or door,
                                      # and for an item, in inventory or in the room
    target_id: str | None = None      # item, NPC, or door id; None = "use X" bare
    requires_flags: dict[str, bool] = Field(default_factory=dict)
    requires_counters: dict[str, CounterCondition] = Field(default_factory=dict)
    requires_doors: dict[str, bool] = Field(default_factory=dict)   # door id -> open?
    message: str                      # narration on success
    effects: list[Effect] = Field(default_factory=list)
    once: bool = False
    fired: bool = False               # mutable state, persisted in saves


class Trigger(BaseModel):
    """A rule the *world* runs, rather than one the player aims at something.

    Interactions and dialogue answer a player action; a trigger answers a player
    *situation*. It is checked after every action that counted as a turn, and it
    fires when the player is standing in one of its rooms and its conditions hold.

    Unlike dialogue and interactions, triggers are not first-match-wins: every
    matching trigger fires, in file order, each judged against the world as the one
    before it left it. So a trigger that raises a counter can arm a later trigger
    within the same turn — which is how walking into an exposed corridor can be the
    step that gets you caught. Once one ends the game, the rest are skipped.
    """

    id: str
    # "enter" fires only on the turn the player arrived somewhere; "turn" fires on
    # any counted action, including that arrival.
    when: Literal["enter", "turn"] = "enter"
    rooms: list[str] = Field(default_factory=list)   # empty = anywhere
    requires_flags: dict[str, bool] = Field(default_factory=dict)
    requires_counters: dict[str, CounterCondition] = Field(default_factory=dict)
    requires_doors: dict[str, bool] = Field(default_factory=dict)   # door id -> open?
    text: str = ""                    # narration; empty fires the effects silently
    effects: list[Effect] = Field(default_factory=list)
    once: bool = False
    fired: bool = False               # mutable state, persisted in saves


class WorldState(BaseModel):
    schema_version: int = 1
    title: str
    intro: str
    # The protagonist's pronouns: an id from adventure.pronouns.SETS. A world sets
    # the default its prose was written for; the player overrides it from settings,
    # and the override lives here so that it saves, loads, and can change mid-game.
    pronouns: str = PRONOUNS_DEFAULT
    # The fallback last words for a win, used when an end_game effect names none
    # of its own (and by the older win_game spelling, which never could).
    win_epilogue: str
    player_location: str              # room id
    # Rooms the player has stood in, in order of first arrival. Navigation by room
    # name routes only through these: you can head for somewhere you have heard of,
    # but you cannot shortcut through corridors you have never walked.
    visited: list[str] = Field(default_factory=list)
    previous_location: str | None = None
    rooms: dict[str, Room]
    doors: dict[str, Door] = Field(default_factory=dict)
    items: dict[str, Item] = Field(default_factory=dict)
    npcs: dict[str, NPC] = Field(default_factory=dict)
    interactions: list[Interaction] = Field(default_factory=list)
    triggers: list[Trigger] = Field(default_factory=list)
    flags: dict[str, bool] = Field(default_factory=dict)
    # Integers, for everything a boolean cannot say: how close the hunters are, how
    # many times you pushed your luck. An unread counter is 0.
    counters: dict[str, int] = Field(default_factory=dict)
    outcome: Outcome | None = None    # None while the game is still in progress
    turn_count: int = 0

    @property
    def ended(self) -> bool:
        """True once the game is over, however it ended."""
        return self.outcome is not None

    @property
    def won(self) -> bool:
        """Kept as the name every frontend already asks for. A loss is an ending
        too, so check `ended` when you mean "can the player still act"."""
        return self.outcome == "win"
