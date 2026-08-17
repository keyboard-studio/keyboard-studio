# Data Model: Canonical-equivalence context tolerance

Entities this feature introduces. All are additive contracts in
`packages/contracts/src`; none touch the locked `Pattern` interface.

## `SimulatorContextSeed`

Extends the simulator's public API so a keystroke sequence can start from a
non-empty buffer — the prerequisite the spec's Dependencies section calls out
as blocking every Story 1/2/4 acceptance test.

| Field | Type | Notes |
|---|---|---|
| `text` | `string?` | Initial buffer contents. Default `""` (today's behaviour, unchanged). |
| `caretPos` | `number?` | Default: end of `text`. |
| `pendingDeadkeys` | `DeadkeySnapshot[]?` | Reuses the existing `DeadkeySnapshot` shape (`packages/contracts/src/simulation.ts`) rather than a new type. Inserted after `resetContext()` clears deadkey state, at each snapshot's `position`. |

No state transitions — this is a one-shot input to `simulate()`, not a
persisted entity.

## `ToleranceReport`

The output of the engine-side both-forms simulator comparison
(`packages/engine/src/validator/context-tolerance.ts`). Contracts-only data —
`keyboard-lint` consumes it without importing the engine.

| Field | Type | Notes |
|---|---|---|
| `findings` | `RuleToleranceFinding[]` | One entry per rule the codec could model. |
| `notAnalysedCount` | `number` | Rules skipped because they are opaque (`RawKmnFragment`) — tracked separately so SC-006 ("100% of rules accounted for") is checkable without re-deriving it from `findings`. |

**Validation rule**: `findings.length + notAnalysedCount` MUST equal the
keyboard's total rule count (SC-006). A report failing this invariant is a
bug in the generator, not a valid "clean" result.

## `RuleToleranceFinding`

| Field | Type | Notes |
|---|---|---|
| `ruleId` / `location` | existing IR rule identity + `SourceLocation` | Points at the source rule. |
| `status` | `"tolerant" \| "made-tolerant" \| "not-analysed"` | FR-002/FR-013/SC-006: every rule lands in exactly one bucket, never silently omitted. |
| `failingKeystrokes` | `SimKeyInput[]?` | Present only when a gap was found before a fix was generated — the concrete repro Story 2 requires. |
| `precomposedOutput` / `decomposedOutput` | `string?` | The two observed outputs that differed, named by codepoint + Unicode name per FR-012 (rendering is a studio UI concern, not stored here — this holds the raw codepoints). |
| `notAnalysedReason` | `string?` | Present only when `status === "not-analysed"` — e.g. "rule contains an opaque construct" or "store paired via index() with a different store." |

**State transition**: `tolerant` and `not-analysed` are terminal (diagnosis
only). `not-analysed` (missing inventory / not yet generated) → `made-tolerant`
is the only transition, driven by the generator producing and the author
confirming a `ContextVariant` for that rule. A rule already `tolerant` is
never touched (FR-002's "already handles both forms... MUST report clean").

## `ContextVariant`

A proposed IR mutation — never applied without confirmation (FR-009).

| Field | Type | Notes |
|---|---|---|
| `sourceRuleId` | rule identity | The rule this variant makes tolerant. |
| `kind` | `"added-rule" \| "added-store-members"` | Which mutation shape was used. |
| `generatedMarker` | `string` | The idempotency name-prefix (e.g. `generated_tolerance_*`) checked before insertion — a re-run recognizes and replaces rather than duplicates (FR-011). |
| `precedesFallbackRuleId` | rule identity`?` | Set when the source rule has an existing unaccompanied-key fallback (spec's Acceptance Scenario 3) — the placement invariant `ir-insert.ts` must honor so the tolerant rule wins over the fallback. |

## `WriteBackPolicy`

The author's FR-007 choice. Stored as a new optional field on the existing
`DiscoveryAxisVector` (`packages/contracts/src/axes.ts`), not a new settings
bag — see [research.md](research.md) Phase 0 decisions.

| Field | Type | Notes |
|---|---|---|
| `contextToleranceWriteBack` | `"echo" \| "own-form"?` | Default (absent) behaves as `"echo"` — FR-007's required default. |

**Validation rule**: switching this value MUST NOT change emitted bytes for a
buffer already in the keyboard's own form (FR-007 Acceptance Scenario 3 /
Success Criterion SC-002-style non-regression) — enforced by the pattern-apply
test suite, not by a runtime check.

## Reused, unchanged types

Listed for completeness — these are read, not modified, by this feature:

- `PosturePair` / `InventoryPosture` (`packages/engine/src/marks/nfc-posture-of-inventory.ts`) — the per-pair table input.
- `StoreAnalysis` / `pairSets` / `unresolvedIndexOutputNames` (`packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts`) — store-pairing safety.
- `TransformProposal` / `UserDisposition` / `CommitResult` (`packages/engine/src/facet-transform/types.ts`) — the propose/preview/confirm shell.
- `LintFinding` / `LintSeverity` / `LintCode` (`packages/contracts/src/lintFinding.ts`) — the new check emits these, adding two new warning/hint-only codes, no new severity tier.
