# Draft issue — WCAG 1.4.3 serious contrast violations on carve/Phase B screens

**Not filed.** Drafted for review before `gh issue create`. Title and body below
are the exact intended issue content.

---

## Title

```
bug(studio): pre-existing WCAG 1.4.3 serious contrast violations on carve/Phase B screens block strict axe scans
```

## Body

### Summary

Spec 057's full-suite E2E run surfaced five `serious`-impact axe `color-contrast`
violations (WCAG 1.4.3 Contrast Minimum) on the carve gallery and Phase B
screens. All five are **pre-existing on `main`** — none of the implicated
components (`CarveGallery.tsx`, `RemovalBanner.tsx`, `Rail.tsx`, `PhaseB.tsx`,
`ConvenienceCharsStep.tsx`, `lint/LintChip.tsx`, `lint/colors.ts`,
`ui/theme.ts`) are touched by the 057 branch (`git diff main..HEAD` confirms
byte-identical). Spec 057's own gating evidence documents this discovery for
two other screens already
([specs/057-bulletproof-navigation/evidence/gating-red.md](../evidence/gating-red.md)
§"Two corrections made to reach a *valid* red").

This is a **known gap**, not a new discovery: [1.4.3 is an open `unknown` row
in the tracker](../../056-ada-accessibility/wcag-2.2-aa-tracker.md) — spec
056's automated axe gate (FR-003) only covers whichever screens each walk spec
happens to scan, and no dedicated token-level contrast pass (FR-009) has run
yet.

For spec 057's own E2E suite to go green without weakening the axe gate
(FR-003 forbids both loosening `expectNoSeriousAxeViolations` and blanket
disables), each affected call site now excludes the specific offending
selectors, with the criterion and reason named inline
(`KNOWN_CONTRAST_DEBT`, following the idiom already established in
`e2e/tab-roundtrip.spec.ts` / `e2e/decision-deeplink.spec.ts`). Those
exclusions are a workaround, not a fix — **this issue tracks the real fix**.

### Screens and offending nodes

**1. Carve gallery** (`carve.spec.ts:95`, screen "carve gallery
(bj_cree_woods)", excluded at `carve.spec.ts:129`):

- `button[aria-label="Hide info panel"]` — CarveGallery.tsx info-panel toggle
- `button[data-testid="carve-continue"]` — CarveGallery.tsx footer Continue
- `button[aria-label="Dismiss removal recommendation"]` — RemovalBanner.tsx
- `button[data-testid="carve-card-group#0"] > span:nth-child(2) > span` —
  Rail.tsx per-node carve-card "kept/total" text
- `div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)` —
  believed to be RemovalBanner's own region (collapsed-strip text on its
  green-tinted background); no stable selector on the exact node, excluded via
  the banner's `div[aria-label="Removal recommendation"]` ancestor instead

**2. Phase B complete** (`copy-edit.spec.ts:171`, screen "phase B complete
(copy-edit walk)", excluded at `copy-edit.spec.ts:183`):

- `button[data-testid="convenience-continue"]` — ConvenienceCharsStep.tsx
- `iframe .kmw-spacebar-caption` — the KeymanWeb OSK iframe's own markup (not
  authored in this repo; same debt `tab-roundtrip.spec.ts` already excludes)

**3. Survey with footer, characters step** (`footer-progress.spec.ts:55`,
screen "survey (footer present, characters step)", excluded at
`footer-progress.spec.ts:114`):

- `button[data-testid="phase-b-intro-next"]` — PhaseB.tsx intro Continue
- `iframe .kmw-spacebar-caption` — same OSK iframe debt as above

**4. Phase B build list, US1 bambara walk** (`touch-derivation-us1.spec.ts:234`,
screen "phase B build list (US1 bambara walk)", excluded at
`touch-derivation-us1.spec.ts:257`):

