# Research: MVP authoring walk (034)

Phase 0 output. Resolves the NEEDS CLARIFICATION items and records the key decisions that shape the Phase 1 design.

## D1 — Durable draft: reuse the existing serializer, add a localStorage path

**Decision**: Extend, do not rewrite. [persistWorkingCopy.ts](../../packages/studio/src/lib/persistWorkingCopy.ts) already contains a complete, compiler-enforced `WorkingCopySnapshot` type with Base64 VirtualFS encoding, `Set -> string[]` handling, and a derived-field re-derivation policy (`removalCapabilities`, `session` are recomputed, never stored). The durable-draft feature reuses `serializeEntry`/`deserializeEntry` and the snapshot shape verbatim, adding a **localStorage** target alongside the existing sessionStorage OAuth snapshot.

**Rationale**: The hard part (round-tripping a VirtualFS + IR + Sets through JSON, and not persisting derived fields so they can't drift) is already solved and tested. Rewriting it would risk divergence between the OAuth-redirect path and the reload path.

**Alternatives considered**:
- *Zustand `persist` middleware* — rejected: it persists a single store, but the draft must span **two** stores (working copy + traversal), and the working copy needs custom VirtualFS/Set/derived-field handling the middleware's default JSON serializer would corrupt (the module header documents exactly this corruption for `Uint8Array`).
- *IndexedDB* — rejected for MVP: unnecessary for a single bounded snapshot; localStorage matches the existing sessionStorage idiom and quota is sufficient for one keyboard.

## D2 — Persist traversal state too (the "current step")

**Decision**: The draft persists **both** `WorkingCopyData` (existing snapshot) **and** the `surveySessionStore` traversal state that determines "where the author is": `activeStepId`, `history`, `identityResult`, `identityPhaseResult`, `surveyContext`, `selectedTrack`, `scaffoldSpec`, `localBase`, `charactersSubStage`. Restoration re-enters the same step with the walked history intact.

**Rationale**: FR-009/SC-003 require restoring the working copy **and current step**. Today `surveySessionStore` explicitly states "No persistence"; the OAuth snapshot restores the working copy but not the step, so a reload would drop the author back at `identity` even with the IR intact. Persisting traversal closes SC-003.

**Constraint**: `surveySessionStore` keeps its type-only import discipline and worker boundary (no WASM import). The serialize/restore functions live in `draftPersistence.ts`, not in the store, so the store's import graph is unchanged; the store only gains a full-state getter/setter usage via `getState()`/`setState()` (already how `persistWorkingCopy` patches the working-copy store).

## D3 — Write cadence: debounced store subscription, independent of the 300 ms validate cycle

**Decision**: Draft writes fire from a **store subscription** debounced on its own short timer (~500 ms after the last mutation), serializing and calling `localStorage.setItem`. This is a persistence timer, explicitly **separate** from and never coupled to the single 300 ms validation debounce (Constitution Article IV).

**Rationale**: Article IV forbids a second *validation* timer or a parallel *validation* path. A persistence debounce is neither — it does no validation and does not touch the TS-check/WASM oracle. Keeping it separate and clearly named (`draftPersistence`) preserves the invariant while giving continuous save.

**Alternatives considered**:
- *Write on every mutation (no debounce)* — rejected: serializing a VirtualFS on every keystroke-level mutation is wasteful; 500 ms coalescing is imperceptible for crash-safety.
- *Write only on step advance* — rejected: loses in-step edits (e.g. mid-carve) on a reload.

## D4 — Rehydrate on boot; subsume the OAuth snapshot

**Decision**: On app boot, if a valid durable draft exists in localStorage, rehydrate both stores from it. The existing sessionStorage OAuth-redirect snapshot becomes redundant for state survival and can be treated as a special case of the same draft (the OAuth return simply finds the localStorage draft already present). Keep the sessionStorage path working during transition; the localStorage draft is authoritative when both exist.

**Rationale**: 034's edge-case note says the localStorage persistence "should subsume" the OAuth sessionStorage snapshot. One durable draft that survives both reloads and redirects is simpler than two parallel mechanisms.

**Migration/versioning**: The draft is stored under a **namespaced, versioned key** (`ks.draft.<projectKey>.v1` — per-project, not one global key, per FR-014). On boot, a draft whose version does not match the current app's is discarded (not migrated) — an MVP-appropriate policy that prevents a stale-shape draft from rehydrating into a changed store. `WorkingCopySnapshot`'s compiler-enforced completeness already guards field drift within a version. The per-project namespace is what lets a multi-project follow-on (US3a) add a draft index over the same records without a data migration.

## D5 — "Start over" clears the draft

**Decision**: `reset()` (start-over) MUST call `clearDraft()` (remove the localStorage key) in addition to resetting the stores, so a clean start does not immediately re-rehydrate the old draft.

## D6 — Track 2 real-engine verification (US1)

**Decision**: US1 acceptance runs against the **real engine**, not the mock. [steps/reducer.ts](../../packages/studio/src/steps/reducer.ts) skips Track 2 instantiation with a `console.warn` when IR/VFS are null (mock engine); the E2E/integration verification for Track 2 must use the real engine so "adapt" is actually exercised.

## D7 — Deferred decisions (recorded, not resolved here)

- **FR-006 explicit desktop-lock affordance** — the current auto-lock on mechanism completion is functionally correct; whether a *visible* lock action is required is a UX decision. NOT implemented in this plan.
- **FR-013 Arabic/Hebrew/Devanagari** — pass the gate but have no script-specific RTL/stacking/reorder logic. NOT an acceptance target in this plan; the MVP floor is the five proven alphabetic scripts (FR-011). Resolving this is 034's Open Question and, if YES, a follow-up spec.

## Summary of decisions

| ID | Decision |
|---|---|
| D1 | Reuse `persistWorkingCopy` serializer; add localStorage target |
| D2 | Persist traversal state (current step + walked history) alongside working copy |
| D3 | Debounced store-subscription write, separate from the 300 ms validate cycle |
| D4 | Rehydrate on boot; versioned key; discard on version mismatch; subsume OAuth snapshot |
| D5 | Start-over clears the draft |
| D6 | Verify Track 2 against the real engine |
| D7 | FR-006 and FR-013 deferred — not implemented in this plan |
