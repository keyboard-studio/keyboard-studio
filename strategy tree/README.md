# Keyboard Studio assets

This folder holds reference documents consumed by **Keyboard Studio** — an interactive tool that helps a user design a Keyman `.kmn` keyboard through a guided conversation.

## Contents

- [strategies.md](strategies.md) — the v1 strategy reference: discovery axes, an interview script, a decision tree, and one card per recommended `.kmn` implementation strategy with a real exemplar from this repo.

## How the Studio consumes this

The Studio loads `strategies.md` as grounding context for its recommendation engine. It uses:

1. The **discovery axes** to know what facts to elicit from the user.
2. The **interview script** as a starting question sequence.
3. The **decision tree** to map elicited axis values to one or more strategy IDs.
4. The matching **strategy cards** as the source of the canonical `.kmn` skeleton it adapts for the user's keyboard.

## Scope of v1

v1 covers **physical-keyboard input** only. Touch and mobile concerns (longpress, multitap, flick, `platform()` gating, `.keyman-touch-layout`) are deferred to v2 and noted at the top of `strategies.md`.
