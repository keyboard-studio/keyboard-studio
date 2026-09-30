# Phase 0 Research: KeyboardIR `mutate` seam + touch propagation

**Feature**: 014-mutate-seam-touch-propagation | **Date**: 2026-06-28

> **RE-VALIDATED — GATE CLEARED (2026-06-28).** This feature was DESIGN-ONLY / BLOCKED on the engine mutation contract **#5b/#232** (spec Q1=A, FR-001); that gate **cleared with PR #822** (`@keyboard-studio/contracts` 0.12.0; §18 sign-off recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md)). Every decision below was taken against the anticipated contract shape and has been **re-validated against the ratified `KeyboardIR`/mutation contract on 2026-06-28 (T000)** — the anticipated and ratified shapes match; all 5 in-scope `writes` `IRPath`s resolve with no drift. Plan Constitution Check gate items G-I/G-II/G-VI are RESOLVED.

No `[NEEDS CLARIFICATION]` markers remain — Q1–Q11 were all resolved in [spec.md](spec.md) → Clarifications (approved by Matthew Lee). This document records the design decisions that ground the plan, each derived from the current code (audited 2026-06-28) and the governing plan ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §3.3/§3.5/§3.6/§6/§8).

---

## D1 — `mutate()` shape: pure patch producer, reducer applies (Q3, Q9)

**Decision**: `mutate(value, ctx): Partial<KeyboardIR>` is a **pure** function returning a patch. The §3.4 manifest reducer (`steps/reducer.ts` `applyStepCompletion`) applies it as a **path-scoped deep merge at exactly the module's declared `writes` `IRPath`s** — writing each value to its declared `IRPath` location and preserving sibling nested IR — never a shallow top-level branch replace.

**Rationale**: The audit confirms `mutate?` is today a commented stub in `packages/studio/src/survey/types.ts` (`// mutate?: (value, ctx) => Partial<KeyboardIR>;`) and `inputs`/`writes` are typed `readonly IRPath[]` already powering the dashboard without it. A pure patch keeps editors side-effect-free (matching the P4b reducer design where `applyStepCompletion` is the single side-effect site) and makes the declared-`writes` containment assertion (D2) checkable on the returned patch before it touches the working copy. Path-scoped deep merge is required because a shallow top-level merge of e.g. `touchLayout` would clobber sibling keys/layers and violate both FR-003 and the US2 no-clobber rule; `IRPath` is already a per-path algebra so per-path application is natural.

**Alternatives considered**:
- *`mutate()` mutates the IR in place* — rejected: side-effecting editors break the P4b single-reducer-side-effect model and make containment-assertion + idempotency hard to guarantee.
- *Shallow top-level `{...ir, ...patch}` merge* — rejected by Q9: clobbers sibling nested IR; violates FR-003 / no-clobber.

---

## D2 — Containment assertion: fail-fast whole-patch rejection, all builds (Q11)

**Decision**: Every applied patch is runtime-asserted to touch **only** the module's declared `writes` paths. A patch touching any undeclared path is **rejected whole** (no partial apply), the error is **surfaced** (never swallowed), and the IR is left unchanged for that step — in **all** builds, not a dev-only assert.

**Rationale**: The §8 named risk is a module declaring `writes` that don't match the real IR shape; a dev-only assert would let an out-of-shape write reach the production working copy. FR-003 + Constitution Art. II ("never silently dropped") require fail-fast. The assertion lives in the reducer's apply path (a small `steps/mutateApply.ts` helper), comparing the patch's touched `IRPath`s against the step's declared `writes` set before merging.

**Alternatives considered**:
- *Dev-only `console.assert`* — rejected by Q11: out-of-shape writes reach production.
- *Drop the offending path, merge the rest* — rejected: "rejected, not silently merged"; partial apply leaves a half-written IR.

---

## D3 — Idempotency (Q3/FR-004)

**Decision**: Applying the same `value` against the same IR a second time yields no further IR change.

