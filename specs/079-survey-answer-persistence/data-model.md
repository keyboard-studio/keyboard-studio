# Data model: Survey answers persist per question

**Feature**: [spec.md](spec.md) | **Decisions**: [research.md](research.md) Part II

These types are all studio-local (`packages/studio/src`). None lives in `@keyboard-studio/contracts`,
and none touches the `Pattern` schema, `AnswerType`, `SurveyPhaseResult` or `DecisionPayload`.

## 1. `surveyAnswerStore` (new, R-01)

`stores/surveyAnswerStore.ts`, zustand, persisted as `DurableDraft.surveyAnswers?`.

```ts
type StepId = string;      // manifest step id
type ScreenId = string;    // one author-facing screen = one Next (FR-060)
type AnswerId = string;    // question id, or `<screen>.<subject>` for multi-answer screens
type EvidenceKey = string; // pure fingerprint, see §2

interface SavedAnswer {
  value: SavedValue;                            // same value shapes as SurveyAnswer["value"]
  answerType: AnswerType;                       // re-used from contracts (read-only import)
  origin: "proposed" | "confirmed" | "overturned";
  stage: "draft" | "confirmed";                 // FR-008: a draft until its screen's Next
  evidenceKey: EvidenceKey | null;              // null = the answer depends on no earlier answer
  screenId: ScreenId;
  savedAt: number;                              // for ordering and debugging, never shown
}

type StepStatus =
  | { kind: "in-progress" }
  | { kind: "finished" }
  | { kind: "not-asked"; reason: NotAskedReason; evidenceKey: EvidenceKey }; // FR-065

interface StepAnswers {
  answers: Record<AnswerId, SavedAnswer>;
  position: ScreenId | string | null;           // replaces stepWalkStore.cursors[stepId]
  status: StepStatus;
  lastRecorded: Record<ScreenId, string>;       // hash of the answers at the last Next (FR-040 no-op check)
}

interface SurveyAnswerState {
  steps: Record<StepId, StepAnswers>;
  // actions
  saveAnswer(stepId, answerId, a: Omit<SavedAnswer, "savedAt">): void;  // FR-001, called on every change
  setPosition(stepId, pos): void;                                       // FR-004
  setStatus(stepId, s: StepStatus): void;
  markScreenRecorded(stepId, screenId, hash): void;
  reset(): void;                                                        // start-over / new project only (FR-033)
}
```

Validation rules:

- **FR-001, FR-002.** `saveAnswer` is synchronous and called from the change handler, not from an
  unmount or Next handler. The Rapid Back/Forward edge case is safe by construction.
- **FR-033.** `reset()` is called only by the two existing reset sites:
  - `StudioShell.tsx:1285` (start over)
  - `WelcomeScreen.tsx:333` (new project)

  These are the same sites that reset `stepWalkStore` today. Nothing else may call it, and a test
  asserts the call-site set.
- **FR-032.** Restore is tolerant:
  - An unknown step id is kept verbatim (forward-compat).
  - A malformed answer is dropped. It never falls back to a guessed value.
  - A missing `surveyAnswers` field produces an empty store, so every step shows its proposal.

### Migration from `stepWalkStore`

| Old | New |
|---|---|
| `answerDrafts[stepId][questionId]` | `steps[stepId].answers[questionId]` with `stage: "draft"`, `origin: "confirmed"` (SurveyRunner answers are author-given) |
| `cursors[stepId]` | `steps[stepId].position` |
| `walks` | stays in `stepWalkStore`, unpersisted |

The existing readers go through thin compatibility selectors, so the callers change in one mechanical
pass:

- `peekAnswerDraft`
- `peekStepCursor`
- the footer
- `jumpToLocation`

## 2. Evidence keys and step declarations (R-02, R-12)

`steps/types.ts` additions to `StepBase`:

```ts
interface EvidenceDeclaration {
  /** Plain-language list of shape-determining inputs, for reviewers (FR-011). */
  inputs: readonly string[];
  /** Id of the pure key function in steps/evidence.ts. */
  keyFn: EvidenceKeyFnId;
}

type PersistenceDeclaration =
  | "answer-store" | "phase-b-draft" | "working-copy"
  | { exempt: string };            // FR-007: non-empty written justification

interface StepBase {
  // ...existing
  evidence?: EvidenceDeclaration;
  persistence: PersistenceDeclaration;   // REQUIRED; enforced by manifest test
}
```

