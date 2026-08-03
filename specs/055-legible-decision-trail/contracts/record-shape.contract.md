# Contract: record shape

The `@keyboard-studio/contracts` surface this feature changes, and the obligations that ride with each change. Extends — never replaces — [specs/053-decision-audit/contracts/decision-record.contract.md](../../053-decision-audit/contracts/decision-record.contract.md).

Identifiers here are **exact**. They are the names consumers and tests code against.

## §1 Canonical location and the drift-guard obligation

| Representation | File | Authority |
|---|---|---|
| TypeScript interface | `packages/contracts/src/decisionRecord.ts` | canonical |
| zod mirror | `packages/contracts/src/schemas.ts` | runtime enforcement |
| drift guards | `packages/contracts/src/schemas.ts:789-793` | machine-enforced link |

**Obligation.** Any change below lands in the interface and its mirror **in the same commit**. The guards fail the build otherwise. This is ordinary drift-guard discipline, not a locked-contract change — see [research.md](../research.md) D-03.

## §2 `EditorActionSummary`

```ts
export interface EditorActionSummary {
  keysRemoved?: number;
  keysAdded?: number;
  mechanismsAssigned?: number;
  touchKeysAffected?: number;
  sample: readonly string[];
  sampleTruncated: boolean;
}
```

Mirror:

```ts
export const EditorActionSummarySchema = z.object({
  keysRemoved: z.number().int().min(0).optional(),
  keysAdded: z.number().int().min(0).optional(),
  mechanismsAssigned: z.number().int().min(0).optional(),
  touchKeysAffected: z.number().int().min(0).optional(),
  sample: z.array(z.string()),
  sampleTruncated: z.boolean(),
});
```

- `.optional()`, **not** `.default(0)`. A default re-introduces the coercion FR-005a forbids, at the one boundary where it would be invisible.
- Absent = not measured. Present `0` = measured, unchanged.
- Field names, `sample`, and `sampleTruncated` are unchanged. `EDITOR_ACTION_SAMPLE_LIMIT` stays `12`.

## §3 `DecisionImpact` and `DecisionFileChange`

```ts
export interface DecisionFileChange {
  path: string;
  hunks: readonly DiffHunk[];
  magnitude: { added: number; removed: number };
}

export type DecisionImpact =
  | {
      state: "captured";
      files: readonly DecisionFileChange[];
      magnitude: { added: number; removed: number };
      sharedWith?: readonly string[];
    }
  | { state: "none" }
  | { state: "unavailable"; reason: ImpactUnavailableReason };
```

- `files` is non-empty. Zero changed files is `{ state: "none" }`.
- `magnitude` on the captured variant is the aggregate over `files`.
- `sharedWith` holds co-decision `entryId`s and never the entry's own id. Absent means the entry is solely responsible.
- `DiffHunk` and `ImpactUnavailableReason` are unchanged. `"lock-gate-dependency"` and `"no-rederivable-write-path"` keep their spellings — they are the discriminants the studio maps to localized prose.
- `DECISION_DIFF_CONTEXT_LINES` stays `3`.

**Migration note.** The removed `path` field has no compatibility shim. A v1 record's captured impact is read through the normalizer in §5, which lifts its single `path`/`hunks`/`magnitude` into a one-element `files` array.

## §4 `DecisionPayload` gains `base-contribution`

```ts
| {
    kind: "base-contribution";
    baseId: string;
    baseDisplayName: string;
    startingKeyCount?: number;
    derivedAxes: readonly string[];
    inheritedMetadata: readonly { field: string; value: string }[];
    instantiationMode: "new-from-base" | "adapt-existing";
  }
```

- `kind` remains the discriminant on `payload`, never duplicated onto `DecisionEntry` (053 contract shape rule 2).
- `instantiationMode`'s two literals are taken verbatim from `workingCopyStore`'s existing `InstantiationMode`; they are not re-spelled here.
- `derivedAxes` and `inheritedMetadata[].field` carry **codes**. Rendering them as prose is the studio's job (FR-008).
- The mirror adds the corresponding member to `DecisionPayloadSchema`'s union.

## §5 Record version and read normalization

```ts
export const DECISION_RECORD_VERSION = 2 as const;
```

A reader encountering `version < 2`:

1. treats every `EditorActionSummary` count as **absent**, whatever value is stored;
2. lifts a captured `DecisionImpact`'s `path` / `hunks` / `magnitude` into a single-element `files` array;
3. reads everything else as-is.

It never writes the normalized form back. Nothing is rewritten, nothing is enriched (out of scope), and no activity is claimed that the earlier build did not measure — which is SC-011 stated as a reader property.

A reader encountering a version it does not recognise still reads what it can and reports the rest as dropped (053 contract §5). This feature does not change that.

## §6 Invariants that must not regress

| Invariant | Source | Why it is listed |
|---|---|---|
| The keyboard artifact is byte-identical with and without this feature | 053 FR-006 / SC-006, this spec FR-007 | The widened capture reads the projection; it must never write to it. |
| Every compared file comes from the projection that produces the shipped keyboard | 053 FR-009 / SC-005, FR-018 | Widening the file set must not widen the *source* of the text. |
| Impact is computed only on request, for one entry | 053 FR-010, FR-021, SC-009 | Grouping (US5) must not compute a group's impacts to render a roll-up. |
| Detail is shed, entries never are | 053 truncation rule, FR-016 | A larger per-entry payload must not be bought by raising the threshold. |
| `gallery_edit` / `mechanism_edit` / `touch_edit` unchanged | 032 FR-002 | The event vocabulary is not forked or renamed. |
| Append-only; supersession appends, never edits | 053 FR-003 / FR-015 | `sharedWith` is written as part of the impact attach, which is already the one write-after-the-fact. |