**Rationale**: Re-answering or replaying a step must not double-write (spec Edge Cases). Because `mutate()` is a pure function of `(value, ctx)` and the merge is path-scoped value-assignment at fixed `IRPath`s, re-application writes the same values to the same locations — a no-op on the second pass. The per-question unit tests (Q7) assert this directly (apply twice, compare byte-identical).

---

## D4 — Scope of converted write surfaces (Q4=B)

**Decision**: Convert **(a)** the carve/add shell — carve remove-mode (`editors/carve/CarveGallery.tsx`) + the add galleries (`editors/assignLoop/`), retiring the direct `workingCopyStore` carve mutators (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll`) and the add-gallery's direct selected-pattern IR writes; this prong carries the genuinely **strategy-bearing** carve/mechanism/touch IR writes, which live in `editors/`, not in the question modules — and **(b)** all **5 question modules with non-empty `writes`** (the identity/header writers). Display-only (empty `writes`) stays no-op; answer-store-only / identity-metadata modules are out of scope.

**Rationale**: This is the second prong of the state fork (the galleries' direct IR mutations). The audit located the carve mutators in `packages/studio/src/stores/workingCopyStore.ts` (lines ~241–257, type union ~408–409). Routing them through `mutate()` collapses the fork into one write path (FR-005/-006).

**Audit note — RESOLVED (count reconciled to 5).** The in-scope non-empty-`writes` set is **5** modules: `a/iso_code.ts` (→ header.bcp47), `a/primary_script.ts` (→ header.bcp47), `a/language_name_english.ts` (→ header.name), `a/pa_copyright_holder.ts` (→ header.copyright), `b/pb_standard_letters.ts` (→ stores). The earlier "8" was a **stale P2-era snapshot**; the current ground truth (after the P3 loader cutover + #781 legacy retirement) is 5. These 5 are identity/header writers. The other candidate identity modules deliberately keep **empty `writes`** because they would either double-write header paths already owned by these canonical writers, or they target `.kps` / identity metadata that lives outside `KeyboardIR`. The genuinely strategy-bearing carve/mechanism/touch IR writes are not question modules at all — they live in the `editors/` carve/add shell (prong (a) above / FR-006a). The dependency gate (G-II) is cleared by #822 (merged to main; contracts 0.12.0); `tasks.md` T000 records the reconciliation as DONE.

**Alternatives considered**: *Convert every module* — rejected by Q4/FR-007: display-only and answer-store-only modules keep empty `writes` and stay no-op.

---

## D5 — Provenance home: on the contract, editor type becomes a re-export (Q2=A)

**Decision**: Add a per-key provenance field to `TouchKeyIR` in `packages/contracts/src/keyboard-ir.ts` (values `base-derived` / `physical-suggested` / `hand-set`), default `hand-set`; mirror it in the zod schema (`schemas.ts`) in the same change (Art. I drift guard); export it from `index.ts`. The editor-layer `editors/assignLoop/provenance.ts` `TouchKeyProvenance` becomes a **re-export** of the contracts type.

**Rationale**: The audit confirms `TouchKeyIR` (`keyboard-ir.ts:65`) has **no** provenance field today, and `editors/assignLoop/provenance.ts` is the inert P4a reservation (its own `TouchKeyProvenance` union + `defaultProvenance()` returning `"hand-set"`), explicitly documented as "declared here so the type exists for P5 to build on." Promoting it onto the contract makes provenance part of the persisted IR so it survives round-trip (D7) and is the single source the no-clobber rule reads. This is the §3.6-anticipated promotion and forces the **contracts MAJOR bump + §18 joint session** (G-I).

**Alternatives considered**:
- *Keep provenance in the editor layer only* — rejected by FR-010: a tag that lives only in the editor or is dropped at serialization makes the first post-reload propagation destructive.
- *Additive-minor contract change* — rejected by FR-011: it's a field on a locked surface; §3.6 mandates a MAJOR bump + joint session.

---

## D6 — Re-propagation: staleSteps-driven, coalesced single pass, no-clobber (Q5, Q10)

**Decision**: On physical-lock break / physical-step completion, run **automatic** re-propagation driven by the P4b `staleSteps` slice (root-set + completeness fixpoint). Re-run `touchSuggest` over **only** `base-derived` / `physical-suggested` keys, overwrite those, **never `hand-set`**. When multiple steps go stale at once, run a **single coalesced pass over the union of the staleness closure** (not per-step). A manual edit to a `physical-suggested` key **promotes it to `hand-set`**.

**Rationale**: The audit confirms the `staleSteps` slice already exists in `workingCopyStore.ts` (root `_reopenedRoots` + derived `staleSteps` set, recomputed transitive closure over the writes→inputs graph). P5 reuses it as-is as the re-propagation driver — no second staleness mechanism. Coalescing matches §3.5 fixpoint-closure semantics and the Art. IV single-validation-path stance, and preserves FR-004 idempotency (each derived key re-suggested at most once per change). The promotion rule (`physical-suggested` → `hand-set` on manual edit) is what keeps cycle-back safe forever after the author touches a key.

**Alternatives considered**:
- *Re-derive the whole touch layer* — rejected: destroys hand-set work and ignores the staleness slice.
- *Re-propagate once per stale step* — rejected by Q10: double-writes derived keys shared across stale steps.

---

## D7 — Provenance survives round-trip (FR-010)

**Decision**: The provenance field serializes and deserializes with `TouchKeyIR` unchanged; untagged/legacy keys deserialize as `hand-set` (FR-009, conservative).

**Rationale**: The no-clobber guarantee is only sound if provenance is durable across save/load (US3 rationale). A new contracts round-trip test (in `packages/contracts`) asserts every tag survives serialize→deserialize; the default-on-missing keeps pre-existing layouts conservatively non-overwritable.

---

## D8 — Global rollback flag (Q6=A)

**Decision**: A single build/deploy-time global flag (`flags/mutateFlag.ts`) gates `mutate()`. On ⇒ `mutate()` is the write path. Off ⇒ the P4b declared-only seam; **zero** `mutate()` executes; output **byte-identical to P4b**. No live in-session toggling (out of scope).

**Rationale**: P5 changes the live IR write path; a single switch back to proven P4b behavior is the runtime safety net (FR-015/-016). "Byte-identical" means produced IR + observable behavior equal P4b's, not source-identical components. The flag is read at the reducer apply site and at the re-propagation trigger.

**Alternatives considered**: *Per-surface flags* — rejected by Q6: one global flag is the single rollback mechanism. *Git-revert as rollback* — rejected: the flag is the runtime rollback, not a code revert.

---

## D9 — Real per-spine-prefix validator (Q8 — resolves 012's deferral)

**Decision**: Replace 012's structural proxy (`dashboard/completeness.ts` C4 `checkSpinePrefixShippability`) with the **real per-spine-prefix validator** (Layer A, `engine/src/validator`) run against the working copy `mutate()` produces at each prefix. Keep shippability **distinct from** inputs-satisfiability (C5), and run it **within** the existing single validation path / 300 ms debounce — no second timer, no parallel path.

**Rationale**: The audit confirms C4 is today a structural lock-consistency proxy (`completeness.ts:311–341`, "structural proxy, NO validator"), explicitly reserving real validation for P5. P5 supplies the executed `mutate()` working copy the validator needs. Art. IV forbids a second debounce/validation path, so the real validator must be invoked from the existing cycle.

**Alternatives considered**: *Keep the proxy* — rejected by FR-017: P5 is where proxy→real graduates. *A new validation debounce for prefixes* — rejected by Art. IV / FR-018.

---

## Cross-cutting: dependency gate (Q1=A, FR-001)

All of the above is **provisional**. `/speckit-plan` and `/speckit-tasks` were run ahead of the gate by author direction so the design is ready when #5b/#232 ratifies. The decisions are typecheck-anchored against the *proposed* contract shape; the ratified shape may shift `writes` paths or the patch type, which is the §8 risk FR-003 guards. Re-run this research's audit (especially D5's `TouchKeyIR` shape) against the ratified contract before executing tasks. (D4's module-count reconciliation is now RESOLVED — the in-scope non-empty-`writes` set is 5.)
