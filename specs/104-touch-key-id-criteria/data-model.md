# Data Model: Touch key identity criteria (spec 104)

Entities introduced or extended by this spec. The production record is a
computed value (never persisted); the four record types live on the
decision spine (spec 093 conventions, Constitution Art. III) inside the
working copy. Field lists are normative at the level the contracts and
FRs cite; TypeScript shapes are T003/T005's to finalise.

## 1. Touch key production (computed, contracts §1)

One record per (key occurrence × layer-state) from `resolveTouchProduction()`.

| Field | Type | Rules |
|---|---|---|
| `productions` | list of `{ output, condition? }` | `output`: char \| string \| `deadkey(name)` \| `layerSwitch(layerId)` \| `none` \| `unknown`. More than one entry ONLY when `contextConditional` is true |
| `source` | enum | `rule` \| `u-decode` \| `k-fallback` \| `emulation` \| `none` \| `unclassified` |
| `contextConditional` | boolean | true when producing bindings carry incompatible context conditions; consumers must handle the set, never collapse it |
| `ruleRefs` | nodeId[] | ALL bindings of the id in this state, any role; `source: "rule"` additionally requires ≥1 producing binding among them |
| `fallbackCertain` | boolean | false in exactly one case: presumptive `u-decode` where a `nomatch` group exists or any rule binds the id. (Caps-state K_ was the second case until the T022 probe settled it — the fallback fires in caps state, contracts §5.) |

Invariants:
- `source: "unclassified"` (imported id outside K_/T_/U_) — no criterion,
  choice, or repair may consume the record; FR-009 must not read it as dead.
- `source: "emulation"` (K_BKSP, K_ENTER, K_TAB, K_LOPT/K_ROPT, numpad) —
  frame-class by role; excluded from FR-002 equality and severance.
- A producing-class T_ key whose production is `none` in every state IS
  the dead-key finding (FR-009/FR-023) — there is no second definition.

## 2. Key identity decision (spine record)

| Field | Notes |
|---|---|
| `keyRef` | platform × layer × key occurrence address (the FR-001 unit) |
| `action` | `minted` \| `kept` \| `severed` \| `repaired` \| `converted` \| `relinked` \| `kept-by-choice` \| `flagged-manual` |
| `criterion` | the contracts §2 arm or FR that fired (arm 0, a–e, FR-009, FR-029, …) |
| `track` | `creation` \| `copy` \| `adapt` |
| `proposer` | `criteria` \| `author` |
| `authorAnswer` | present iff a choice was presented (Track 2, repairs); includes `declined` |
| `hostSet` | the FR-002 target host set in force when equality was judged |
| `provenance` | spec 093 fields (timestamps, session, supersedes link) |

State rules: a declined answer suppresses re-presentation until the
underlying state changes (FR-017); a decision is superseded, never edited
in place; track switch discards PENDING (unanswered) presentations only —
recorded decisions stand (FR-018).

## 3. Guard specification (spine record, one per keyboard)

| Field | Notes |
|---|---|
| `behaviour` | `swallow` (mark types nothing with no base letter) \| `emit` (mark appears anyway) |
| `origin` | `asked` \| `seeded-from-import` (Track 2, presented for confirmation, FR-013) |
| `confirmed` | boolean — a seeded specification is provisional until confirmed at the marks station |

Invariant: no guarded T_ mark may be minted while the specification is
absent (FR-013); marks minted `U_` before it exists are re-evaluated when
it lands, and the re-evaluation is reported, never silent (US1 scenario 6).

## 4. Repair proposal (spine record)

| Field | Notes |
|---|---|
| `keyRef` | the dead key's occurrence address |
| `defaultAction` | `convert-to-u` (suffix parses AND no guard specification in force for a mark) \| `mint-and-rule` \| `blank` — per FR-009 |
| `options` | the full FR-009 option set for this key |
| `outcome` | `applied` \| `changed` \| `declined` \| `unvisited` |

Invariant: `unvisited` at download ⇒ passes through unapplied, warning
recorded + listed at Output (FR-015 ruling). A repair is never applied
without an outcome of `applied`/`changed` recorded first.

## 5. Transplant record (spine record)

| Field | Notes |
|---|---|
| `sourceId` → `targetId` | e.g. `K_1` → `T_0300`-class mint |
| `layersAffected` | the layer family where arm 0 failed (contracts §3 step 4); other families untouched |
| `clonedRuleNodeIds` | source → clone pairs, group + relative order preserved, `if()` guard elements cloned in place |
| `outcome` | `completed` \| `refused` |
| `refusalBinding` | present iff refused: the shared store/deadkey/key binding, group/order conflict, or target-id collision that caused it |

Invariants: a refused transplant emits NO clones (FR-008); a completed
transplant is the only artefact a re-link (FR-029) may delete, and
re-linking consumes exactly this record's clone list.
