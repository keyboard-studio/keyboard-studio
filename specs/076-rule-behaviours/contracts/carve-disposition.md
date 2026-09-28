# Contracts: carve suppression (issue #1802)

## carve-disposition — the `ownedByBehaviour` marker and `comboId` identity

**Status**: normative for slice 2 (engine) and slice 5 (import recogniser).

### The marker

- Suppression rules (per-rule rewrites and store-slot guard rules alike) carry `ownedByBehaviour: "carve-suppression"` on the `IRRule`, mutually exclusive with `ownedByPattern` (FR-002, FR-021).
- The string is a literal today; the field stays an open string so later behaviours reuse it without a contract change.
- The codec MUST round-trip the marker: parse reads it from the rule's metadata comment (or wherever `ownedByPattern` round-trips today — same mechanism), emit writes it back. A marker that does not survive scaffold is a fidelity bug (Article II).

### `comboId` identity

- `comboId` is the carve-node id produced by `irToCarveNodes`: the rule `nodeId` for rule carves, `<storeNodeId>#<index>` for store-slot carves.
- The id MUST be stable across recompiles for the same base rule/slot. `irToCarveNodes` must not change its id derivation in this feature; if a future change alters derivation, dispositions keyed by the old ids are dropped as stale (never migrated by guessing).
- Engine functions take dispositions as `ReadonlyMap<string, CarveDisposition>` / `Record<comboId, CarveDisposition>` keyed by this id. The studio is the only writer.

### Import recogniser contract (slice 5)

- Input: an imported `KeyboardIR` (Track 2).
- Rule: any `IRRule` with `ownedByBehaviour === "carve-suppression"` lifts as behaviour-owned. The recogniser MUST NOT apply shape heuristics (bare `> nul` rules can be legitimate author content — research D-07).
- Lifted rules MUST NOT appear as carve targets in the gallery and MUST NOT be treated as author content by the validator's authorship checks.
- On recompile, lifted suppressions are re-emitted from the behaviour (like any owned rule), not preserved verbatim — so a disposition flip after import recompiles them correctly.

### Codec contract (slice 1, FR-004)

- `parse` accepts `nul`, `context`, `context(N)` in output position and `context(N)` (N > 1) in context position, producing the typed elements from [data-model.md](data-model.md).
- `emit` writes them back canonically: `nul`, `context`, `context(2)`.
- The IR header models the `begin` entry-point set (`Unicode`/`ANSI`, `NewContext`, `PostKeystroke`); `NewContext` and `PostKeystroke` groups are `readonly` and never reorder hooks.
- `parse → emit` is identity on the FR-004 fixtures, including a two-entry-group keyboard.
