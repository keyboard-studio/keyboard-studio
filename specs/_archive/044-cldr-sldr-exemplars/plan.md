# Implementation Plan: CLDR/SLDR exemplars

**Branch**: `044-cldr-sldr-exemplars` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/044-cldr-sldr-exemplars/spec.md`

## Summary

Broaden exemplar-character sourcing from "live-fetched CLDR, main tier only" to a
**committed, pinned, offline index over CLDR + SLDR covering all four exemplar tiers**,
and make the sourced alphabet the **proposed starting point** of Phase B "Add your whole
alphabet" instead of an unticked suggestion list.

Three things drive the shape of this plan, all established in
[research.md](research.md):

1. **A live defect (R0)**: three of the four tiers were never read — the code looks for
   `exemplarCharacters-type-auxiliary`, CLDR publishes `auxiliary`. Auxiliary/punctuation/
   numbers have always been empty. This is Foundational work and should ship standalone.
2. **SLDR is the coverage win (R4)**: it carries ~1500 languages CLDR lacks (1813 vs 323
   at language level), ~72% of which have a real `main` set. Precedence only matters for
   the 313 overlapping tags.
3. **The prefill request is a spec delta (R8)**: Phase B calls `resetPhaseBDraft()` and
   starts empty; CLDR arrives as *"tick to add"* chips sourced from a **missing-delta**,
   not the language's alphabet. Proposing it needs new FRs (FR-016/FR-017), flagged rather
   than designed in silently.

Approach: pin CLDR via the npm `cldr-misc-full` package (lockfile integrity = FR-012 for
free) and SLDR via one SHA-pinned tarball; extract both into one deterministic slim index
at prebuild; serve it through a single sourcing path (FR-015) keyed by the existing
`cldrLocaleCandidates` tag minimizer; seed the Phase B draft from it.

## Technical Context

**Language/Version**: TypeScript 5.x, ESM, Node ≥ 22, pnpm 9

**Primary Dependencies**: `cldr-misc-full` @ 48.2.0 (**new**, devDependency, build-time
only); an XML reader for SLDR LDML (**decision deferred to Phase 1** — prefer a
~50-line regex/stream extraction over adding a parser dependency, since only
`<exemplarCharacters>` and `sil:identity/@draft` are read); existing `@keyboard-studio/contracts`,
engine, studio (React 18 + Vite + zustand)

**Storage**: no runtime storage. Build-time: raw sources gitignored under
`packages/engine/data/{cldr,sldr}/`; the derived index is committed under
`packages/engine/src/character-discovery/generated/` (langtags/Glottolog precedent).
Authoring state stays in-memory (Article V)

**Testing**: vitest (engine unit + index fixtures, studio component), Playwright
(`packages/studio/e2e/` walk spec for the prefilled Phase B), plus a
determinism test (regenerate twice → byte-identical, SC-005)

**Target Platform**: browser SPA (studio) + Node (prebuild codegen)

**Project Type**: monorepo — engine library + React SPA + build-time codegen

**Performance Goals**: exemplar lookup O(1) from the committed index, no network at
author time; index load lazy-chunked like `charnames.generated.json` so it never enters
the startup bundle; Phase B prefill must not delay the step's first paint

**Constraints**: offline-capable authoring (FR-011, Article V); deterministic codegen
(FR-013/SC-005); index must stay small enough to lazy-load — target **< 2 MB** for the
committed JSON (`charnames.generated.json` at ~1.4 MB is the accepted precedent, and it
is gitignored+regenerated; if the exemplar index exceeds ~2 MB, treat it the same way)

**Scale/Scope**: ~2726 SLDR tags + ~766 CLDR locales in; expect ~1800–2100 tags with a
usable `main` set out; 4 tiers per tag; touches engine character-discovery, one studio
step, prebuild scripts

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-evaluated post-Phase 1 (both below).*

| Article | Verdict | Notes |
|---|---|---|
| **I. Pattern schema locked** | ✅ PASS | No `Pattern` field touched. `ConfirmedAlphabet` is untouched (047 held this line too); new provenance rides in studio store state + an engine return type, not in a locked contract. |
| **II. KeyboardIR spine** | ✅ PASS | Exemplar sourcing never parses or emits `.kmn`; it feeds the survey. No codec change. |
| **III. Single working copy** | ✅ PASS | Prefill mutates the existing Phase B draft store; no second working copy, no intermediate serialization. |
| **IV. Validator layering / one debounce** | ✅ PASS | No validator or debounce involvement. Index lookup is synchronous and outside the 300 ms cycle. |
| **V. VirtualFS only during authoring** | ✅ PASS — **and improved** | Removes the last author-time network dependency in this path. All fetching moves to prebuild; nothing is written to host disk during authoring. |
| **VI. Team boundaries** | ✅ PASS — **split declared, signed off 2026-07-27** | *Engine* owns fetch/codegen/pin/index + the sourcing service + the store seeding. *Content* owns the proposal copy, the tier section labels, and **the decision of which tiers arrive pre-ticked** (R8). The maintainer signed off on Engine's proposed default (`main` tier only) and the shipped copy. |
| **VII. Out of scope for v1** | ✅ PASS | Enumeration only (FR-014): no wordlists, frequency corpora, or prediction. No LDML *output* — SLDR LDML is read as a data source, which is not "LDML output". |
| **VIII. House conventions** | ✅ PASS | Codegen logs use `[OK]`/`[WARN]`/`[ERROR]`; no emoji; docs use markdown links; no issue numbers in shipped code. |

**Post-Phase 1 re-evaluation**: no new violations. The one flagged item (Article VI
split) was a sign-off requirement, not a violation — no boundary is crossed, both sides
are declared — and the maintainer cleared it on 2026-07-27. See
[Complexity Tracking](#complexity-tracking) for the two items that need explicit user
ratification.

## Project Structure

### Documentation (this feature)

```text
specs/044-cldr-sldr-exemplars/
├── plan.md              # This file
├── research.md          # Phase 0 output — R0..R10, all deferred decisions resolved
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output — reproduce the measurements + validate
├── contracts/
│   ├── exemplar-sourcing.md   # Engine sourcing API + index format
│   └── phase-b-prefill.md     # Studio propose-then-confirm UI contract
├── checklists/
│   └── requirements.md  # existing
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
scripts/
├── cldr-version.json                  # NEW — records the cldr-misc-full version in use
├── sldr-version.json                  # NEW — silnrsi/sldr commit SHA + tarball SHA-256
├── fetch-sldr.ts                      # NEW — one tarball, verify checksum, extract
├── codegen-exemplars.ts               # NEW — CLDR + SLDR -> one slim index (deterministic)
└── langtags-version.json              # existing precedent for both pins

