# Mechanism Gallery — workflow diagram

> Flow reference for [MechanismGallery.tsx](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx)
> (Phase C — desktop "add a key" loop). Drawn ahead of the planned
> `AssignLoopShell` extraction so the moving parts are visible before the
> refactor merges. Mermaid (renders in GitHub).

The gallery is two cooperating machines sharing one component:

1. a **left-pane UI state machine** that walks the author character-by-character
   through `lettersToAdd`, recording `MechanismAssignment`s; and
2. a **right-pane compile pipeline** that re-projects the working copy into a
   live OSK preview on every assignment change.

They are coupled only through the working-copy store: the left pane writes
assignments via `recordAssignments`, the store change re-memoizes the
`VfsTransform`, and the pipeline recompiles. There is **one** WASM compile for
Phase C (single-artifact invariant, decision D3) — owned here, not by the outer
`SurveyView`.

---

## 1. Mount, guards & intro (entry lifecycle)

```mermaid
flowchart TD
  A["AddPhysicalAdapter<br/>reads baseKeyboard from store"] --> MG["MechanismGallery mounts"]
  MG --> G1{"selectedBaseKeyboard<br/>=== null?"}
  G1 -- yes --> E1["No-base notice<br/>(Back to choose a starting point)"]
  G1 -- no --> G2{"confirmedInventory<br/>empty?"}
  G2 -- yes --> E2["No-inventory notice<br/>(complete Survey / Phase B)"]
  G2 -- no --> G3{"galleryIntrosSeen.mechanism?"}
  G3 -- "not seen" --> SPL["GalleryIntroSplash<br/>(Desktop welcome)"]
  SPL -- "Get started" --> MARK["markGalleryIntroSeen('mechanism')<br/>showIntro = false"]
  MARK --> LOOP
  G3 -- "seen" --> LOOP["Two-pane layout<br/>(assign loop + live preview)"]

  classDef guard fill:#1a1209,stroke:#d29922,color:#d29922;
  classDef terminal fill:#0d2218,stroke:#238636,color:#56d364;
  class G1,G2,G3 guard;
  class LOOP terminal;
```

`showIntro` seeds from the persisted `galleryIntrosSeen.mechanism` flag, so the
splash shows once per working-copy session and survives navigating to the Touch
gallery and back.

---

## 2. Left pane — the per-character assign loop (UI state machine)

`currentChar` is **explicit state**: applying a method does *not* auto-advance.
Only `Next`, `Skip`, or `Back` move the cursor. Done = every char in
`lettersToAdd` is covered (≥1 assignment) or skipped.

```mermaid
flowchart TD
  START["currentChar effect<br/>(re-runs on lettersToAdd change)"] --> PICK{"prev still in list?"}
  PICK -- yes --> KEEP["keep currentChar"]
  PICK -- no --> FIRST["first uncovered+unskipped<br/>(or lettersToAdd[0], or null)"]
  KEEP --> RENDER
  FIRST --> RENDER

  RENDER{"currentChar === null<br/>&& isDone?"} -- yes --> DONE["'All keys added'<br/>→ Done → onComplete()"]
  RENDER -- no --> CARD["Render char card + method chooser"]

  CARD --> SEED{"kbgen suggestion?<br/>(getSuggestionForChar)"}
  SEED -- "S-01 / S-08, not dismissed" --> SUG["Suggestion row<br/>Accept / Deny"]
  SUG -- Accept --> APPLYSUG["handleSuggestionAccept<br/>build MechanismAssignment<br/>→ recordAssignments"]
  SUG -- Deny --> CHOOSE
  SEED -- "none / dismissed" --> CHOOSE

  CHOOSE["MethodChooser<br/>sequence S-03 · deadkey S-02 · swap S-01 · ralt S-08"] --> DEF{"decomposable<br/>accented char?"}
  DEF -- yes --> PREDK["default method = deadkey<br/>prefill NFD base letter (defaults-first)"]
  DEF -- no --> SEQDEF["default method = sequence"]
  PREDK --> ACT
  SEQDEF --> ACT

  ACT{"author action"}
  CHOOSE --> ACT
  ACT -- "Apply method (canApply)" --> APPLY["handleApply<br/>build MechanismAssignment(scope:individual)<br/>→ recordAssignments → resetMethodState"]
  ACT -- "Next char (canGoNext)" --> NEXT["handleNext<br/>next uncovered+unskipped"]
  ACT -- "Skip" --> SKIP["handleSkip<br/>add to skippedChars + advance"]
  ACT -- "Back (canGoBack)" --> BACK["handleBack<br/>previous char"]

  APPLY --> STAY["stay on currentChar<br/>(multiple methods allowed)"]
  APPLYSUG --> STAY
  STAY --> RENDER
  NEXT --> RENDER
  SKIP --> RENDER
  BACK --> RENDER

  classDef done fill:#0d2218,stroke:#238636,color:#56d364;
  classDef write fill:#0d2840,stroke:#58a6ff,color:#e6edf3;
  class DONE done;
  class APPLY,APPLYSUG,STAY write;
```

Notes that matter for the refactor:

- **`Apply` does not advance.** The author may stack several methods on one
  character; the applied-methods chip row lets them remove individual
  mechanisms. `canGoNext` is gated on `appliedForCurrentChar > 0`.