`steps/evidence.ts`: pure functions `(state) => EvidenceKey`. They have no side effects and read only
their stores, so they can be unit-tested in isolation.

| keyFn | Reads | Step key | Per-answer key |
|---|---|---|---|
| `alphabet` | `identityResult.bcp47`, `prefill.script`, `prefill.variant`, `localBase.id` | `bcp47\|script\|variant\|baseId` | the step key |
| `marks` | confirmed alphabet | `confirmedAlphabetKey(alphabet)` | attachment `M×B`: `has(M)\|has(B)\|attested(B+M)`; class treatment: class member set; mark treatment: `has(M)` + class id; stack: `has(all members)`; output form: NFC posture id; input order: set of marks with an own key |
| `punctuation` | `resolvedTag`, base id | `resolvedTag\|baseId` | the step key |
| `invisibles` | candidate set | sorted candidate code points | `offered(cp)` |
| `convenience` | surplus candidates, orthography-signal state | `signalState\|sorted surplus` | `offered(candidate)` |

## 3. The re-proposal view (R-03)

```ts
type AnswerView<V> =
  | { state: "current"; value: V; saved: SavedAnswer }
  | { state: "reproposed"; value: V; saved: SavedAnswer; reason: ReproposalReason }
  | { state: "proposed"; value: V };                        // nothing saved yet

interface ReproposalReason {
  code: "evidence-added" | "evidence-removed" | "outside-script" | "now-applicable";
  subject: string;           // e.g. the added character; rendered through the catalog (Content)
  sourceStepId: StepId;      // the step whose answer changed
}

function reconcile<V>(
  saved: SavedAnswer | undefined,
  currentKey: EvidenceKey,
  proposal: V,
  adjust?: (savedValue: V, proposal: V) => V,   // FR-012, e.g. keep explicit input order
): AnswerView<V>;
```

State transitions for one answer:

```
(none) --give--> draft/confirmed-origin --Next--> confirmed
confirmed --upstream key changes--> [view: reproposed]          (saved untouched)
[view: reproposed] --upstream key restored--> [view: current]   (FR-014, no flag)
[view: reproposed] --author confirms/overturns--> confirmed, key re-stamped (flag clears)
any --key's subject gone (question no longer applies)--> [inactive, kept]
```

## 4. Characters step additions (R-07)

`phaseBDraftStore` gains a sticky `alphabetEvidenceKey?: string`.

- It is included in `PhaseBDraftSnapshot` as an optional field.
- `reset()` keeps it, and `resetPhaseBDraftDecisions()` clears it.

The carry-over record is transient and is used only inside `onConfirm`:

```ts
interface AlphabetCarryOver {
  added: string[];     // chars whose provenance is "author"
  removed: string[];   // `rejected`
}
```

## 5. Phase-slot ownership (R-08)

`workingCopyStore` adds the following, persisted in `WorkingCopySnapshot` as an optional field:

```ts
phaseAnswersByStep: Record<PhaseLabel, Record<StepId | "legacy", SurveyAnswer[]>>;
```

Invariant: `phaseResults[p].answers` equals the concatenation of `phaseAnswersByStep[p][s]` over the
steps `s` in manifest order, with `"legacy"` first.

## 6. Work-to-do (R-10) and journey-strip marks (R-11)

```ts
type WorkItem =
  | { kind: "reproposed"; stepId; screenId; answerId; reason: ReproposalReason }
  | { kind: "unassigned"; stepId: "mechanisms" | "touch"; count: number }
  | { kind: "now-applicable"; stepId; reason: ReproposalReason };

function selectWorkToDo(): Record<StepId, WorkItem[]>;   // derived, never persisted

type SectionFill = "full" | "partial" | "none";

type JourneyMark =
  | { tier: "section"; stepId; label; fill: SectionFill; reached: boolean;
      badge?: WorkKind[]; jumpTo: Location }
  | { tier: "question"; stepId; screenId; label; answered: boolean;
      current: boolean; badge?: WorkKind[]; jumpTo: Location };
```

Grouping recorded answers onto screens needs the screen each one was recorded on. That is kept in a
studio-side map, `recordedScreenOf: Record<entryId, ScreenId>`, persisted inside
`surveyAnswers`, so the contracts `DecisionEntry` is untouched. An entry absent from the map (pre-feature
draft) groups onto its step's single fallback screen.
