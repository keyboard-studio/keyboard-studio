# Phase 1 Contract: Proposer layer

The proposer layer's interface — what the engine exposes and what the studio consumes. Types are described in [data-model.md](../data-model.md); this file fixes the **function contracts**. All proposers are **pure and deterministic** (same context → same proposals), so they unit-test in isolation.

## Engine: the proposer dispatcher

```ts
// packages/engine/src/proposers/index.ts
import type { SurveyPhase } from "@keyboard-studio/contracts";

export interface ProposerResult {
  proposals: DefaultProposal[];      // one per derivable decision point
  noDefaults: NoDefaultDecision[];   // FR-012 — decision points with no derivable source
  axisFills: AxisFill[];             // FR-011 — origin of each axis this phase fills
}

/** Produce all proposals for a phase from the working-copy context. Pure. */
export function propose(phase: SurveyPhase, ctx: ProposerContext): ProposerResult;
```

`ProposerContext` is assembled by `engine/src/proposers/context.ts` from the working copy (see data-model.md). The dispatcher fans out to the per-phase proposers below.

## Per-phase proposer contracts

Each is a pure function `(ctx) => Partial<ProposerResult>`; the dispatcher merges them.

| Proposer | Phase | Decision points (flags) | Inputs | Provenance source(s) |
|---|---|---|---|---|
| `proposeCopyright` | A | copyright holder (#1) | `authIdentity`, `KeyboardProvenance` rep | `authenticated-identity` → representative → `hinted-prompt` |
| `proposeAutonym` | A | autonym (#7) | `langtags`, CLDR loader | `langtags` → `cldr` → `hinted-prompt` |
| `proposeDisplayName` | A/doc | display name (#3) | scaffolder provisional (English name) | `base`/`derived-from-axis` |
| `proposeCoexisting` | B | coexisting keyboards (#4) | BCP47 region, provenance regions, Q1 | `region` (+ cross-check Q1) |
| `proposeUseCase` | B | primary use case (#8) | A1 scale, region, speaker-count, Q1 | `derived-from-axis` / `region` |
| `proposeReorder` | C′ | reorder pattern (#5) | `deriveScriptPrefill`, §9 family routing | `derived-from-axis` |
| `proposeTouchLayers` | E | touch-layer ids (#6) | modifier→layer mapping | `derived-from-axis` |
| `proposeHelpSkeleton` | F | welcome.htm body (#2) | inventory + `effectiveMechanisms()`, autonym | deterministic (`base`); LLM narrative optional |

### Contract rules (all proposers)

1. **Every proposal carries a `ProvenanceLabel`** (FR-010 / SC-003). A proposer MUST NOT emit a `DefaultProposal` without one.
2. **No derivable value ⇒ a `NoDefaultDecision`, never a silent blank** (FR-012). The pairing is exhaustive: each decision point yields exactly one of {proposal with non-null value, `NoDefaultDecision`}.
3. **Determinism**: no clock, no RNG, no network inside the proposer — network (langtags/CLDR) is resolved into `ctx` beforehand and cached per session.
4. **Non-gating proposers never block** (FR-006): `proposeUseCase` / advisory proposals are seeds only; the audit (below) never raises a blocking finding for them.
5. **No silent override of community convention** (FR-007): `proposeReorder` emits ranked `alternatives` with no forced selection when a family has no convergent reorder.
6. **Keystroke table is never model-generated** (FR-009): `proposeHelpSkeleton` builds the table from `MechanismAssignment` data; only narrative prose may come from `@keyboard-studio/llm`, and its absence skips narrative only.

## FR-013 defaults-audit

```ts
// packages/engine/src/proposers/audit.ts
import type { LintFinding } from "@keyboard-studio/...";

/** At phase exit: flag decision points left blank where a source existed. */
export function auditPhaseDefaults(
  phase: SurveyPhase,
  ctx: ProposerContext,
  answers: SurveyAnswer[],
): LintFinding[];   // severity "warning" — the yellow band; never a new severity/timer
```

- Recomputes `propose(phase, ctx)`, then for each proposal whose value is non-null but whose corresponding answer is blank/absent, emits a `warning` `LintFinding` (FR-013).
- A `NoDefaultDecision` left blank is **not** a defect (it was honestly undefaultable).
- Runs at the phase transition, **outside** the 300 ms debounce cycle (Article IV).

## Studio: consuming proposals

The studio adapter (`packages/studio/src/survey/proposals/`) bridges `ProposerResult` to the existing `SurveyRunner`:

```ts
// Seed channel — REUSES the existing SurveyRunner.getSeedValue contract:
getSeedValue: (questionId) => proposalsById.get(questionId)?.value ?? undefined;

// Provenance channel — NEW sibling lookup rendered by QuestionField (LintChip vocabulary):
getProvenance: (questionId) =>
  proposalsById.get(questionId)?.provenance
  ?? noDefaultsById.get(questionId)?.hintedPrompt;
```

- `getSeedValue` preserves "Default once, then user owns it" — no change to `SurveyRunner`.
- `QuestionField.tsx` renders the provenance label/chip beside the field at the `info`/`hint` band; `NoDefaultDecision` renders its `hintedPrompt` as placeholder text, never an empty box.
- Phase F (`PhaseF.tsx`) renders `proposeHelpSkeleton` output as an editable draft (skeleton always present; narrative present only if an LLM backend is configured).

## langtags loader contract

```ts
// packages/engine/src/langtags/index.ts
export interface LangtagsEntry { localname?: string; localnames?: string[]; }
export function resolveLangtags(bcp47: string): LangtagsEntry | undefined;
```

Backed by a version pinned in `scripts/langtags-version.json` (SHA-256), fetched at `prebuild` like CLDR/kmcmplib. Offline-deterministic at authoring time (Article V).
