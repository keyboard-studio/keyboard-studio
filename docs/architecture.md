# Keyboard Studio — architecture & meta-flow

> **The system view — the layer spec-kit omits.** The
> [constitution](../.specify/memory/constitution.md) states the invariant
> *rules*; per-feature specs under [`specs/`](../specs/) describe vertical
> slices. This document is the home for *how the pieces compose into one
> running app*.
>
> **It is an index, not a re-derivation.** Detail lives at the linked homes;
> this file links rather than restates. When a fact here disagrees with
> another document, the constitution's **precedence-by-topic table** decides
> which wins — and the loser is amended, not annotated.
>
> **Vocabulary** follows the
> [keyboard vocabulary glossary](design-notes/keyboard-vocabulary-glossary.md)
> (Keyman's terms: base keyboard, copied keyboard, starting point).

## Three documentation layers

| Layer | Answers | Home | Stability |
|---|---|---|---|
| **Invariants** | "What must always be true?" | [`.specify/memory/constitution.md`](../.specify/memory/constitution.md) — enforced by `/speckit-plan`'s Constitution Check | rarely changes |
| **Architecture / meta-flow** | "How does the whole thing fit together?" | **this file** | changes with major design moves |
| **Features** | "How does subsystem X work, and is it built?" | [`specs/NNN-<slug>/`](../specs/); once shipped, its AS-BUILT in `specs/_archive/` | changes per feature |

A completed or superseded spec whose substance is covered elsewhere is
removed from the live corpus (constitution Art XI). Root [`spec.md`](../spec.md)
is the historical design document: its still-load-bearing sections are cited
from here and from the specs that implement them; it is not an architecture
authority in its own right.

## The system at a glance

```
starting point ──▶ extraction (spec 092) ──▶ proposals ──▶ author decisions
(base | existing        facts from base,       (extracted ≠        │ registry-ordered
 keyboard)              identity, CLDR)         decided)           ▼
                                              DECISION SET (088) ──▶ 053 decision record (audit)
                                                   │ apply (at step completion) / replay (on change)
                                                   ▼
                                     WORKING COPY — KeyboardIR + VirtualFS
                                                   │ mutate() seam · one 300 ms diagnostic cycle
                                                   ▼
                              validate (A/B/A′) ── compile (kmcmplib) ── Layer C lint
                                                   │ projection (never emits raw working IR)
                                                   ▼
                    OUTPUT: .kmp / source .zip / GitHub PR ──▶ criteria page verdict
                                                   ▲   │
                                                   └───┘ test-and-revise loop (094):
                                                         numbered test builds, revise, return

   alongside, always: DRAFT ENVELOPE (persistence) · SURVEY SESSION (where the author is)
```

## The spines

- **Codec spine.** `.kmn`/`.kvks`/`.keyman-touch-layout` parse into a typed
  `KeyboardIR`; everything works on the IR, never on raw text; unmodelled
  constructs survive as opaque `RawKmnFragment` nodes (constitution Art II).
  → spec §5a · `packages/engine/src/codec/`
- **Decision spine (specs 087–093).** The unit of authoring is a **decision**.
  Question and gallery modules declare `provides`/`requires` in the decision
  registry; one topological sort (`orderByDependencies`) derives every order,
  and the wizard's screens are derived from that sort (`deriveScreens`); the
  step manifest is an unordered pool the derived order arranges. A decision
  lands two ways that MUST agree: incremental `apply` when its step completes,
  and **replay** — recalculation of the downstream closure from the checkpoint
  before the first changed decision. Changing the starting point retains all
  decisions and recalculates against the new base (constitution Art X).
  → `packages/studio/src/decisions/`, `steps/manifest.ts`
- **Working copy.** One per project (Track 1 `instantiateFromBase` / Track 2
  `instantiateFromExisting`), recalculated from the decision set as above.
  It is what renders and what output projects from — never what is stored
  directly (see Persistence).
- **Step host.** Every step renders through one generic host — no per-step
  `switch` in the shell. `StepHost` resolves the manifest entry, renders its
  component in the declared layout's chrome, and runs the single completion
  path (`applyStepCompletion → advance`). Flow steps converge on
  `FlowStepHost` + `makeFlowStepComponent` (spec 029).
  → `packages/studio/src/components/StepHost.tsx`, `survey/FlowStepHost.tsx`
- **Location spine (spec 057).** Where the author is — tab, step, question —
  lives in one addressable model (`#route[/step[/question]]`), a pure
  resolver with five closed refusal reasons, and ONE jump primitive that
  either arrives or refuses. Output's revise loop (spec 094) rides the same
  primitive's `returnTo` seam; there is no second router.
  → `packages/studio/src/lib/{location,resolveLocation,jumpToLocation}.ts`

## Persistence — the draft envelope

Drafts are **not** decisions-only (constitution Art III). The saved draft
(local store + debounced cloud sync) is an envelope:

| Slice | Holds | Home |
|---|---|---|
| starting point | base/existing keyboard identity + record | spec 093 |
| `workingCopy` | KeyboardIR + VirtualFS snapshot | draft v2 |
| `decisions` | the spec-088 decision set | `decisionStore` |
| decision record | the spec-053 audit trail | `decisionRecordStore` |
| `surveyAnswers` | answers not (yet) representable as decisions, filtered to decision-provided questions at save | specs 079/088 |
| `testing` | test builds + tester reports (spec 094) | `testingStore` |
| `criteriaRecord` | author attestations + checklist confirmations (spec 084) | `criteriaRecordStore` |

Restore is tolerant-read: unknown or version-mismatched envelopes degrade to
what can be honoured rather than failing the load; a snapshot whose base no
longer matches is discarded, never silently kept. Session position is *not*
in the envelope — it lives in the survey session store (spec 026) and the
location spine. The reconciler for the envelope is
`packages/studio/src/lib/draftPersistence.ts`; it is the most complex file in
the studio precisely because three representations of an author action meet
there, and changes to it need the mapping stated (constitution Art III).

## Extraction — how a base keyboard becomes proposals

Spec 092 runs extraction over the starting point at project open and on
starting-point change: facts and candidates (script, key inventory,
behaviours, conventions) are extracted with base-derived provenance and
surface as **proposals with dispositions** — offered decisions and pre-filled
defaults, provisional until the author confirms them at the step that
presents them (accept, edit, or reject). Once confirmed they are first-class
decisions, visibly attributed to the base; they never take effect silently
and never overwrite an author-made decision (constitution Art X). The Decisions page
(`decisions/DecisionsPage.tsx`) is the audit surface for set + record +
proposals. There is no other "learn from the base" path; the older 055
contribution record is recoverable history shown read-only, not a mechanism.

## Validation & compile

- **Layer A/B/A′** in `engine/src/validator`; **Layer C** is
  `@keymanapp/keyboard-lint`. One 300 ms debounce runs the TS check and the
  WASM `kmcmplib` oracle concurrently (decision D3, scoped to diagnostics —
  constitution Art IV).
- **Compile-gate analyses** ride the preview compile, not the debounce. The
  context-tolerance analysis (spec 078) runs as a follow-on to a ready
  compile; the station first proposes the **spec 086 normalization step**
  (one context-only group that rewrites the text tail into the produced
  form), falling back to the spec 062 per-rule proposal for refused or
  regressed keyboards. The 062 path retires when the 086 contract's criteria
  are met (desktop-engine verification + paste premise + no `regressed`
  corpus keyboard) — until then both paths are live architecture, and 062's
  spec says so. Fixes are computed async, committed sync: into the working IR
  through `applyMutatePatch` at manifest-declared paths, and into the artifact
  as a persisted overlay replayed by `projectWorkingCopyVfs`, because output
  is re-projected from the base and never emits the working IR.
- **Exemplar sourcing is one offline path** (spec 044): `sourceExemplars(bcp47)`
  reads a committed, version-pinned CLDR+SLDR index; all consumers read it,
  none wire their own loader. `null` means "no confident seed", never an
  error; per-character attribution and confidence are surfaced, never
  filtered on.

## Output & delivery

Output projects the working copy (`projectWorkingCopyForOutput`) — download,
source `.zip`, and PR paths emit identical bytes; test builds are a
`.kmp`-only projection with overridden version + label (spec 094). Delivery
to GitHub runs through the OAuth backend (fork + PR); the managed-PR service
is the second, server-side path. Spec 024's single-GitHub-App consolidation
is **not built** — until it is, the dual path described here is the
architecture, and no document may describe the App model as current.

## Criteria subsystem

`packages/contracts/data/criteria.json` — **149 criteria, 19 sections** — is
the single data home; every count stated anywhere is computed from it. Bands:
scaffolder-bake and precertified verdicts are settled at generation time from
the generator's closed manifest (constitution Art X); Layer-C criteria verdict
via their lint codes; yellow/red criteria via author attestation and human
checklist in the `criteriaRecord`. The criteria page (spec 084) evaluates the
studio-built keyboard; the Compare tab evaluates a foreign keyboard, which
can never claim scaffolder-bake or precertification. The §18.6
inventory-sufficiency check builds its inventory in-studio for Adapt cases
(confirmed decisions + template + fallback + author additions/deletions,
baseline = unioned CLDR exemplars per target) and skips only when no
CLDR/SLDR entry exists for the target.

## Content & i18n

Author- and UI-facing strings resolve through generated sidecar catalogs
(`packages/contracts/src/generated/contentI18n.generated.ts`, built from
`content/` by `utilities/content-catalog`); `resolveContentString` is the
single lookup, criteria text included. Adding a content collection is a
catalog change, not a new loader.

## Mobile

The studio adapts its **host layout** to narrow viewports (epic #1853): one
token set, responsive shell/panes/sheets. The typing surface is untouched —
KeymanWeb engine + OSK iframe on every viewport, visibility author-controlled
(hide unmounts, show remounts). Touch *keyboards* are authored as data through
the same decision flow; touch-first *authoring* is out of scope
(constitution Art VII).

## Not yet integrated — named, not implied

Architecture documents what composes. These exist in the repo but do **not**
compose into the live workflow today; no plan may build on them as if they
did (constitution Art XI):

- **Spec 038 adaptation questions** — a complete module (firing evaluator,
  posture step, trust policy) with no production caller; its evidence
  provider is still a mock seam.
- **The demoted Phase A battery** (specs 022/025) — ~30 identity questions
  rendered in the Library as a proposed flow; excluded from every live flow;
  promotion is a paper procedure never yet exercised.
- **062's write-back axis** — persisted and engine-read; no studio surface
  can set it (spec 078 removed the story).
- **Facet index session derivations** — the corpus facet index feeds base
  selection and the marks key-budget; the broader session consumption
  (specs 043/070) is unbuilt.
- **Unbuilt designs** — 077 (base decisions; retired 2026-10-14, absorbed
  by 092), 085 Part B (adaptive placement; retired as superseded), 009
  (flow-map editor; retired), and 024 (GitHub App consolidation; still live
  as the D12 vehicle, not built). Their archived or live text may inform a
  future plan; none of them describes a running system.

## Subsystem composition map

| Subsystem | Spec home | Code home |
|---|---|---|
| Codec / KeyboardIR spine | spec §5a | `packages/engine/src/codec/` |
| Decision registry, derived screens, replay | specs 087/091/093 | `packages/studio/src/decisions/` |
| Decision set + record + trail UI | specs 088/089/053 | `packages/studio/src/decisions/`, `packages/contracts` |
| Extraction & proposals | spec 092 | `packages/studio/src/decisions/extract*`, engine |
| Starting point / gallery modules | specs 090/092 | `packages/studio/src/steps/`, `decisions/gallery*` |
| Working copy + draft envelope | specs 008/093 (as built) | `packages/studio/src/lib/draftPersistence.ts`, engine working-copy |
| Survey session & traversal | spec 026 | `packages/studio/src/survey/`, session stores |
| Step host & flows | specs 028/029 (archived) | `packages/studio/src/components/StepHost.tsx`, `survey/FlowStepHost.tsx` |
| Location | spec 057 (archived) | `packages/studio/src/lib/location*.ts`, `jumpToLocation.ts` |
| Strategy selection | spec 007 | `packages/engine/src/strategy-selector/`, `recognizer/` |
| Facets & corpus index | specs 043/070 | `content/facets/`, `utilities/facet-index/` |
| Pattern schema + library | spec 005 | `packages/contracts/src/pattern.ts`, `packages/engine/src/pattern-*/` |
| Validator (A/B/A′) / Layer C | spec §10 / criteria data | `packages/engine/src/validator/`, `packages/keyboard-lint/` |
| Compiler / simulator | spec §4 | `packages/engine/src/compiler/`, `simulator/` |
| Context tolerance & normalization | specs 078/086/062 | engine `./context-tolerance`, `normalizationStepCache.ts` |
| Exemplars | spec 044 (archived) | `packages/engine/src/character-discovery/exemplarSource.ts` |
| Output / scaffolder / delivery | spec §11/§12 | `packages/engine/src/{output,scaffolder}/`, OAuth backend + managed-PR service |
| Test & revise | spec 094 | `packages/studio/src/output/`, `testingStore` |
| Criteria | spec 084 + criteria data | `packages/contracts/data/criteria.json`, `packages/studio/src/criteria/` |
| Content catalogs / i18n | specs 046/061/080 | `utilities/content-catalog`, `packages/studio/src/lib/contentI18n.ts` |
| Studio SPA | spec §4 | `packages/studio/` |

Retired specs' homes in this map are their AS-BUILT summaries in the spec
folder (full text in `specs/_archive/`).

## Teams

**Engine** owns the SPA shell, scaffolder, compiler service, validator, and
output paths. **Content** owns the pattern library, survey text, gallery
ordering, LLM prompts, and criteria triage (constitution Art VI).

## Conformance gates

Off-track shows up as a failing gate, not a review note.

| Gate | Catches | Fires at |
|---|---|---|
| `pnpm typecheck` + zod drift guards | contract divergence | build / typecheck |
| vitest suites | behaviour regressions | `pnpm test` / CI |
| ESLint flat config + dependency-cruiser | lint defects; package-boundary violations (`keyboard-lint ↛ engine`, `engine ↛ studio`, contracts imports nothing, no runtime circulars) | `pnpm lint` / CI |
| Constitution Check (`/speckit-plan`) | a plan violating a locked invariant | plan time |
| spec-trace | spec/architecture *text* drift | `node utilities/spec-trace check` |
| CODEOWNERS | locked-contract / constitution / architecture changes without architect review | PR |

## Changing this document

Architecture changes land **with** the design move they describe, in the same
PR, and the constitution's governance applies (single-reviewer for prose; the
§18 ritual for locked contracts). A gate that fights a good change is a bug
in the gate: loosen or delete it, consciously, in the same change. Record
*why* in the PR body or the governing spec — there is no separate amendment
ledger.

## Diagrams

- [architecture.svg](architecture.svg) — component view
- [stack.svg](stack.svg) — package/dependency stack
