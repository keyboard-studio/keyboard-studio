# Spec 044 CLDR/SLDR exemplars: as built

**Status:** Retired 2026-09-29. Shipped in PR #1371 (squash `fabbcbd2`, 2026-07-27). Tasks: 61/61 complete.
**Full docs:** [specs/_archive/044-cldr-sldr-exemplars/](../_archive/044-cldr-sldr-exemplars/) (spec, plan, tasks, research R0-R10, data-model, contracts, HANDOFF, checklists). Not read by default.
**Pinned here:** none

## What shipped
- Exemplar characters come from a committed, pinned, offline index over CLDR + SLDR, covering all four tiers (main, auxiliary, punctuation, numbers). Previously three tiers were silently empty (the code looked for `exemplarCharacters-type-auxiliary`; CLDR publishes `auxiliary`).
- One sourcing path (`sourceExemplars`) feeds `characterMap.ts`, `suggestMissing.ts` and studio `services.ts`.
- Phase B "Add your whole alphabet" now starts from the sourced alphabet as a proposal (accept scope: `main` tier only; other tiers reach the author through spec 047 sections), with per-working-copy reject / decline state.
- SLDR adds ~1500 languages CLDR lacks; CLDR wins on the ~313 overlapping tags.

## Public contracts
- `packages/engine/src/character-discovery/exemplarSource.ts`: `sourceExemplars(bcp47): SourcedInventory | null` (sync, offline, never throws), `loadExemplarSource(): Promise<void>` (idempotent chunk load), `isGatedTag(tag, source)`, `charactersInTier`, `inventoryToExemplarResult`, `neededCharsFromInventory`; re-exports `exemplarLocaleCandidates` from `cldr.ts`.
- Types in `exemplarTypes.ts`: `ExemplarTier = "main"|"auxiliary"|"punctuation"|"numbers"`, `ExemplarSource = "cldr"|"sldr"`, `SourcedInventory { resolvedTag, source, confidence, characters }`.
- Resolution order: candidate ids most specific first -> first hit in index -> confidence gate (null for `und`, script-only, un-narrowed macrolanguages `ms zh ar fa`; `qaa`-`qtz` gated for CLDR but an SLDR entry passes) -> CLDR before SLDR -> tier parse via canonical `parseUnicodeSet` (a char in several tiers is recorded at its highest) -> NFC. Uppercase counterparts are NOT added here (`casePair.ts`/047 do that).
- Index artifact: `packages/engine/src/character-discovery/generated/exemplars.generated.json` (own ~1.14 MB chunk). Never hand-edit.
- Scripts: `pnpm run fetch-sldr`, `pnpm run codegen-exemplars` (both in prebuild), `pnpm run check-exemplar-staleness` (report only, outside prebuild), `node scripts/gen-exemplar-baseline.mjs` (regression-floor fixture; only with a deliberate CLDR pin bump).
- Studio: `warmExemplarSource()` fire-and-forget from `mountApp()` in `main.tsx`; `resetPhaseBDraftDecisions()` called from both `instantiateFromBase` and `instantiateFromExisting` in `stores/workingCopyStore.ts`, after the no-op guard.

## Key decisions
- CLDR via npm `cldr-misc-full` (lockfile integrity gives FR-012 pinning); SLDR via one SHA-pinned tarball (`scripts/sldr-version.json`) (R1/R2).
- Confidence is surfaced, never filtered on, except the gate above (R6/R7).
- Live-fetch loaders (`createFetchCldrLoader` etc.) stay exported as the injection seam for tests, not the authoring path.
- Prefill is a spec delta: Phase B used to seed from a missing-delta, now from the language alphabet (R8, FR-016/017).

## Gotchas and limits
- `warmExemplarSource()` must not be awaited before first render (chunk cost for visitors who never reach Phase B).
- SLDR `vut.xml` has a malformed `\0327` escape; codegen skips that tier via the exact-text `KNOWN_MALFORMED` list in `scripts/codegen-exemplars.mjs`, so Vute gets no seed. Upstream report not filed.
- The LDML `index` tier is excluded on purpose (titlecased duplicate).
- `utilities/kbgen` still has its own `parseUnicodeSet` with both R9 defects; treat its exemplar output as unusable.
- Run E2E with `--workers=1`; several unrelated specs (carve, touch-derivation) were failing at merge time.

## Divergences from the spec
None found (spot-checked exports, scripts, call sites at origin/main).

## Follow-ups and open issues
- Deferred: opt-in live refresh (#1367), kbgen parser retirement (#1368), CLDR/SLDR union action (#1369), `index` tier (#1370).
- Owed: report SLDR `vut` defect upstream, then bump pin and drop `KNOWN_MALFORMED`.
- Text-sample/paste surface belongs to spec 050.
- Citations to fix at the stub: docs/architecture.md:178,217 and docs/tooling.md:149 link `specs/044.../spec.md` (now archived).
