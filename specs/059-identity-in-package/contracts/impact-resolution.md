# Contract: on-request impact resolution for pre-instantiation decisions

**Modules**: `packages/studio/src/decisions/{counterfactualProjection,impact,useEntryImpact}.ts`,
`packages/studio/src/lib/serializeWorkingCopy.ts`, `packages/contracts/src/decisionRecord.ts`

How a decision recorded before a working copy existed gets its effect attributed (FR-009…FR-014).

---

## 1. The projection override

`projectWorkingCopyForOutput` gains one optional parameter. Its existing no-argument behaviour is
unchanged, so the zip path, the pull-request path, and `readProjectedFiles` all keep calling it
exactly as they do.

```ts
export interface ProjectForOutputOptions {
  /**
   * Fields merged OVER the store's identity overlay for this call only.
   * A pure input: the store is read as it stands and never written.
   */
  identityOverride?: Partial<IdentityOverlay>;
}

export async function projectWorkingCopyForOutput(
  opts?: ProjectForOutputOptions,
): Promise<ProjectWorkingCopyForOutputResult | null>;
```

This is the seam FR-010 requires: both sides of a counterfactual come from the function that
produces the shipped keyboard, differing only in one input. Building either side from the codec
emitter would satisfy the type and violate SC-005.

---

## 2. The counterfactual

```ts
export interface CounterfactualDeps {
  project: (opts?: ProjectForOutputOptions) => Promise<ProjectWorkingCopyForOutputResult | null>;
}

/**
 * Diff two projections that differ in exactly one identity overlay field.
 * Returns null when no working copy exists — the caller reports the reason.
 */
export async function resolveIdentityCounterfactual(
  field: IdentityOverlayField,
  recordedValue: string | undefined,
  alternativeValue: string | undefined,
  deps: CounterfactualDeps,
): Promise<DecisionImpact | null>;
```

**Behaviour.**
1. Project twice — `{ [field]: alternativeValue }` and `{ [field]: recordedValue }`.
2. Reduce both to `path -> text` baselines through the shared `projectedText.ts` helpers, skipping
   binary entries and normalizing volatile content on **both** sides (FR-013).
3. Diff per path over the union of both baselines; sort the resulting `files` by path.
4. Zero changed files → `{ state: "none" }` — never an empty `"captured"` (the descriptor-identical
   case in the spec's Edge Cases: an author whose language matches the base's).
5. Either projection returning `null` → return `null`.

**Joint attribution (FR-014).** When several identity answers resolved in the same stage and feed
the same overlay field, the resulting impact carries `sharedWith` naming the co-decisions'
`entryId`s, per 055 FR-019. An entry never names itself. The three questions that all feed `bcp47`
(`il_language_code`, `il_language_region`, `il_target_script`) are the case this exists for.

**Never stored.** Both projections are discarded when the call returns.

---

## 3. Resolution order and the new reason

The sync `resolveImpact` keeps its current precedence and is unchanged for stored captures. The new
async resolver applies only where the sync one would have reported unavailability:

| Condition | Result |
|---|---|
| Entry is shed (`impact === null`) | `null` — the row renders its shed notice. Not re-derived. |
| A stored capture exists and no `requestedValue` was passed | returned **verbatim** (SC-005). |
| Entry declares `outputs` and a working copy exists | the counterfactual above. |
| Entry declares `outputs` and **no working copy exists** | `{ state: "unavailable", reason: "no-working-copy-yet" }` |
| Behind a passed lock | `{ state: "unavailable", reason: "lock-gate-dependency" }` (unchanged) |
| Otherwise | `{ state: "unavailable", reason: "no-rederivable-write-path" }` (unchanged) |

`"no-working-copy-yet"` is additive on `ImpactUnavailableReason` and must land with its `z.enum`
mirror in `packages/contracts/src/schemas.ts` in the same commit.

**Three existing consumers switch on the reason and each needs an explicit arm** — none may absorb
the new code into a trailing `else`, which would render it as "no re-derivable write path" and
reintroduce the false message this feature exists to remove:

- `packages/engine/src/decision-audit/prSummary.ts`
- `packages/studio/src/dashboard/FlowGraphView.tsx`
- `packages/studio/src/decisions/DecisionEntryRow.tsx`

---

## 4. On-request discipline (FR-011)

```ts
export function useEntryImpact(
  entry: DecisionEntry,
  expanded: boolean,
): { impact: DecisionImpact | null; pending: boolean };
```

- Nothing runs until `expanded` is true. The trail mounts having computed no impact for any entry —
  FR-011 and 053 FR-010 hold by construction, not by being fast (SC-006).
- There is **no batch form**. The resolver takes one entry; no signature accepts a list.
- A result whose request was superseded by a collapse or a newer expand is discarded, not applied.
- A stored capture resolves synchronously on the first render with `pending: false`, so a
  long-recorded fact never flickers through a pending state.
- Not memoised across collapse/expand: the working copy may have moved on, matching the existing
  comment at `DecisionEntryRow.tsx:474`.

---

## 5. Author-facing strings

New catalog entries in `packages/studio/src/locales/en/messages.json`, following the established
`trail.entry.impact.*` ids (spec 046 id convention: `area ( "." segment )+`, lowercase,
dot-separated segments; an id is a permanent handle).

| Id | English |
|---|---|
| `trail.entry.impact.unavailable.noWorkingCopyYet` | "This decision was made before a keyboard existed to change, so its effect cannot be shown yet. Choose a base keyboard and it will appear here." |
| `trail.entry.impact.pending` | "Working out what this decision changed…" |

Wording is the studio's, per 053 FR-016 — no English prose for the author is introduced in the
engine. The `noWorkingCopyYet` message must read as distinct from both existing unavailability
messages and from `trail.entry.impact.none` ("changed nothing"), which is FR-012's whole
requirement.
