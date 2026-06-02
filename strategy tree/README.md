# Keyboard Studio assets

This folder originally held the standalone `.kmn` strategy reference consumed by **Keyboard Studio**.

## Merged into the spec

That reference has been **merged into the main spec**: see [../spec.md](../spec.md) → **Section 7 (Strategy selection)**, which now holds the discovery axes, the decision tree, the S-01…S-12 strategy catalog, the building blocks, and the validation table. `spec.md` is the single source of truth.

- [strategies.md](strategies.md) — retained as a stub pointer only; do not edit.

## How the Studio consumes this

The Studio loads `spec.md` as grounding context. The strategy selector (spec §4) uses §7 to: elicit the discovery axes via the survey, run the decision tree to map axis values to strategy IDs, and adapt the matching strategy card's canonical `.kmn` skeleton for the user's keyboard.

## Scope note

In the standalone reference the strategy framework was drafted **physical-keyboard only**. In the studio it is the desktop-rule layer of the full pipeline; touch layouts and packaging are in scope via spec Phases E/D/G (see the scope note in spec §7).
