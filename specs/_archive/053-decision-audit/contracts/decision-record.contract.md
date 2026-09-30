# Contract: Decision record — types, serialization, and packaging

The interface consumers and tests code against. Identifiers here are the contract: the exact strings below are what tests select on and what the engine and studio must agree on. Canonical module: `packages/contracts/src/decisionRecord.ts`.

Related: [data-model.md](../data-model.md) for field semantics and validation, [research.md](../research.md) D-01/D-07/D-08/D-10 for why each shape is what it is.

---

## 1. Exported types

All exported from `packages/contracts/src/decisionRecord.ts` and re-exported through `packages/contracts/src/index.ts` via `export * from "./decisionRecord";`.

```ts
export type DecisionEventKind = "survey-answer" | "editor-action";

export type DecisionAgency = "base-derived" | "tool-proposed" | "hand-set";

export type DecisionProposalSource =
  | "langtags"
  | "cldr"
  | "corpus"
  | "axis-fill"
  | "base"
  | "identity"
  | "region"
  | "derived-from-axis";

export interface DecisionProvenance {
  agency: DecisionAgency;
  source?: DecisionProposalSource;
}

export type EditorActionType = "gallery_edit" | "mechanism_edit" | "touch_edit";

export interface EditorActionSummary {
  keysRemoved: number;
  keysAdded: number;
  mechanismsAssigned: number;
  touchKeysAffected: number;
  /** Bounded sample of affected identifiers — never the full list. See §6. */
  sample: readonly string[];
  /** True when `sample` is shorter than the real affected set. */
  sampleTruncated: boolean;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Unified-diff lines, each prefixed " ", "+", or "-". */
  lines: readonly string[];
}

export type ImpactUnavailableReason = "lock-gate-dependency" | "no-rederivable-write-path";

export type DecisionImpact =
  | {
      state: "captured";
      path: string;
      hunks: readonly DiffHunk[];
      magnitude: { added: number; removed: number };
    }
  | { state: "none" }
  | { state: "unavailable"; reason: ImpactUnavailableReason };

export type DecisionPayload =
  | { kind: "survey-answer"; questionId: string; answerType: AnswerType; value: SurveyAnswerValue }
  | { kind: "editor-action"; actionType: EditorActionType; summary: EditorActionSummary };

export interface DecisionEntry {
  entryId: string;
  stepId: string;
  payload: DecisionPayload;
  provenance: DecisionProvenance;
  recordedAt: number;
  supersedes: string | null;
  impact?: DecisionImpact | null;
}

export interface DecisionRecord {
  format: typeof DECISION_RECORD_FORMAT;
  version: number;
  keyboardId: string | null;
  entries: readonly DecisionEntry[];
  truncated: { shedCount: number } | null;
}

export const DECISION_RECORD_FORMAT = "keyboard-studio.decision-record" as const;
export const DECISION_RECORD_VERSION = 1 as const;

/** Placeholder `stepId` for a decision recorded before any step is known (FR-004). */
export const PRE_IDENTITY_STEP_ID = "__pre_identity__" as const;
```

`AnswerType` is imported from `./pattern` and **not redeclared**. `SurveyAnswerValue` resolves to the same per-`answerType` value discipline as `SurveyAnswer` in `./surveyPhaseResult`: `string[]` for `char-list`, `boolean` for `boolean`, `string` for all others.

`kind` is carried on `payload` as the discriminant rather than duplicated on the entry, so the two can never disagree.

### Runtime mirror

`packages/contracts/src/schemas.ts` gains, in the same commit:

- `DecisionRecordSchema`, `DecisionEntrySchema`, `DecisionProvenanceSchema`, `DecisionImpactSchema`, `DiffHunkSchema`, `EditorActionSummarySchema`
- drift guards in the established form, e.g. `type _DecisionEntryGuard = Expect<AssignableTo<z.infer<typeof DecisionEntrySchema>, DecisionEntry>>;`

---

## 2. Engine surface

Exported from `packages/engine/src/decision-audit/index.ts` and re-exported by `packages/engine/src/output/index.ts`.

```ts
/** Unified line diff over two `.kmn` texts. Deterministic for identical inputs. */
export function diffLines(before: string, after: string, contextLines?: number): readonly DiffHunk[];

/** Serialize for the package sidecar. Stable key order — byte-identical for equal input. */
export function serializeDecisionRecord(record: DecisionRecord): string;

/** Version-tolerant read. Never throws; see §5. */
export function parseDecisionRecord(text: string): ParseDecisionRecordResult;

export interface ParseDecisionRecordResult {
  record: DecisionRecord;
  /** Entries dropped because they failed validation. Non-zero means a partial read. */
  droppedCount: number;
  /** True when the input was absent, empty, or unparseable — `record` is then empty. */
  unreadable: boolean;
}

/** Drop `impact` payloads until the serialized record fits `maxBytes`. Never drops entries. */
export function shedDecisionDetail(record: DecisionRecord, maxBytes: number): DecisionRecord;

/** Bounded markdown block for the pull-request body. */
export function buildDecisionSummaryBlock(
  record: DecisionRecord,
  opts?: { maxEntries?: number },
): string;

/** VFS path of the packaged record. */
export const DECISION_RECORD_VFS_PATH = ".studio/decision-record.json" as const;

/** Prefix marking studio metadata: zip-included, PR-excluded. */
export const STUDIO_METADATA_PREFIX = ".studio/" as const;

/** Write the record into the projected VFS at `DECISION_RECORD_VFS_PATH`. Idempotent. */
export function addDecisionRecordSidecar(vfs: VirtualFS, record: DecisionRecord): VirtualFS;
```

