# Feature Specification: OSK editor step

**Feature Branch**: `km/osk-editor`

**Created**: 2026-11-03

**Status**: Shipped (as-built)

**Owner**: Studio team

## Purpose

After the Mechanical gallery assigns physical keys, the author customizes the
desktop on-screen keyboard (OSK): key labels, deadkey labels, and display
options. The step emits a `.kvks` XML via the `KvksIR` → XML seam.

## Placement

The `osk` step sits on the manifest spine between `mechanisms` and `touch`.
Advance: `mechanisms` → `osk` → (`touch_seed_source` fork) → `touch`.
The gallery decision module is `oskLayout` (`provides: ["osk-layout"]`,
`requires: ["physical-layout"]`, `screen: "osk"`); recording is step-side via
`completeOskStep` on Continue.

## Decisions (Matthew, 2026-11-03)

- Labels are free text and may differ from output (for understanding).
- Empty label + output is an editor error.
- Deadkey labels are human-readable, never raw `dk(...)`.
- `display-underlying-chars` and 102nd-key toggles are in.
- Dotted-circle diacritic base is a separate issue.
- Bitmaps/exports are out of scope.

## Scope

- Phase 1 engine: `emitKvks` (`KvksIR` → XML), `generateKvksFromIR` (base OSK),
  `KvksIR` `key102` / `displayUnderlying` flags.
- Phase 2: `OskEditor` React canvas wired as the `osk` step after the
  Mechanical gallery.
- Out of scope: bitmap export, dotted-circle diacritic base handling.
