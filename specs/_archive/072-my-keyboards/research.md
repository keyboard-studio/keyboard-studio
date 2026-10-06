# Phase 0 Research: My Keyboards — per-user multi-project draft + submission list

**Retroactive note.** This research.md does not resolve open unknowns for new work — it records what a live-tree investigation (three parallel read-only sweeps of the client draft engine, the server draft store/schema, and the submission/UI layers, run 2026-08-19) found already decided and shipped, so a future reader does not have to re-derive it. Each entry below maps to a genuine choice embodied in the current code, not a hypothetical alternative being newly weighed.

## R1 — `draftAutosave.ts` was retired into `draftPersistence.ts`, not merely renamed

**Decision (already made, commit `215ede33`, "maint(studio): consolidate draftPersistence.ts and draftAutosave.ts into one draft engine")**: `packages/studio/src/lib/draftAutosave.ts` no longer exists. Its exports moved into `draftPersistence.ts`:
- `startCloudSync` → same name, now in `draftPersistence.ts`.
- `startDraftAutosave` → renamed `installDraftAutosave`.
- `hasPendingProgress` → merged into `hasMeaningfulProgress()`.
- The old `ks.studio.*` keyspace and `StudioDraft` type were retired, not kept as aliases.

**Rationale**: one draft engine, one module, matching this spec's own "Current state (ground truth)" port note pattern (the spec already documents one prior port from `dev`'s `draftAutosave.ts`/`ks.studio.draft` scheme onto `main`'s `draftPersistence.ts`/`ks.draft.*` scheme; this consolidation is a second, later simplification of the same lineage, landing after this spec's authored date).

**Impact on this spec**: none functional — every symbol the spec calls out by name (`startDraftAutosave`/`startCloudSync`) still exists in behavior, under `draftPersistence.ts` (with the one rename above). [plan.md](plan.md)'s Project Structure reflects the corrected module.

## R2 — The multi-project mechanism the spec proposes is already the shipped mechanism

**Decision**: `ks.draftIndex.v1`, `ProjectIndexEntry`, and `reconcileProjectIndex()` — all three of which the spec's body introduces with "(new)" — already exist verbatim in `draftPersistence.ts` / `draftTypes.ts`, with the exact shape the spec's [Data model](spec.md#data-model) section describes (`projectKey, savedAt, activeStepId, label, langTag, status, prUrl`).

**Rationale**: this spec's design was implemented as written (PR #1139, then ported/refined). There was no divergence between the proposed design and what shipped for the core mechanism.

**Bonus mechanism beyond the spec's text**: `reconcileRenamedProjectRows()` + `runBootRenameReconciliation()` — a *destructive* merge for duplicate index rows caused by a mid-session `identity.keyboardId` rename, run once at boot from `main.tsx` rather than from the render-time `listDrafts()` path (an earlier bug had it running from `listDrafts`, fixed by PR #1556). The spec's Edge Cases section explicitly puts re-keying out of scope for the *storage key*; this reconciliation is a display-layer cleanup of duplicate rows, not a re-key, so it does not contradict that non-goal — noted here so a future reader does not mistake it for scope creep.

## R3 — Spec 034 VR-5 retirement: confirmed done, exactly as specified

**Decision**: `replaceActiveDraftIfDifferentProject()` does not exist as a callable function anywhere in the tree. Its former call site inside `StudioShell.tsx`'s `onInstantiate` is gone, replaced by a code comment (`// REMOVED (spec 072 US3a supersedes spec 034 VR-5): ...`) rather than left as dead code — matching this spec's own instruction ("It is not kept as an uncalled export").

**Rationale**: matches [spec.md's "Superseded: spec 034 VR-5"](spec.md#superseded-spec-034-vr-5) section exactly.

## R4 — Submission recording: implemented exactly as specified, response shape confirmed

**Decision**: `ManagedPRSubmitPanel.tsx` does not call `clearDraft()` on success (the spec's stated "current state" for this file is itself stale — that call was already replaced). On success it calls `recordProjectSubmission(result.prUrl, accessToken)`, with a comment citing this spec directly. `api/submit/managed-pr.ts`'s handler passes through `submitManagedPR()`'s result verbatim; `github-pipeline.ts` (not `.js` — the spec omits the extension, immaterial) returns `{ ok: true, data: { prUrl, commitSha } }` — confirms the spec's data-model claim of `{prUrl, commitSha}` exactly.

**Rationale**: no drift here; verified to close out the one open question a prior investigation pass could not confirm (the exact response shape).

## R5 — One genuine documentation drift: the local autosave debounce is 500ms, not 1s

**Finding**: the spec's [Storage keys](spec.md#client-data-model) section states "The debounce constants (1 s local, 20 s cloud) ... are unchanged." The shipped `draftPersistence.ts` defines `AUTOSAVE_DEBOUNCE_MS = 500` (local) and `CLOUD_SYNC_DEBOUNCE_MS = 20_000` (cloud). The cloud figure matches; the local figure does not — it is 500ms, not 1000ms.

**Rationale for treating this as a doc-only note, not a functional gap**: the commit message for `215ede33` (the consolidation that retired `draftAutosave.ts`) itself says the retired module used "its own 1000ms autosave" — i.e. the 1s figure was `draftAutosave.ts`'s value before consolidation, and the surviving engine's value (500ms) is what actually ships today. The spec's claim was accurate against the code at the time it was written and drifted when the consolidation landed after. No behavior needs to change; the spec text is corrected in the retroactive-verify pass (see [tasks.md](tasks.md)).

**Alternatives considered**: none — this is a factual correction, not a design decision.

## R6 — Server-side: `draftId`, `status`, `prUrl`, composite PK — all shipped as designed

**Decision**: `draft-schemas.ts`'s `DraftMetaSchema` already carries `draftId` (with `DEFAULT_DRAFT_ID = "default"` for back-compat), `status: "draft"|"submitted"`, and `prUrl`. `draft-store.ts`'s `DraftStore` interface and `MemoryDraftStore` are `draftId`-scoped (`Map<number, Map<string, StoredDraft>>`), with a `listMeta(userId)` addition. `draft-handlers.ts` implements `getDraftMeta`/`listDrafts`/`getDraftContent`/`putDraft`/`deleteDraft`, each `draftId`-aware with the `DEFAULT_DRAFT_ID` back-compat fallback the spec's [API contract](spec.md#api-contract) section calls for. `api/drafts/index.ts` branches `GET` on `?draftId` presence (absent → list, present → single) exactly as specified. `schema.sql` declares the composite `PRIMARY KEY (github_user_id, draft_id)` from a fresh `CREATE TABLE IF NOT EXISTS`, plus an idempotent `ALTER TABLE` migration block for a pre-existing single-key deployment — matching the spec's proposed migration almost verbatim (the shipped migration is written more defensively — wrapped for safe re-run — than the spec's own "illustrative" DDL sketch, which the spec itself flags as "exact DDL is an implementation task").

**Rationale**: no drift; the server-side design shipped as specified.

**Alternatives considered**: none new — this section records verification, not a fresh decision.