- `button[aria-label="Hide info panel"]` — CarveGallery.tsx (same screen
  affordance rendered mid Phase B, before the standalone carve gallery step)
- `button[data-testid="carve-continue"]` — CarveGallery.tsx
- `button[data-testid="carve-card-group#0"] > span:nth-child(2) > span > span:nth-child(1)`
- `span:nth-child(2) > span > span:nth-child(2)`
- `span:nth-child(2) > span > span:nth-child(3)` — Rail.tsx per-node
  carve-card modifier-breakdown spans (`modBreakdown.map` in Rail.tsx)

**5. Phase B build list, US2 piaroa walk** (`touch-derivation-us2.spec.ts:367`,
screen "phase B build list (US2 piaroa walk)", excluded at
`touch-derivation-us2.spec.ts:390`):

- `code` — a lint-finding code badge (`lint/LintChip.tsx`, styled from
  `lint/colors.ts`'s severity palette), surfaced for the marks-bearing placed
  character on this screen
- `button[data-testid="convenience-continue"]` — ConvenienceCharsStep.tsx

### Root cause (suspected, not yet confirmed by a token-level audit)

All the button/text offenders share a family resemblance: subdued
"secondary" text/button styling (`var(--app-text-subtle)` and similar tokens
in `ui/theme.ts`) that reads fine visually but falls short of the 4.5:1 (text)
/ 3:1 (large text / UI component) ratios axe's `color-contrast` rule checks.
The OSK iframe nodes are out of scope for a token fix — that markup belongs to
KeymanWeb, not this repo, and needs its own resolution (report upstream, or
override with a scoped stylesheet injected into the iframe if that's judged
worthwhile).

### What already covers this pending the fix

- 057's five call sites listed above scope the exclusion with an inline
  comment naming WCAG 1.4.3 and this tracker row, per FR-003.
- [specs/056-ada-accessibility/wcag-2.2-aa-tracker.md](../../056-ada-accessibility/wcag-2.2-aa-tracker.md),
  row 1.4.3 (Contrast Minimum, Level AA) — currently `unknown`, evidence
  pending "Token-level check (FR-009)".

### Acceptance criteria for the real fix

- [ ] `ui/theme.ts`'s subdued-text tokens (or the specific component styles
      overriding them) pass 4.5:1 / 3:1 contrast against their actual
      backgrounds in both CarveGallery.tsx, Rail.tsx, RemovalBanner.tsx,
      PhaseB.tsx, ConvenienceCharsStep.tsx, and LintChip.tsx's severity
      palette (`lint/colors.ts`).
- [ ] The five `KNOWN_CONTRAST_DEBT` exclusions listed above are removed from
      `carve.spec.ts`, `copy-edit.spec.ts`, `footer-progress.spec.ts`,
      `touch-derivation-us1.spec.ts`, and `touch-derivation-us2.spec.ts` and
      their scans go green unscoped.
- [ ] Tracker row 1.4.3 flips from `unknown` toward `pass` (or stays `unknown`
      with updated partial-evidence notes if other unscanned screens remain).
- [ ] A decision recorded on the OSK iframe: fix upstream, scoped override, or
      documented `n/a` with justification.

### References

- [specs/056-ada-accessibility/wcag-2.2-aa-tracker.md](../../056-ada-accessibility/wcag-2.2-aa-tracker.md)
  (row 1.4.3)
- [specs/057-bulletproof-navigation/HANDOFF.md](../HANDOFF.md) §3 (Class A)
- [specs/057-bulletproof-navigation/evidence/gating-red.md](../evidence/gating-red.md)
  §"Two corrections made to reach a *valid* red"
- [specs/057-bulletproof-navigation/evidence/e2e-serial.raw.txt](../evidence/e2e-serial.raw.txt)
  (failures #2, #3, #12, #15, #16 — the authoritative raw run)
- `packages/studio/e2e/helpers/axe.ts` (the exclusion mechanism)