`shedDecisionDetail` ordering is fixed and testable: largest serialized `impact` first, ties broken by oldest `recordedAt`. It sets `truncated: { shedCount }` and never touches `entryId`, `payload`, `provenance`, or `supersedes`.

`buildDecisionSummaryBlock` mirrors the existing `buildImportAttributionBlock` in `packages/engine/src/output/import-attribution.ts`: a pure function returning markdown, English, no I/O. It is reviewer-facing, following the established precedent that engine-built PR-body blocks are not localized.

---

## 3. Packaging behaviour

| Guarantee | Mechanism | Verified by |
|---|---|---|
| The record appears in the downloaded `.zip` | `addDecisionRecordSidecar` writes it into the projected VFS; `toZip` includes every VFS entry | zip contains `.studio/decision-record.json` |
| The record never appears in the PR commit tree | `isSidecarPath` in `packages/engine/src/output/sidecar.ts` extended to return `true` for any path starting with `STUDIO_METADATA_PREFIX`; `isSourceFile` already excludes what `isSidecarPath` matches | `isSourceFile(".studio/decision-record.json") === false`; `publishPR` commit tree has no `.studio/` entry |
| Zero files added to the committed keyboard source tree | the above, plus no other new VFS write | committed tree for a session with the feature equals the tree without it (SC-008) |
| Submission instructions do not tell a reviewer to copy it | `NEXT_STEPS.md` in `packages/engine/src/output/zip.ts` names the studio-metadata paths as not-to-be-copied | string assertion on the injected `NEXT_STEPS.md` |

`isSidecarPath`'s existing matches (`.kmn.imported`, `.kmn.imported.sha256`) are unchanged — the prefix test is added, not substituted.

---

## 4. Completed-instance serialization (FR-021)

The record's **schema** is the completed-instance format extended with editor activity; JSON is the surface syntax in the package. A survey-answer entry's `questionId` / `answerType` / `value` are field-compatible with the `answers` array documented in [content/flows/README.md](../../../content/flows/README.md), so rendering a record into that YAML shape is a dump with no transformation.

Two documented departures, each with its reason:

- **No `flow_id`.** Per [specs/032-journey-corpus](../../032-journey-corpus/spec.md) FR-001, `flow_id` names a single flow template, and a per-keyboard record spans the whole manifest spine. The record is keyed by `keyboardId` instead.
- **Editor activity is additive.** `editor-action` entries have no counterpart in the base completed-instance format; they use the 032 FR-002 vocabulary (`gallery_edit`, `mechanism_edit`, `touch_edit`) unchanged.

---

## 5. Version tolerance (SC-009)

`parseDecisionRecord` never throws. Required behaviour:

| Input | Result |
|---|---|
| absent / empty string | `unreadable: true`, empty `record`, `droppedCount: 0` |
| not JSON, or not an object | `unreadable: true`, empty `record` |
| valid shape, unrecognised `version` | entries parsed as far as they validate; `droppedCount` reports the rest |
| some entries invalid | valid entries kept in order, `droppedCount` = number dropped |
| `supersedes` naming a missing `entryId` | link degraded to `null`, entry **kept** |
| duplicate `entryId` | later duplicate dropped, counted in `droppedCount` |

A record this build writes, read by a build without the feature, is an unknown optional field on `DurableDraft` and is ignored. Neither direction prevents the keyboard from loading.

---

## 6. Bounds

| Bound | Value | Why |
|---|---|---|
| PR-summary entries | `maxEntries` default **25**, then a pointer to the packaged record | FR-022 / US2-AS4 — the description stays readable |
| `EditorActionSummary.sample` | at most **12** identifiers, `sampleTruncated` set beyond that | spec Edge Cases — a carve removing hundreds of keys summarizes by count and category |
| diff context | **3** lines per hunk | conventional unified-diff context; keeps hunks reviewable and payloads small |
| shed budget | supplied by the caller from `MAX_CLOUD_DRAFT_BYTES` in `packages/studio/src/lib/draftPersistence.ts` | the threshold already exists; the shed runs before the existing cloud-size check |

Every bound above is stated in the artifact when it bites: an over-bound PR summary says the full detail is in the package, a truncated sample sets `sampleTruncated`, and a shed record sets `truncated`. No bound is silent.
