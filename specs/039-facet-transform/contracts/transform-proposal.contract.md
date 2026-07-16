# Contract: Transform Proposal + Propose-then-Confirm Gate

The user-facing contract of spec 039: how a transform is proposed, previewed, partially accepted, and
committed. Every transform passes through this gate — **no transform is silent** (FR-002, §3c).

## Engine surface (`packages/engine/src/facet-transform`)

```text
proposeFacetTransform(
  workingCopyIr: KeyboardIR,
  measurement: SourceFacetMeasurement,     // injected — 037/036 output (research D4)
  request: { facetId, toValue } | { facetId, preset: 'house-style' },
): TransformProposal | TransformRefusal

applyFacetTransform(
  workingCopyIr: KeyboardIR,
  proposal: TransformProposal,             // with user dispositions set
): CommitResult   // { status: 'committed', nextIr, producedSetChanged } | { status: 'commit-failed', failure }
```

- `proposeFacetTransform` is **pure** (no mutation, no I/O); it resolves the transition, builds affected-site
  dispositions from cause tags, resolves the house-target policy if `preset: 'house-style'`, and assembles
  the preview. It returns a `TransformRefusal` (with reason) for gate facets, `undetermined`/below-floor
  measurements, and declined-with-reason pairs (FR-004) — these never reach a `proposed` state.
- `applyFacetTransform` runs the migration on the accepted-site subset → candidate IR → the common gate
  (verify + opaque-diff + compile). It **returns** the next IR; it does not write the store (the studio does,
  via `setWorkingIR`), keeping the engine free of studio state (Article VI) and copy-return (research D2).

## Preview contract (SC-003 — a reviewer predicts the post-commit state from the preview alone)

| `previewKind` | Class | Must show |
|---|---|---|
| `source-diff` | behavior-preserving | per-role before/after spelling; a "behaviour unchanged" assurance backed by the parity check; the invertibility guarantee. |
| `ux-description` | ux-changing | every `namedLoss`; the derived-parameter table to review (e.g. flick directions); every per-site refusal and why; which exception sites are preserved/offered and why. |
| `output-diff` | output-changing | the emitted-byte diff (what output changes); the companion rewrites performed (e.g. backspace rules); explicit confirmation required. |

All previews additionally show `opaqueUntouched` (what the transform could not model, FR-009) and — when the
transition (un)blocks fall-through — `fallThroughImpact.producedCharacterSetDelta` (FR-011).

## Cause-tag disposition (FR-005) — defaults

| causeTag | defaultDisposition | UI framing |
|---|---|---|
| principled-split | `preserve` | named per site; opt-in to convert (SC-004: preserved by default in 100% of fixtures). |
| capacity-forced | `consolidate-offered` | "N sites forced onto another mechanism by capacity — consolidate?"; defaults to **not** consolidate. |
| gap-omission | `fix-offered` | "this looks like an oversight — add it?" (SC-004: surfaced in 100% of fixtures). |
| (none — dominant site) | `apply` | applied unconditionally. |

## Commit gate (FR-007/FR-009/FR-010/FR-013 — sequence)

```text
applyFacetTransform:
  accepted := affectedSites where userDisposition == 'accepted' OR causeTag == undefined
  candidateIr := migrationRule.apply(workingCopyIr, accepted.map(siteId))     # copy-return
  # 1. impact-class verify
  if behavior-preserving:
      assert buildProducedSet(before) == buildProducedSet(candidateIr)         # fast pre-check
      assert simulate(compile(before)) == simulate(compile(candidateIr)) over generateCorpus(before)
      assert assertSemanticEquivalence(before, inverse(candidateIr)).equivalent   # invertibility
  if output-changing:
      produce output-level diff for the preview (output is meant to change)
  # 2. opaque integrity (FR-009)
  assert no RawKmnFragment disappeared/altered unless explicitly confirmed
  # 3. compile-regression gate (FR-010) — one-shot, undebounced (research D8/D9)
  result := await validateWithOracle(emit(candidateIr))   # or compile(candidateVfs, id)
  if result has blocking error:
      return { status: 'commit-failed', failure }          # working copy UNCHANGED
  # 4. commit
  producedSetChanged := buildProducedSet(before) != buildProducedSet(candidateIr)
  return { status: 'committed', nextIr: candidateIr, producedSetChanged }
```

Studio, on `committed`: `setWorkingIR(nextIr)`; if `producedSetChanged`, re-seed discovery axes
(`seedIrAxesFromBaseIr` → `setIrAxes`) so strategy/gallery re-derive (FR-013/D11).

## Invariants asserted by fixture tests

- **SC-001**: every behavior-preserving fixture ⇒ identical `simulate` output over the full corpus, and
  invertible.
- **SC-002**: no fixture transform commits without a `proposal` + explicit confirmation (no code path from
  request to committed that skips `TransformProposal`).
- **SC-003**: the preview names every loss + companion change (asserted structurally).
- **SC-004**: principled-split sites preserved by default in 100% of fixtures; gap-omission surfaced in 100%.
- **SC-005**: no fixture ever drops/alters a `RawKmnFragment`; `opaqueUntouched` reports any un-modellable region.
- **SC-006**: a compile-breaking fixture transform is never committed; working copy unchanged; failure attributed.
