# Implementation Plan: My Keyboards — per-user multi-project draft + submission list

**Branch**: `km/my-keyboards` (original) | **Date**: 2026-08-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/072-my-keyboards/spec.md`

## Summary

**This is a retroactive plan.** The feature this spec describes is already fully implemented and shipped on `main`. It was originally built under `specs/037-my-keyboards/spec.md` (PR #1139, "feat: add 'My keyboards' multi-project draft list (server + client + UI)", merged 2026-07-15), ported onto `main`'s draft engine via PR #1334 (`b6942d06`), and refined by two follow-up fixes: PR #1556 (`2f1da475`, duplicate-row + current-keyboard indicator fixes) and PR #1603 (`35a86df0`, card-name-activates-Resume + failed-resume surfacing). The `037` spec number was later reused by an unrelated feature (`037-facet-classifiers`) during a spec-directory collision cleanup, and this spec's content survives at `072-my-keyboards` — its `.spec-context.json` metadata was never advanced past `specify` even though the code shipped and, in `ManagedPRSubmitPanel.tsx`, cites this spec directly (`specs/072-my-keyboards`, US3a/FR-014).

This plan documents the **as-shipped** architecture against the spec's requirements rather than designing new work — there is no remaining implementation gap in any of the five user stories. One prose-only drift was found (the spec's stated "1s local" autosave debounce; the shipped value is 500ms) and is recorded in [research.md](research.md) as a documentation correction, not a behavior change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — unchanged since this is retroactive verification, not new design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS (non-interference)** | No `Pattern`/`Criterion` field touched; `packages/contracts` untouched by this feature. |
| II. KeyboardIR is the engine spine | **PASS** | No codec/IR parsing or emission touched. A resumed project rehydrates an already-instantiated `KeyboardIR` via the existing `persistWorkingCopy.ts` seam; no new IR mutation path. |
| III. Single persistent working copy | **PASS** | Multiple *drafts* may exist in storage, but exactly one working copy is live in memory per session — `ks.draft.active` names which project the current session belongs to; Resume swaps which draft is loaded, it does not hold two working copies concurrently. |
| IV. Validator layering / one 300ms debounce | **PASS (non-interference)** | No validator or debounce-cycle code touched; the draft autosave debounce (500ms local / 20s cloud) is a distinct, pre-existing timer per [CLAUDE.md](../../CLAUDE.md)'s D3 scope note (persistence timers are out of D3's reach). |
| V. VirtualFS only during authoring | **PASS** | No host-disk writes. Server persistence (Postgres metadata + Blob payload) is the same server-side storage layer the single-draft feature already used; this feature only widens its key from `(github_user_id)` to `(github_user_id, draft_id)`. |
| VI. Team boundaries | **PASS** | Engine-owned: SPA (`ProfileScreen.tsx`, `MyKeyboardsList.tsx`), persistence (`draftPersistence.ts`), and the OAuth backend / output-adjacent `api/drafts/*` service. No content/pattern-library surface touched. |
| VII. Out of scope for v1 | **PASS** | Nothing here touches CJK/Ethiopic/LDML/mobile/touch-authoring/multi-source-merge. |
| VIII. House conventions | **PASS** | Shipped commits follow `<prefix>(<area>): <description>`; no GitHub issue numbers appear in shipped code (the `specs/072-my-keyboards` spec-path citation in `ManagedPRSubmitPanel.tsx` is a spec cross-link, not an issue number). |
| IX. No survey surface outside the manifest | **PASS (non-interference)** | This feature adds no question/step to the survey manifest — "My keyboards" is a profile-page list, not a step. `steps/manifest.ts` is untouched. |

**No violations. Complexity Tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/072-my-keyboards/
├── plan.md              # This file (retroactive)
├── research.md          # Phase 0 output (retroactive — documents decisions already embodied in shipped code)
├── data-model.md         # Phase 1 output (as-shipped shapes)
├── contracts/
│   └── drafts-api.md    # the as-shipped /drafts API contract
├── checklists/
│   └── requirements.md  # from /speckit-specify (pre-existing)
└── tasks.md              # retroactive task checklist, all items verified-done against the live tree
```

### Source Code (repository root, as shipped)

```text
packages/studio/src/
├── components/
│   ├── ProfileScreen.tsx           # renders <MyKeyboardsList /> in place of the old disabled placeholder
│   ├── MyKeyboardsList.tsx         # the full list UI: loading/empty/error states, draft+submitted cards, Resume/Delete/View PR
│   ├── MyKeyboardsList.test.tsx
│   ├── ResumeDraftBanner.tsx       # shares style tokens (BG_CARD/BORDER/TEXT_MAIN/TEXT_DIM/BLUE_ACTION/FONT) + relativeTime.ts with MyKeyboardsList
│   └── ManagedPRSubmitPanel.tsx    # on success, calls recordProjectSubmission() instead of clearDraft()
├── lib/
│   ├── draftPersistence.ts          # the consolidated draft engine (draftAutosave.ts was merged in here, commit 215ede33) —
│   │                                 #   saveDraft, loadDraft, listDrafts, clearDraft, discardActiveDraft,
│   │                                 #   reconcileProjectIndex, resumeProject, deleteProject, recordProjectSubmission,
│   │                                 #   migrateProjectKeyIfChanged, installDraftAutosave, startCloudSync
│   ├── draftTypes.ts                # DurableDraft, ProjectIndexEntry, PENDING_PROJECT_KEY
│   ├── relativeTime.ts              # shared time-ago helper (extracted, used by both ResumeDraftBanner and MyKeyboardsList)
│   ├── serverDraftStore.ts          # client transport: saveServerDraft/loadServerDraftMeta/listServerDrafts/loadServerDraftContent/clearServerDraft, all draftId-scoped
│   ├── persistWorkingCopy.ts        # instantiationMode===null guard (unchanged by this feature, already existed)
│   └── navigate.ts / location.ts    # RouteId "profile", navigateTo (unchanged)
└── StudioShell.tsx                  # onInstantiate no longer calls replaceActiveDraftIfDifferentProject (spec-034 VR-5 retired; see research.md)

utilities/oauth-backend/src/
├── draft-store.ts        # DraftStore interface + MemoryDraftStore, both draftId-scoped; Map<number, Map<string, StoredDraft>>
├── draft-schemas.ts       # DraftMetaSchema with draftId/status/prUrl; DEFAULT_DRAFT_ID="default"; GetDraftListResponseSchema
└── draft-handlers.ts      # getDraftMeta/listDrafts/getDraftContent/putDraft/deleteDraft, all draftId-aware with back-compat default

api/drafts/
├── index.ts               # branches GET on ?draftId presence: absent -> listDrafts, present -> getDraftMeta
├── content.ts              # draftId-scoped content GET (single-draft only, by design)
├── _store.ts               # VercelDraftStore: blobPathname `drafts/${userId}/${draftId}.json`, ON CONFLICT (github_user_id, draft_id)
└── schema.sql               # composite PRIMARY KEY (github_user_id, draft_id); idempotent migration block for pre-existing single-key tables

api/submit/managed-pr.ts   # returns {prUrl, commitSha} (unchanged; confirmed matches spec's data-model claim)
```

**Structure Decision**: Single-package-plus-backend feature, already delivered across `packages/studio/src/{components,lib}`, `utilities/oauth-backend/src`, and `api/drafts/`. No cross-package contract change; `@keyboard-studio/contracts` untouched.
