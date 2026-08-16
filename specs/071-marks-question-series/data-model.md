# Data Model: Marks Question Series (046)

Entities this feature introduces or reshapes. Canonical homes: contracts types in
`packages/contracts/src/confirmedAlphabet.ts` (new module, zod-mirrored in `schemas.ts`);
engine-computed structures in `packages/engine/src/marks/`. All contract additions are
additive optional fields — no locked-type edits.

## Store entities (canonical, mental-model-free)

### ConfirmedAlphabet
The three-store replacement for the flat inventory. Held per phase result and merged onto
the session; the legacy `confirmedInventory: string[]` is derived from it (NFC graphemes,
first-appearance order), never independently edited.

| Field | Type | Notes |
|---|---|---|
| `bases` | `string[]` | Base letters (NFC, single grapheme each). Deduped, first-appearance order. |
| `marks` | `string[]` | Marks as lone combining characters (rendered on U+25CC carriers in UI). Deduped. |
| `attestedStacks` | `AttestedStack[]` | Every attested base+marks combination, order-preserving. |
| `declaredRoles` | `Record<string, DeclaredRole>` | PUA-only designer classifications, keyed by character. |

Validation: every `AttestedStack.base` must appear in `bases`; every mark in a stack must
appear in `marks`; a PUA character may not appear in `bases`/`marks` without a
`declaredRoles` entry (FR-004). A base never attested with any mark simply has no stacks
(edge case: it never appears in any station).

### AttestedStack
| Field | Type | Notes |
|---|---|---|
| `base` | `string` | Exactly one base letter. |
| `marks` | `string[]` | One or more marks, **order preserved** (closest-to-base first), NFD-decomposed internally (FR-001). |

Two stacks with the same marks in different orders are distinct.

### DeclaredRole
`"letter" | "mark"` — permanent, designer-owned; classifiers read it first and fall back
to Unicode properties only when absent (never the sole classifier for PUA).

## Decision entities (series output, session state)

### AttachmentDecision (per mark)
| Field | Type | Notes |
|---|---|---|
| `mark` | `string` | |
| `states` | `Record<string, AttachmentState>` | Keyed by base letter. |

`AttachmentState = "attested" | "plausible-accepted" | "blocked"`. Defaults: attested
from `attestedStacks` (pre-checked); plausible from mark-class heuristics (proposed,
unchecked); everything else blocked (FR-006/FR-007). Auto-confirmed summary state when
exactly one attested base and no plausible additions (FR-008).

### MarkClass
| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable within a session. |
| `label` | `string` | Plain-language (e.g. "quality accents", "tone marks"). |
| `marks` | `string[]` | Members, grouped by attachment-set similarity + linguistic function (FR-010). |

### MentalModelDecision (per mark-class, with overrides)
| Field | Type | Notes |
|---|---|---|
| `classId` | `string` | |
| `answer` | `"own-letter" \| "letter-plus-mark" \| "mixed"` | `"mixed"` splits per-mark/per-pair (edge case: recorded as a per-pair split). |
| `overrides` | per-mark / per-pair map | Present only on split. |
| `prefill` | `MentalModelPrefill` | The FR-011 signals that produced the recommendation (productivity spread, base-mechanism signal, spare-key affordability + reason). |

### MarkInputOrderDecision
`"prefix" | "postfix"` per letter-plus-mark mark-class; prefilled from
`detectMarkInputOrderFromImport` when available (FR-012). Content relocated verbatim from
`pb_mark_input_order`.

### OutputFormDecision (per keyboard — the uniformity invariant)
| Field | Type | Notes |
|---|---|---|
| `form` | `"ready-made" \| "base-plus-mark"` | Exactly one value per keyboard, never per-pair (FR-013). |
| `presentedAs` | `"notice" \| "open-choice"` | Which FR-014/015/016 branch fired. |
| `migrationNeeded` | `boolean` | Recorded consequence when base content uses the other form (R10) — not acted on here. |

### StackingDecision
| Field | Type | Notes |
|---|---|---|
| `allowed` | `boolean` | Asked only on evidence (attested ≥2-mark stack, or overlapping plausible sets) — otherwise silently `false` (FR-018). |
| `confirmedStacks` | `AttestedStack[]` | Explicit designer-confirmed list; never inferred from attachment rows (FR-019). |

## Computed entities (engine, derived — never stored as answers)

### PosturePair (from `nfc-posture-of-inventory`)
Per attested/accepted stack: `{ stack, hasReadyMadeForm: boolean, readyMadeForm?: string }`.
One computed table feeds the posture facet, the S4 proposal, the unwrap stores, and the
blocking rules (R5).

### MarksGateResult (S0 — computed, never rendered)
`{ skip: boolean; classes: MarkClass[]; attachmentProposals; posture: PosturePair[];
mentalModelPrefills }` — `skip` is true iff `marks` is empty (FR-005). Recomputed whenever
the confirmed alphabet changes; a change that invalidates a confirmed decision marks the
affected station(s) requiring reconfirmation (FR-023), tracked as a per-station
`stale: boolean` on the series state.

### PlacementWorklist (the handoff, FR-020)
| Field | Type | Notes |
|---|---|---|
| `ownLetterUnits` | `string[]` | Whole units needing their own key placement. |
| `markUnits` | `{ mark: string; inputOrder: "prefix" \| "postfix" }[]` | Productive mark keys needing placement + attach behavior. |
| `blockedCombinations` | `AttestedStack[]`-shaped pairs | Must be unreachable by ordinary typing (FR-021). |

Invariant (SC-007): every base and every mark of the confirmed alphabet is accounted for
exactly once across the classification; empty worklist on skip (Story 7 AC2). Enters
`MechanismGallery` as an optional typed prop (the `placementMap` seam pattern); absent ⇒
today's flat-inventory flow.

## State transitions

```
picker pick (whole grapheme) ──decompose──▶ bases/marks/attestedStacks updated (visible)
picker pick (PUA)            ──role prompt─▶ declaredRoles + bases|marks
alphabet confirmed ──S0 gate──▶ skip ▶ empty PlacementWorklist ▶ mechanisms
                              └▶ run  ▶ S1 → S2 → [S3] → S4 → [S5] → PlacementWorklist ▶ mechanisms
alphabet edited after series ──evidence changed?──▶ affected stations flagged stale (FR-023)
```
