# Data model: Caps Lock and `&CasedKeys`

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Nothing here is a `Pattern` schema change (Constitution Art. I). The only stored entity is the
caps-handling decision; everything else is derived on demand.

## Plane

`"base" | "shift" | "ralt" | "shift-ralt"`. The four planes 7.28 and the derivation read. A plane is
"used" when the keyboard has at least one rule producing a single character on it for some key.

## Key plane outputs (derived, `contracts/src/ir/casedKeys.ts`)

`Map<vkey, Partial<Record<Plane, string>>>`. Single-character output per key per plane, from direct
rules and the `any(store) > index(store, n)` form. Rules with deadkey context are skipped;
CAPS/NCAPS siblings fold to the NCAPS output (research R2).

## Cased key set (derived, never stored)

| Field | Type | Notes |
|---|---|---|
| `keys` | `string[]` | vkeys, store order: the family floor first, then extra keys in key-code order |
| `extra` | `string[]` | keys beyond the family floor (for display: "also covers `[`, RAlt+N") |
| `conflicts` | `{ vkey, plane, unshifted, shifted }[]` | keys excluded by research R1 rule 2 |

Validation:
- A key is in `keys` iff (family floor) or (≥1 used plane is a case pair, by `caseCounterpart(·, bcp47)`,
  and no used plane is a distinct non-case pair).
- A floor key that has a conflict is **still excluded** and reported: the floor is a default, not a
  promise to break RAlt output.
- Empty `keys` (caseless) means no store is written.

Family floor: `CASED_KEYS_QWERTY` (`K_A`..`K_Z`) or `CASED_KEYS_AZERTY`, exported from
`scaffold-ir.ts`, chosen by the routing group. On Open, the floor is empty: the set is what the
keyboard's own planes show.

## Caps-handling decision (stored, Copy only)

A spec 088 decision-set entry, id `caps-handling` (added to `DecisionId`).

| Field | Type | Notes |
|---|---|---|
| `mode` | `"cased-keys" \| "explicit-rules" \| "none"` | |

The key set is **not** stored; step 2.8 recomputes it (research R9), so later assignments are
covered (Story 2 scenario 2).

State and provenance (Art. III / X):

```text
alphabet caseless ──────────────► not-asked (no entry, no store)
alphabet cased ──► seeded mode=cased-keys, provenance "default" (shown as a default)
                       │ author confirms ─► provenance "asked", same mode
                       │ author changes  ─► provenance "asked", mode=explicit-rules|none
alphabet edited to caseless ───► entry kept, re-proposed (Art. X: never silently dropped);
                                  projection writes no store while the alphabet is caseless
```

`explicit-rules` is offered only when the copied keyboard has CAPS/NCAPS rules (research R10).

Two vocabularies (Art. III): the 088 set uses `DecisionProvenance` from
`studio/src/decisions/decisionTypes.ts:169` (`"default"` seeded, `"asked"` once the author
confirms or changes it). The 053 record (`contracts/src/decisionRecord.ts:54`) logs the seed as
agency `"tool-proposed"` and the author's answer as `"hand-set"`, through the same `answerProvenance`
path every gallery module uses. `not-asked` is a step status, not a record entry.

## Caps comparison (derived, transient)

Produced by `compareCapsBehaviour` (research R5).

| Field | Type | Notes |
|---|---|---|
| `rows` | `CapsRow[]` | one per key × used plane |
| `verdict` | `"identical" \| "gains-uppercase" \| "differs"` | worst row wins |
| `differs` | `CapsRow[]` | the rows that block the offer, for the withheld message |

`CapsRow`: `{ vkey, plane, before: CapsOutputs, after: CapsOutputs, verdict }`, where
`CapsOutputs = { none, shift, caps, shiftCaps }` (strings; `""` when the key types nothing).

`gains-uppercase` for a row means: `none` and `shift` equal before and after; and each of `caps` /
`shiftCaps` either is unchanged, or changed to the case counterpart of `none` / `shift` respectively.

## Upgrade fix (derived, Open only)

The output of `upgradeToCasedKeys`, consumed by spec 111's suggested-fix surface as a `kind: "upgrade"`
fix for finding `KM_LINT_CASEDKEYS_MISSING`.

| Field | Type | Notes |
|---|---|---|
| `ir` | `KeyboardIR` | the upgraded IR; spec 111 places it as a precise text edit |
| `set` | cased key set | as above |
| `versionRaised` | `{ from: string \| null, to: "14.0" } \| null` | shown in the preview |
| `comparison` | caps comparison | the fix is offered iff `verdict !== "differs"` |

Accepted / declined status is spec 111's (recorded in the 053 record so it isn't re-offered).

## Touch caps check (derived)

Produced by the FR-003 criterion and `syncTouchCapsLayer` (research R8), per touch platform.

| Field | Type |
|---|---|
| `hasCapsLayer` | boolean |
| `doubleTapToCaps` | boolean (default-layer `K_SHIFT` has a multitap with `nextlayer: "caps"`) |
| `missingUppercase` | `{ lower, upper, keyId }[]` |
| `switchingKeys` | key ids on `caps` with a `nextlayer`, frame keys excluded |
