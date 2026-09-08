# **The Accessible Space Adventure**

### A weekend project: build a tiny text adventure engine where the LLM is optional

**The pitch:**
Build a small, Zork-inspired sci-fi adventure that can be played entirely through text, speech, or Braille—with an optional LLM layer that makes the interface dramatically more forgiving and conversational without ever being responsible for the game’s rules.

The interesting technical constraint is:

> **The LLM may understand what the player means, but it never gets to decide what is true.**

### The weekend-sized demo

The player wakes aboard a disabled spaceship.

There are roughly **5 rooms**, a handful of objects, one NPC/droid, a small puzzle, and a simple objective:

**Restore power and escape the ship.**

The game should be completable with a deliberately dumb command parser:

> `look`
> `go east`
> `take power cell`
> `use power cell on droid`
> `talk to droid`
> `open door`

But with an LLM enabled, the same engine could understand:

> “Hmm, I should probably see what's in this room.”

or

> “Grab that glowing battery thing and stick it in the robot.”

The LLM translates those utterances into **structured game actions**. The deterministic engine decides whether those actions are legal and what happens.

---

## The core architecture

Keep the actual game engine extremely small:

**World State → Rules → Actions → New World State**

Everything else is an interface.

The world might know:

* where every object and character is
* what the player knows
* doors and their states
* inventory
* NPC state
* flags and variables
* available actions
* game rules

An action might be something like:

> `TAKE(player, power_cell)`

The engine validates it, changes the world, and produces an event:

> `power_cell moved from cargo_bay to player_inventory`

The presentation layer turns that event into whatever the player needs:

**Text:**

> You pick up the glowing power cell.

**Speech:**

> “You pick up the glowing power cell.”

**Braille:**
Structured, navigable information about the same event.

**Visual:**
A graphical representation of the room and its objects.

---

## The LLM's job

The LLM is an **optional language interface**, not a game master.

It gets a carefully constrained description of:

* the player's current state
* relevant objects
* legal actions
* perhaps recent conversation

And returns something structured like:

> `USE(power_cell, maintenance_droid)`

If the player says something ambiguous:

> “Put the thing in the thing.”

the LLM doesn't invent an answer. It asks:

> “Do you mean the power cell or the coolant canister?”

And if the player asks for something impossible:

> “Open the airlock with my sandwich.”

the deterministic engine gets the final say.

Without an LLM, the game still works.

With a local LLM, it becomes more natural.

With an internet-connected model, it might become *really* good.

**The game itself doesn't care.**

---

## Accessibility is a first-class feature

Don't build a visual game and then bolt accessibility onto it.

Build an **interactive world whose native representation is modality-independent**.

The same underlying state should support:

* ⌨️ keyboard/text
* 🗣️ speech input and audio output
* ⠿ Braille displays
* 🖥️ eventually, a visual interface

That makes the project interesting even if the graphics never happen.

A sighted player might eventually see a ship schematic.

A blind player might ask:

> “What's around me?”

> “There's a sealed door to the north, a console beside you, and a corridor leading east.”

Both players are interacting with exactly the same world.

---

## What makes this a good weekend project

**Saturday:** Build the engine.

* World state
* Rooms/locations
* Objects
* Inventory
* Actions
* Rules
* Tiny command parser
* Save/load

**Sunday:** Build the adventure.

* 5-room spaceship
* NPC/droid
* 5–10 objects
* one puzzle
* a few state-dependent interactions
* basic text UI
* optional LLM adapter

**Stretch goal:** speech I/O or a simple accessibility-oriented interface.

---

## The definition of success

By Sunday night, you should be able to sit down at a terminal and play:

> **“You are aboard the *Wayfarer*, a disabled freighter. Emergency power is failing.”**

Then solve the adventure using ordinary language—or terse Zork commands—while knowing that **every piece of game truth comes from the same deterministic engine**.

And ideally, you can turn the LLM off, disconnect the machine from the internet, and play the exact same game.

That's the prototype.

The bigger idea hiding behind it is an **open, modality-independent adventure engine** where natural language is an interface rather than the game itself.

