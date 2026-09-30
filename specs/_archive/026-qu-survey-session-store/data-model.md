# Data Model — surveySessionStore (Stage 3)

The store is in-memory client state (zustand v5). No persistence, no schema, no VFS.

## State slots

| Slot | Type | Initial | Owner note |
|------|------|---------|------------|
| `activeStepId` | `ActiveStepId` | `"identity"` | Current manifest step incl. terminals `"done"`/`"unsupported"`. Type exported from this module (research D-R1). |
| `history` | `readonly ActiveStepId[]` | `[]` | Walked-step stack (D5). Push on `advance`, pop on `popHistory`. Typed to the step union (not bare `string`) so `popHistory` needs no cast. |
| `identityResult` | `IdentityLiteResult \| null` | `null` | Identity-lite output. Also flows to `workingCopyStore` via `setIdentity` (unchanged, outside this store). |
| `surveyContext` | `SurveyContext` | `{}` | Derived from `identityResult` via existing `contextFromIdentity`. Stored, not re-derived, to match today's `useState` semantics. |
| `selectedTrack` | `Track \| null` | `null` | `"copy"` \| `"adapt"`. |
| `scaffoldSpec` | `ScaffoldSpec \| null` | `null` | Track-1 project metadata. |
| `localBase` | `BaseKeyboard \| null` | `null` | Base driving the compile pipeline. |

`ActiveStepId` union (relocated verbatim from `StudioShell.tsx:237`, as shipped):
`"identity" | "choose_base" | "track" | "project_name" | "characters" | "carve" |
"mechanisms" | "touch" | "help" | "done" | "unsupported"`
(the source is the authority; there is no `"package"` member.)

## Actions

| Action | Signature | Semantics |
|--------|-----------|-----------|
| `advance` | `(stepId: ActiveStepId) => void` | `history = [...history, activeStepId]; activeStepId = stepId`. The one forward primitive. |
| `popHistory` | `() => void` | If `history` non-empty: `activeStepId = history.at(-1); history = history.slice(0, -1)`. Else no-op (back disabled at first step). |
| `reset` | `() => void` | Reset every slot to its initial value (start-over). Includes clearing `history`. |
| `setIdentityResult` | `(r: IdentityLiteResult \| null) => void` | Plain setter. |
| `setSurveyContext` | `(c: SurveyContext) => void` | Plain setter. |
| `setSelectedTrack` | `(t: Track \| null) => void` | Plain setter. |
| `setScaffoldSpec` | `(s: ScaffoldSpec \| null) => void` | Plain setter. |
| `setLocalBase` | `(b: BaseKeyboard \| null) => void` | Plain setter. |

## State transitions (traversal)

Forward (via `advance`), representative walks:

- **Copy track:** `identity → choose_base → track → project_name → characters → carve → …`
  History at `characters` top = `project_name`.
- **Adapt track:** `identity → choose_base → track → characters → carve → …`
  (`project_name` skipped). History at `characters` top = `track`.

Back (via `popHistory`): pops the true predecessor. Intra-step `charactersSub` (prefill/B) is
**not** a history entry — it is component-local and toggled by `setCharactersSub` (stays in
`StudioShell.tsx` this stage).

## Invariants

- **I1** `history` is the literal walked path, never manifest order. Back = pop.
- **I2** `reset()` returns the store to a state byte-equal to first construction.
- **I3** After any `advance` then `popHistory`, `activeStepId` equals what it was before the
  `advance` (round-trip), and `history` returns to its prior contents.
- **I4** The store never imports runtime component code (type-only imports for
  survey/hooks types) — depcruise clean.
