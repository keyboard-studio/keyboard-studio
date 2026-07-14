# Contract: durable draft persistence

The UI contract for US3 (save/resume). Module: `packages/studio/src/lib/draftPersistence.ts` (new), reusing the serialize helpers in `persistWorkingCopy.ts`.

## Public API

The API is **keyed by `projectKey`** (FR-014). The MVP only ever holds one active project, so a thin single-project facade wraps the keyed core — but the persisted schema and the storage functions are per-project from day one, so a future multi-project index and a per-user server backend (US3a) implement the same interface without a data migration.

```text
const DRAFT_KEY_PREFIX = "ks.draft."   // full key: `${DRAFT_KEY_PREFIX}${projectKey}.v${DRAFT_VERSION}`
const DRAFT_VERSION = 1

draftKey(projectKey: string): string
  - Returns the namespaced, versioned localStorage key for a project.

saveDraft(projectKey: string): void
  - Reads useWorkingCopyStore + useSurveySessionStore state.
  - Guard: no-op if workingCopy.instantiationMode === null || ir === null (VR-2).
  - Serializes to a DurableDraft envelope { version, savedAt, projectKey, displayName, languageTag, workingCopy, traversal }.
  - localStorage.setItem(draftKey(projectKey), JSON.stringify(envelope)) in try/catch (VR-4).

loadDraft(projectKey: string): boolean
  - Reads draftKey(projectKey). Returns false if absent.
  - JSON.parse in try/catch; on failure remove key + return false (VR-3).
  - If version !== DRAFT_VERSION: remove key + return false (VR-1).
  - If workingCopy.instantiationMode === null: return false (VR-2).
  - Rehydrates useWorkingCopyStore (reusing rehydrate logic: Base64 -> VFS, re-derive
    removalCapabilities from baseIr, re-derive session from irAxes+phaseResults).
  - Rehydrates useSurveySessionStore traversal fields (setState).
  - Returns true.

clearDraft(projectKey: string): void
  - localStorage.removeItem(draftKey(projectKey)).

installDraftAutosave(projectKey: string): () => void
  - Subscribes to useWorkingCopyStore + useSurveySessionStore.
  - On change, debounces ~500ms then calls saveDraft(projectKey).
  - Returns an unsubscribe/teardown function.
  - The debounce timer is independent of the 300ms validate cycle (Article IV).

// --- MVP single-project facade (the only surface the MVP UI calls) ---
// The MVP resolves the one active projectKey from the working copy's keyboard id and
// records it (e.g. `ks.draft.active`) so boot can find the single draft without an index.
// A multi-project build (US3a) replaces this pointer with a `ks.draftIndex.v1` enumeration
// over the same per-project records — additive, no envelope change.
resolveActiveProjectKey(): string | null
```

**Forward-compat only (NOT built in the MVP, listed so the seam is deliberate):** a future `listDrafts(): DraftSummary[]` reads the index and returns `{ projectKey, displayName, languageTag, savedAt }` per draft; a server-backed implementation of `save/load/clear(projectKey)` behind an auth check gives authenticated (GitHub/Google) authors cross-device drafts. Neither is in scope for 034.

## Integration points

| Where | Call | Behavior |
|---|---|---|
| App boot (StudioShell mount, before route resolves) | `resolveActiveProjectKey()` then `loadDraft(key)` | If a key resolves and load returns true, the app resumes at `traversal.activeStepId`; else fresh start at `identity`. Runs BEFORE the existing OAuth `rehydrateWorkingCopyFromSession()` so the durable draft is authoritative (research D4). |
| App boot, after first successful instantiation | `installDraftAutosave(activeProjectKey)` | Begins continuous save under the active project's key; teardown on app unmount. |
| Start over (`surveySessionStore.reset()` / WelcomeScreen "start over") | `clearDraft(activeProjectKey)` | Removes that project's key so reset does not immediately re-rehydrate (D5). |
| New instantiation while a different draft exists (VR-5) | `clearDraft(prevKey)` after replace-or-warn | MVP single-project guard: the prior draft is replaced (or the author is warned first), never silently merged. The keyed schema would let both coexist in a future build. |

## Behavioral guarantees (map to acceptance)

- **G-1 (SC-003 / AS-1)**: After a hard reload at any stage past instantiation, `loadDraft()` restores the working copy and re-enters `activeStepId`.
- **G-2 (AS-2)**: Post-restore mutations persist on the same key without corrupting the snapshot (autosave re-serializes the full envelope each write; no partial merge).
- **G-3 (AS-3)**: Start over clears the draft; a subsequent reload starts fresh.
- **G-4 (VR-4)**: A localStorage quota/security failure never throws into the authoring flow.
- **G-5 (Article III)**: Restore patches the single working-copy store; it never constructs a second working copy.

## Non-goals

- Cross-device / server-side draft sync (out of scope for the MVP; the `save/load/clear(projectKey)` interface is designed so a server-backed store can implement it later behind an auth check — US3a / FR-014).
- Multiple **concurrent** drafts and a project switcher (MVP holds one active project; the per-project key scheme leaves the door open, but the index + UI are a follow-on — US3a).
- The guest->account draft-adoption flow when a local guest signs in (deferred to the multi-project follow-on).
- Draft migration across `DRAFT_VERSION` bumps (discard-on-mismatch for MVP).
