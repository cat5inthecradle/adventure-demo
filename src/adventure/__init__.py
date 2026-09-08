"""The Accessible Space Adventure: a deterministic text-adventure engine.

The engine is the only source of game truth. Language interfaces (the dumb
parser, and optionally an LLM) translate player input into structured actions;
they never decide what is true.
"""
