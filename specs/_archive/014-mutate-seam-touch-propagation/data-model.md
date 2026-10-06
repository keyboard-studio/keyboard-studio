# Phase 1 Data Model: KeyboardIR `mutate` seam + touch propagation

**Feature**: 014-mutate-seam-touch-propagation | **Date**: 2026-06-28

> **RE-VALIDATED — GATE CLEARED (2026-06-28).** The one `packages/contracts` change below (the `TouchKeyIR` provenance field) **landed in PR #822** (`@keyboard-studio/contracts` 0.11.0 → 0.12.0; §18 joint session recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md) — [plan.md](plan.md) gates G-I/G-VI RESOLVED) and was re-validated against the ratified `KeyboardIR` shape on 2026-06-28 (gate G-II RESOLVED). The field as landed (`TouchKeyIR.provenance?: TouchKeyProvenance`, optional/additive, absent ⇒ `"hand-set"`) matches the model below. Studio-side shapes live in the `@keyboard-studio/studio` package and reference, but do not otherwise modify, the locked contracts.

---

## `TouchKeyIR.provenance` — `packages/contracts/src/keyboard-ir.ts` *(EDIT, [LANDED #822])*

A new per-key field promoted from the inert editor-layer reservation onto the contract.

| Field | Type | Notes |
|---|---|---|
| `provenance` | `"base-derived" \| "physical-suggested" \| "hand-set"` | The origin of the key placement; the single source the no-clobber rule reads. |

**Validation / rules**:
- Default for pre-existing / untagged keys = **`hand-set`** (FR-009, conservative — never auto-overwritten).
- MUST survive serialize → deserialize unchanged (FR-010); legacy/missing → `hand-set` on deserialize.
- Mirrored in the zod schema (`packages/contracts/src/schemas.ts`) in the **same change** (Art. I drift guard).
- Delivered in a **`@keyboard-studio/contracts` MAJOR bump** with a §18 coordination note (FR-011).
- `editors/assignLoop/provenance.ts` `TouchKeyProvenance` becomes a **re-export** of this contracts type (single source of truth, FR-008).

**State transitions** (the only provenance transition this feature defines):

```text
base-derived ──┐
               ├─(re-propagation overwrites)──> physical-suggested
physical-suggested ─(author manually edits the key, FR-014)──> hand-set
hand-set ─(never auto-overwritten; no-clobber)──> hand-set
```

---

## `mutate()` — `packages/studio/src/survey/types.ts` *(EDIT: stub → executed)*

The question-module write surface. Today a commented stub; P5 activates it.

| Aspect | Shape |
|---|---|
| Signature | `mutate?(value, ctx): Partial<KeyboardIR>` (pure; returns a patch, does not mutate) |
| Applied by | `steps/reducer.ts` `applyStepCompletion` → `steps/mutateApply.ts` helper |
| Merge semantics | **Path-scoped deep merge** at the module's declared `writes` `IRPath`s only (Q9); siblings preserved |
| Containment | Runtime-asserted to touch only declared `writes`; **fail-fast whole-patch rejection, all builds** (Q11) |
| Idempotency | Re-applying the same `value` against the same IR = no further change (FR-004) |
| Gating | Executes only when the global `mutate` flag is **on** (Q6); off ⇒ no-op, P4b seam |

**Rules**:
- An empty patch `{}` is valid — "this answer changes no IR" — and merges to a no-op (spec Edge Cases).
- Display-only (empty `writes`) modules keep `mutate` absent/no-op (FR-007).

---

## Declared `writes` (`readonly IRPath[]`) — existing P2 field *(reused)*

The typed paths a module is allowed to populate; the containment set the FR-003 assertion checks the patch against. Already typed on `QuestionModule` in `survey/types.ts` (`inputs?`/`writes?: readonly IRPath[]`). **In-scope set = the 5 question modules with non-empty `writes` (the identity/header writers)** plus the carve/add shell, which carries the genuinely strategy-bearing carve/mechanism/touch IR writes from `editors/` (reconciled to 5 — research.md D4).

---

## `MutateFlag` — `packages/studio/src/flags/mutateFlag.ts` *(NEW)*

| Field | Type | Notes |
|---|---|---|
| (global) | `boolean` | Build/deploy-time global. On ⇒ `mutate()` is the IR write path. Off ⇒ P4b declared-only seam, byte-identical output (FR-015/-016). |

**Rules**: not a live in-session toggle (out of scope, spec Edge Cases). Read at the reducer apply site and the re-propagation trigger.

---

## Staleness slice (`staleSteps`) — `packages/studio/src/stores/workingCopyStore.ts` *(reused as-is)*

The P4b recomputable set (reopened root-set `_reopenedRoots` + derived `staleSteps` transitive closure over the writes→inputs graph). P5 **reads** it to drive re-propagation; it adds no second staleness mechanism.

| Field | Type | Notes |
|---|---|---|
| `staleSteps` | `Set<string>` | Derived closure; the set of steps whose derived touch keys re-propagation re-suggests. |

**Rules**: re-propagation runs a **single coalesced pass over the union** of this closure (Q10/FR-013).

---

## `touchSuggest` produced key — `packages/studio/src/editors/touchSuggest/touchSuggest.ts` *(EDIT)*

On (re)propagation, each produced touch key is tagged with its provenance (`physical-suggested` for suggestions; `base-derived` for base-layout-derived) and its producing default (§3.6 defaults-as-data). Re-propagation re-derives **only** non-`hand-set` keys (FR-012).

---

## Retired direct gallery mutations — `packages/studio/src/stores/workingCopyStore.ts` *(EDIT)*

The carve mutators (`deleteNode` / `restoreNode` / `deleteItem` / `restoreItem` / `restoreAll` / `keepAll`) and the add-gallery's direct selected-pattern IR writes — the second prong of the state fork. When the flag is **on**, these are **no longer the IR write path** for in-scope surfaces; carve/add edits flow through `mutate()` (FR-006). They may remain as internal mechanics the `mutate()` patch is derived from, but the IR write itself routes through the reducer.

---

## Real per-spine-prefix validator — `packages/studio/src/dashboard/completeness.ts` C4 *(EDIT)* + `engine/src/validator` *(consume)*

Replaces 012's structural proxy `checkSpinePrefixShippability`. Runs the real Layer-A validator against the `mutate()`-produced working copy at each prefix; **distinct from** inputs-satisfiability (C5); within the single 300 ms debounce / validation path (Art. IV, FR-017/-018). No new entity — a wiring change from proxy to real invocation.
