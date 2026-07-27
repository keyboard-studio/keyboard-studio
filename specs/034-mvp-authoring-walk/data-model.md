# Data Model: MVP authoring walk (034)

Phase 1 output. 034 introduces **one** new persisted entity — the durable draft. The working-copy and traversal shapes it wraps already exist; this document defines the draft envelope, what it contains, and its lifecycle. No `Pattern`/`Criterion`/`KeyboardIR` type changes (Constitution Article I/II).

## Entity: DurableDraft

The persisted record that lets an author resume across a reload. The MVP holds **one** active draft, but the record is stored under a **per-project key** (not a single global key) and identifies the project it holds, so a multi-project index and a per-user server backend (spec US3a / FR-014) are an additive change rather than a data migration.

**Storage key**: `ks.draft.<projectKey>.v1` — namespaced and versioned (see Lifecycle). `<projectKey>` is a stable per-project id (derived from the working copy's keyboard id at instantiation). The MVP only ever writes/reads one such key at a time; a future draft *index* (`ks.draftIndex.v1`) enumerating these keys is the follow-on's job, not the MVP's.

**Access contract (FR-014)**: the load/save/clear functions MUST take the `projectKey` as a parameter, even though the MVP always passes the single active project's key. This keeps a future server-backed store (per-user, auth-bound) able to implement the same interface behind an auth check.

**Identity fields (for a future project list)**: each draft record SHOULD carry enough identity — `projectKey`, display name, and BCP47 language/script — to populate a project switcher without deserializing the whole working copy. In the MVP these are written but only used for the "resumed a draft from N minutes ago" affordance.

**Envelope fields**:

| Field | Type | Source | Notes |
|---|---|---|---|
| `version` | `number` | constant `1` | Must equal the app's current draft version or the draft is discarded on boot. |
| `savedAt` | `number` (epoch ms) | write time | Advisory (e.g. "resumed a draft from N minutes ago"); not used for correctness. |
| `projectKey` | `string` | working copy's keyboard id at instantiation | The per-project namespace this record is stored under; enables a future draft index (FR-014). Single-valued in the MVP. |
| `displayName` | `string \| null` | Track-1 `scaffoldSpec` / base identity | Denormalized so a future project list can render without deserializing `workingCopy`. |
| `languageTag` | `string \| null` | `identityResult` (BCP47 language+script) | Same rationale as `displayName`. |
| `workingCopy` | `WorkingCopySnapshot` | reused verbatim from [persistWorkingCopy.ts](../../packages/studio/src/lib/persistWorkingCopy.ts) | Base64 VirtualFS, `Set -> string[]`, derived fields (`removalCapabilities`, `session`) omitted and re-derived on restore. |
| `traversal` | `TraversalSnapshot` | new; from [surveySessionStore.ts](../../packages/studio/src/stores/surveySessionStore.ts) | The "where am I" state. |

### Sub-entity: WorkingCopySnapshot (existing, reused)

Already defined and compiler-enforced against `WorkingCopyData` in `persistWorkingCopy.ts`. Key properties relevant to the draft:
- Binary VirtualFS entries are Base64 (`serializeEntry`/`deserializeEntry`).
- `deletedNodeIds` / `deletedItemIds` / `staleSteps` serialize as `string[]`.
- `removalCapabilities` and `session` are **not stored** — re-derived from `baseIr` and (`irAxes` + `phaseResults`) respectively on restore.
- The `Omit<WorkingCopyData, ...>` construction means a new store data field fails to compile until the snapshot accounts for it — no silent omission.

### Sub-entity: TraversalSnapshot (new)

Serializable subset of `SurveySessionState` (actions excluded — they come from the zustand factory):

| Field | Type | Restore behavior |
|---|---|---|
| `activeStepId` | `ActiveStepId` | The step to re-enter. |
| `history` | `ActiveStepId[]` | Walked path, so Back still works after resume. |
| `identityResult` | `IdentityLiteResult \| null` | Plain JSON. |
| `identityPhaseResult` | `SurveyPhaseResult \| null` | Enables history-pop resume of identity flow. |
| `surveyContext` | `SurveyContext` | Stored (matches current non-derived semantics). |
| `selectedTrack` | `"copy" \| "adapt" \| null` | |
| `scaffoldSpec` | `ScaffoldSpec \| null` | Track-1 project metadata. |
| `localBase` | `BaseKeyboard \| null` | Drives the compile pipeline on resume. |
| `charactersSubStage` | `"prefill" \| "B"` | Re-enter CharactersStep at the right substage. |

All fields are plain JSON-safe values or already-JSON-safe objects — no binary/Set handling needed (unlike the working copy).

## Validation rules

- **VR-1**: On boot, a draft with `version !== 1` is discarded (removed), not migrated.
- **VR-2**: A draft with `workingCopy.instantiationMode === null` is treated as "no real work" and ignored (mirrors the existing snapshot guard — a guest who never picked a keyboard has nothing to resume).
- **VR-3**: A malformed/unparseable draft is removed and treated as absent (no crash; mirrors the existing `JSON.parse` try/catch).
- **VR-4**: On quota failure during write, the write is skipped silently (author keeps working; worst case a reload loses recent edits — never a crash). Mirrors the existing sessionStorage guard.
- **VR-5** *(single-project MVP guard, from spec FR-009 / US3 AC-4)*: Instantiating a new working copy while a draft under a different `projectKey` exists MUST be well-defined — the MVP either replaces the prior draft or warns before overwriting it. It MUST NOT silently merge two projects' state into one record. (A future multi-project build relaxes this to "both coexist under their own keys"; the keyed schema already permits that.)

## State transitions / lifecycle

```text
[no draft]
   | author instantiates a working copy (Track 1 or 2)
   v
[draft written]  --(mutation, debounced ~500ms)-->  [draft updated]
   |                                                      |
   | page reload / tab reopen / OAuth redirect return     |
   v                                                      |
[boot: loadDraft] --valid--> rehydrate both stores --> resume at activeStepId
   |                                                      ^
   | version mismatch / malformed / no instantiation      | continue authoring
   v                                                      |
[draft discarded] --> fresh start at identity ------------+

[start over / reset()] --> clearDraft(projectKey) removes ks.draft.<projectKey>.v1 --> [no draft]
[output complete / publish] --> (draft may be cleared or retained — see contract; MVP retains until start-over)
```

## Relationships

- `DurableDraft.workingCopy` is a serialized projection of `useWorkingCopyStore` state (Constitution Article III — the ONE working copy; restore patches that same store, never creates a second).
- `DurableDraft.traversal` is a serialized projection of `useSurveySessionStore` state.
- The draft is **write-derived** from the two stores and **read-applied** back to them; it is never a third source of truth during a live session — the stores remain authoritative in-memory, the draft is their crash-safe mirror.
- **Forward-compatibility (spec FR-014 / US3a):** a multi-project build adds a `ks.draftIndex.v1` record enumerating the per-project keys and their identity fields, and a per-user server-backed store implementing the same `load/save/clear(projectKey)` contract behind an auth check — neither requires changing the `DurableDraft` envelope defined here. The single-project MVP is the one-element case of that model, not a shape that has to be migrated away from.
