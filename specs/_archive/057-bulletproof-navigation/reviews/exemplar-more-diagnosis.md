# exemplar-prefill.spec.ts:71 — root cause and fix

## Symptom (evidence/e2e-serial.raw.txt, failure #11)

`packages/studio/e2e/exemplar-prefill.spec.ts:71` —
`await expect(preview).toContainText("more")` fails: the
`exemplar-offer-preview` testid contains the full 46-chip exemplar list, no
"+N more" text anywhere. The two preceding assertions (`"ə"`, `"ɛ"`) pass.

HANDOFF.md §2 classified this as an axe/contrast failure. It is not — no axe
scan runs in this spec, and the failure is a plain Playwright text assertion
against product markup. Misclassification corrected here.

## Root cause

The assertion is stale. `ExemplarOfferDetail` in
`packages/studio/src/survey/PhaseB.tsx` used to render a space-joined text
preview capped at 24 characters with a `+{{elided}} more` (`Trans id
survey.phaseB.intro.exemplars.more`) elision marker. That was **deliberately
removed** on `main`, well before this branch existed:

```
6ef18ae0 feat(studio): show full exemplar character list as cards, never
          truncated (#1389)   — Mon Jul 27 2026
```

Commit message rationale: "An author cannot confirm an alphabet they cannot
see, so render the main-tier set in full — one read-only card per character
... Drops the now-orphaned survey.phaseB.intro.exemplars.more catalog id."

The component now renders `ordered.map(...)` — every main-tier character as
its own chip, unconditionally, with no length cap and no elision branch.

The E2E spec's `toContainText("more")` assertion was never updated to match.
`git log --oneline main -- packages/studio/e2e/exemplar-prefill.spec.ts`
shows exactly one commit, `fabbcbd2` (the original spec-044 feature landing,
predating 6ef18ae0's truncation removal) — the spec file has had zero
touches since, on `main` or on this branch.

## Verdict: PRE-EXISTING on `main`, not a 057 regression

Both `git diff main..HEAD -- packages/studio/src/survey/PhaseB.tsx` and
`git diff main..HEAD -- packages/studio/e2e/exemplar-prefill.spec.ts` are
empty — neither file has been touched on `057-bulletproof-navigation`. This
failure would reproduce identically on a clean `main` checkout; spec 057
did not introduce it and did not touch either file. HANDOFF.md's E2E summary
should be corrected to reflect this rather than attribute it to the
bulletproof-navigation change set.

## Ratified behavior confirmed by the unit suite

`packages/studio/src/survey/PhaseBExemplarPrefill.test.tsx` already locks the
no-truncation contract and passes today:

```
148: it("shows the whole alphabet as cards — the list is never truncated", ...)
155:   expect(preview.textContent).not.toContain("more");
```

`pnpm --filter @keyboard-studio/studio test src/survey/PhaseBExemplarPrefill.test.tsx`
→ 25 passed. This is the second, independent confirmation (beyond the git
history) that "no truncation, ever" is the ratified product behavior, not an
accidental regression that needs restoring.

Checked spec 044 (`specs/044-cldr-sldr-exemplars/spec.md`) for a competing
"+N more" contract requirement — none found; the one "truncat" hit there is
about malformed-exemplar-set index generation, unrelated to UI preview
rendering.

## Fix applied

Updated the stale E2E assertion in
`packages/studio/e2e/exemplar-prefill.spec.ts` to match the ratified
full-list behavior, with a comment citing `6ef18ae0`:

- Removed `await expect(preview).toContainText("more");`
- Replaced the "elides after a couple dozen characters" comment (describing
  behavior that no longer exists) with one explaining the current full-list
  contract and pointing at the ratifying commit.
- Kept the two Ewondo-distinctive-letter assertions (`"ə"`, `"ɛ"`) — those
  passed before and remain valid regardless of truncation.

No change to `PhaseB.tsx` or `PhaseBExemplarPrefill.test.tsx` — the product
behavior is correct and already locked by an existing, passing unit test.

## Shaped-bug sweep — skipped, with reason

Searched for every other reference to the removed truncation surface
(`exemplar-offer-preview`, `EXEMPLAR_PREVIEW_LIMIT`,
`phaseB.intro.exemplars.more`, `toContainText("more")` scoped to this
testid) across `packages/studio`. Exactly one site outside the already-fixed
pair (component + its unit test): the one E2E line fixed here. This is a
single stale assertion trailing a UI-contract change, not a recurring shape
(no KMN slot-ID drift, TS/kmcmplib divergence, VFS host-disk write, second
debounce timer, layer confusion, or BCP47/A2 mismatch) — skipping the full
`sweep-pattern` skill invocation is appropriate; this note documents that
decision in place of the audit.

## Verification run

```
pnpm --filter @keyboard-studio/studio test src/survey/PhaseBExemplarPrefill.test.tsx
  Test Files  1 passed (1)
  Tests       25 passed (25)

pnpm --filter @keyboard-studio/studio typecheck
  (clean, no output)
```

E2E itself was not re-run per task instructions (dev server in use by the
main session); the fix is a pure text-assertion change against markup
already exercised and passing in the unit suite above.