packages/engine/
├── data/
│   ├── cldr/                          # (from node_modules/cldr-misc-full — not copied)
│   └── sldr/                          # NEW — gitignored raw extract
└── src/character-discovery/
    ├── generated/
    │   ├── charnames.generated.json    # existing precedent (gitignored, regenerated)
    │   └── exemplars.generated.json    # NEW — the committed slim index
    ├── cldr.ts                        # tier-key fix (R0); parseUnicodeSet fixes (R9);
    │                                  #   cldrLocaleCandidates -> shared (R10)
    ├── exemplarIndex.ts               # NEW — offline index loader + lookup
    ├── exemplarSource.ts              # NEW — the ONE sourcing path (FR-015), precedence
    ├── characterMap.ts                # consume sourcing path; 4 tiers instead of 2
    └── suggestMissing.ts              # consume sourcing path (no second copy)

packages/studio/src/
├── survey/CharactersStep.tsx          # resetPhaseBDraft() -> seed-from-proposal
├── survey/PhaseB.tsx                  # proposed-vs-authored affordance; tier sections
├── stores/phaseBDraftStore.ts         # provenance + sticky-removal state
└── lib/services.ts                    # swap live loader for index-backed sourcing

utilities/kbgen/INTEGRATION.md         # record the parseUnicodeSet retirement path (R9)
```

**Structure Decision**: no new package. Engine-owned data plumbing extends the existing
`packages/engine/src/character-discovery/` subsystem (which already owns `cldr.ts`,
`characterMap.ts`, `suggestMissing.ts` and the `generated/` codegen precedent); pins and
fetch/codegen scripts join the existing `scripts/` prebuild chain; the studio change is
confined to the Phase B step and its draft store. A separate `@keyboard-studio/exemplars`
package was rejected — it would add a fourth dependency-root edge for one lookup table
that only character-discovery consumes.

## Phase 0 — Research

**Complete** → [research.md](research.md). All spec-deferred decisions resolved (R5
precedence, R6/R7 SLDR quality + private-use, R1/R2 pinning mechanism, R9 parser
consolidation). Three items escalate rather than resolve: R3 (pin vs latest), R8 (the
prefill spec delta), R0 (standalone-fix recommendation).

## Phase 1 — Design & Contracts

**Complete** → [data-model.md](data-model.md),
[contracts/exemplar-sourcing.md](contracts/exemplar-sourcing.md),
[contracts/phase-b-prefill.md](contracts/phase-b-prefill.md),
[quickstart.md](quickstart.md).

Sequencing that `/speckit-tasks` should preserve:

1. **Foundational (blocks everything)** — R0 tier-key fix + R9 parser fixes, with
   fixtures. These are correctness bugs on the current data path; SLDR ingestion built on
   top of a parser that injects `u`,`2`,`0`,`C` into alphabets would ship garbage.
2. **US3 (pin + offline index)** — moved **ahead of** US1/US2 despite being P3 in the
   spec. The index *is* the delivery mechanism for US1/US2 here; building live-fetch SLDR
   first and then re-plumbing it offline would be throwaway work. Flagged as a deliberate
   deviation from spec priority order.
3. **US1 (SLDR coverage)** — precedence + attribution over the built index.
4. **US2 (punctuation/numbers tiers)** — mostly free once R0 lands; the work is the 047
   section wiring.
5. **Prefill (FR-016/017)** — last. The R8 delta is **approved and in the spec**; the
   Content sign-off on tier tick-state (Article VI) was cleared by the maintainer on
   2026-07-27, so no gates remain.

## Complexity Tracking

> Filled because two items need explicit user ratification and one deviates from spec
> priority order.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Pinned index vs #1366's `refs/heads/main`** (R3) — **RATIFIED 2026-07-27: pinned offline index** | FR-011/012/013 + SC-004/005 + Article V require offline, deterministic authoring | "Always fetch latest" was the user's stated preference and is simpler, but makes the seeded alphabet non-reproducible across two builds of the same checkout and puts authoring on the network. Mitigated by bumping to CLDR 48.2.0 now + a one-edit bump path + a CI staleness report. If the user reaffirms latest-always, US3 must be amended out of 044. |
| **New FR-016/FR-017 for prefill** (R8) — **RATIFIED 2026-07-27: spec amended, FR-016/FR-017 + SC-008 now in [spec.md](spec.md)** | The driving request ("pre-fill Phase B") is not in 044's FRs, and its Assumptions say "no new UI surface required" | Doing it without amending the spec would ship unspecified UI behaviour and put the plan out of sync with `spec.md` — exactly what `/speckit-analyze` exists to catch. |
| **US3 built before US1/US2** | The offline index is the substrate US1/US2 deliver through | Following P1→P2→P3 order would mean writing a live SLDR fetch path, then deleting it. |
| **Two build-time acquisition mechanisms** (npm dep for CLDR, tarball for SLDR) | CLDR is npm-published (integrity via lockfile, zero custom code); SLDR is not published and is 67 MB of XML across 2726 files | One uniform custom fetcher for both would reimplement what pnpm already guarantees for CLDR; one uniform npm path is impossible for SLDR. |

## Follow-ups (explicitly not in this plan)

- **Opt-in live refresh** of exemplar data (tracked: keyboard-studio/keyboard-studio#1367) (keeps #1366's loader as an author-initiated
  action) — R3; needs its own provenance UI and risks FR-015's single-path rule.
- **kbgen `parseUnicodeSet` retirement** (tracked: keyboard-studio/keyboard-studio#1368) — R9; blocked on kbgen conforming to
  `packages/contracts` per [INTEGRATION.md](../../utilities/kbgen/INTEGRATION.md).
- **CLDR/SLDR union as an author action** (tracked: keyboard-studio/keyboard-studio#1369) ("also show SLDR's extras" for the 313
  overlapping tags) — representable once per-character attribution exists (R5).
- **Text-sample prefill** (paste/upload a paragraph → propose its characters) — split out
  as [specs/050-text-sample-prefill/](../050-text-sample-prefill/spec.md). It reuses this
  feature's FR-016/FR-016a/FR-017 propose-then-confirm contract and unions with exemplar
  proposals; 044 must therefore not assume exemplars are the only proposal source.
- **`index` tier** (collation headers, tracked: keyboard-studio/keyboard-studio#1370) — out of scope per spec Assumption; revisit only
  if a keyboard-authoring need appears.