- **Skipped chars count toward Done** but are not covered — they're tracked in
  local `skippedChars` state, *not* the store, so they reset on remount.
- **`desktopLocked`** disables every write affordance but always leaves
  `onComplete` callable (forward escape after navigating back from Phase E).
- **kbgen suggestion** only fires for S-01 / S-08 candidates; any other
  `strategyId` is dismissed with a warning. No placement map → no row → gallery
  behaves exactly as before.

---

## 3. Right pane — live preview compile pipeline (data flow)

```mermaid
flowchart LR
  subgraph store["workingCopyStore"]
    PR["phaseResults (Phase C assignments)"]
    DEL["deletedNodeIds / deletedItemIds (carve)"]
    ID["identity (displayName / keyboardId / bcp47)"]
    TL["touchLayoutJson"]
  end

  subgraph mg["MechanismGallery"]
    SVC["PatternLibraryService<br/>filterFor + getById<br/>→ patternMap"]
    UWCT["useWorkingCopyTransform({patternMap})<br/>→ memoized VfsTransform"]
    UKA["useKeyboardArtifact<br/>(scaffoldSpec, vfsTransform)"]
  end

  PR --> UWCT
  DEL --> UWCT
  ID --> UWCT
  TL --> UWCT
  SVC --> UWCT
  UWCT --> UKA

  UKA --> PIPE
  subgraph PIPE["run(): fetch → transform → compile"]
    F["fetch/scaffold source → VFS"] --> SNAP["snapshot clean VFS (baseVfsRef)"]
    SNAP --> T["VfsTransform = projectWorkingCopyVfs<br/>0 touch · 1 carve · 2 assignments · 3 identity"]
    T --> C["engine.compile (kmcmplib WASM)<br/>‖ parseKmn + recognizePatterns"]
  end

  C --> STAGE["Stage: ready { jsBlobUrl, compileResult, warnings }"]
  STAGE --> PREV["GalleryPreviewPane (OSK iframe)<br/>onKeyTap → picks swap/ralt/deadkey key"]
  PREV -. "onKeyTap(keyId)" .-> mg

  classDef wasm fill:#2a0a0a,stroke:#f85149,color:#f8d7da;
  class C wasm;
```

The **recompile loop** (no re-fetch) is the part most worth understanding before
the refactor touches it:

```mermaid
sequenceDiagram
  participant U as Author
  participant MG as MechanismGallery (left)
  participant S as workingCopyStore
  participant H as useWorkingCopyTransform
  participant K as useKeyboardArtifact
  participant W as kmcmplib (WASM)

  U->>MG: Apply method / Accept suggestion
  MG->>S: recordAssignments([...prev, assignment])
  S-->>H: phaseResults changed
  H-->>H: re-memoize VfsTransform (assignmentsKey)
  H-->>K: new transform fn reference
  K->>K: transformVersion++ (hasFetched=true)
  K->>K: restore clean VFS snapshot, re-apply transform
  K->>W: runCompile(isFullRun=false) — NO re-fetch, NO onInstantiate
  W-->>K: CompileResult
  K-->>MG: Stage=ready (new jsBlobUrl)
  MG-->>U: OSK preview reflects the added key
```

Why `isFullRun=false` matters: a full run re-fetches the source and fires
`onInstantiate`, which would pop the "switching base keyboards" confirmation on
every keystroke. Assignment changes must take the cheap transform-only path.

---

## 4. Exit / completion

```mermaid
flowchart LR
  DONE["Left pane: Done / All done →"] --> OC["onComplete()"]
  OC --> ADP["AddPhysicalAdapter: onComplete(undefined)"]
  ADP --> RED["manifest reducer (P4b)<br/>fires lockDesktop() on step complete"]
  RED --> NEXT["advance spine → Touch Layout (Phase E)"]
```

Per [registerEditorSteps.ts](../../packages/studio/src/steps/registerEditorSteps.ts),
the `mechanisms` step writes `groups[] / stores[]` (`ADD_GALLERY_WRITES`) and the
reducer fires `lockDesktop()` when it completes. The lock-related side effects
currently noted as living in `StudioShell` migrate into the manifest reducer in
P4b.

---

## Refactor-relevant seams

The file header already flags the planned extraction. The seams a refactor will
cut along:

| Seam | Today | Notes for the refactor |
|------|-------|------------------------|
| **Shell vs behavior** | `MechanismGallery` + `TouchGallery` duplicate a header + left + right two-pane shell | Planned `AssignLoopShell` (surface-parameterized) with `physicalBehavior.ts` / `touchBehavior.ts` (P4a/P4b) |
| **Pattern IDs** | `PATTERN_*` constants must match `content/patterns/` `id:` fields | A mismatch makes `getById()` return undefined → preview never reflects the key. Keep these in lock-step. |
| **Method → assignment** | `handleApply` / `handleSuggestionAccept` each hand-build slotValues per method | Candidate for a shared `buildAssignment(method, ...)` factory — the two paths already drift (suggestion path only covers S-01/S-08) |
| **Compile ownership** | `MechanismGallery` owns the single pipeline; `SurveyView`'s hook stays mounted but unrendered | Single-artifact invariant (D3). Any refactor must not introduce a second concurrent compile. |
| **Skipped state** | local `skippedChars`, not persisted | If the loop becomes resumable, this needs to move to the store. |
