# Cycle 1 — axe baseline (the measurement Cycle 1 never took)

**Task**: [tasks.md](../tasks.md) T001 · **Date**: 2026-08-04 · **Branch**: `056-ada-accessibility`
**Tree**: `d0ab11d4` + this branch · **Node** v24.11.0 · **Corpus** `../keyboards` @ `435f82d69` (1020 keyboards, `origin` = `keyboard-studio/keyboards`)
**Raw data**: [axe-baseline.jsonl](axe-baseline.jsonl) (walk-spec lane) · [axe-supplemental.jsonl](axe-supplemental.jsonl) (standalone probe)

T001 **runs and records** — it adds no assertion. To record what the gate throws away, the
recorder in [helpers/axe.ts](../../../packages/studio/e2e/helpers/axe.ts) now appends the
*whole* axe result (violations at every impact, the rules that passed, and the
`incomplete` set) to a JSONL file when `A11Y_BASELINE=1`. With the variable unset it is
inert and the gate is byte-for-byte the same one that shipped in `9715df34`.

```bash
A11Y_BASELINE=1 A11Y_BASELINE_FILE=<path> npx playwright test <spec> --reporter=line
```

---

## 1. What actually ran, and what did not

**The full-suite run does not work in this environment, and that is not an accessibility
finding — it is a lane defect that has to be recorded before any number below is read.**

| Attempt | Result |
|---|---|
| `npx playwright test` (all 69) — run 1 | 31 failed, 32 never ran, 3 passed · 16.0 min · **4 scans captured** |
| `npx playwright test` (all 69) — run 2, warm server | 31 failed, 32 never ran, 3 passed · 16.9 min · **1 scan captured** |
| `npx playwright test boot-smoke.spec.ts` alone | **4 passed** · 18.9 s |
| per-spec, one invocation each | **10 scans captured** (below) |

In the whole-suite run even `boot-smoke` fails — `page.goto` times out at 240 s waiting for
`load` — while the same spec passes standalone in under 20 s against the same server.
The single-worker 69-test run degrades the shared `pnpm dev` server; the axe lane therefore
has to be driven **one spec per invocation**, which is how the data below was gathered.

**Not caused by this branch.** Control run with the recorder stashed
(`git stash push packages/studio/e2e/helpers/axe.ts`):

```
$ npx playwright test tab-roundtrip.spec.ts --reporter=line
  1 failed
    e2e\tab-roundtrip.spec.ts:100:3 › tab round trip preserves the author's position …
```

Identical failure with the change reverted, so these are **pre-existing** in this
environment. They are out of spec 056's scope and are recorded here only because they
bound the coverage.

### Coverage achieved — 10 of 17 walk-spec scan sites

| Spec | Result | Scans captured |
|---|---|---|
| `boot-smoke.spec.ts` | 4 passed | 3 (`app`, `github oauth callback`, `google oauth callback`) |
| `carve.spec.ts` | 1 passed / 1 failed (compile→download, not a11y) | 2 (`carve gallery (bj_cree_woods)`, `output screen (carve walk)`) |
| `copy-edit.spec.ts` | 3 passed / 6 failed | 2 (`phase B complete`, `output screen (copy-edit walk)`) |
| `touch-derivation-us2.spec.ts` | 1 passed / 1 failed | 1 (`output screen (US2-AS4 bambara reseed walk)`) |
| `decision-deeplink.spec.ts` | 1 failed | 1 of 3 (`trail (before revision)`) |
| `tab-roundtrip.spec.ts` | 1 failed | 1 (`tab: preview`) |
| `footer-progress.spec.ts` | 1 failed | 0 — fails before its scan |
| `touch-derivation-us1.spec.ts` | 1 failed | 0 — fails at :274, before its scan at :278 |

**Explicitly not covered** (the walk dies in Phase B before reaching them): the character-map
step, the mechanism/touch galleries, `survey: track (deep-link arrival)`,
`trail (after revision)`, `survey (footer present, characters step)`, and the two
touch-derivation Phase-B/gallery screens. **These are the composite-widget screens — the
most accessibility-dense surfaces in the product — so this baseline under-samples exactly
where the risk is highest.** Said plainly rather than averaged away.

### Supplement: 5 screens scanned outside the walk specs

Because the walk lane cannot reach them, five screens were scanned by a standalone probe
driving the same dev server, recorded to a **separate** file so provenance is never
confused: `welcome screen (first visit)`, `survey — first question (identity-lite)`,
`route #preview`, `route #trail`, `route #output`. The probe applies **no exclusions** —
see §3, which is the most important finding in this document.

---

## 2. Walk-spec lane results (10 screens, exclusions applied)

**Zero `serious` and zero `critical` violations.** The FR-003 gate is honestly green on
every screen it reached.

Below the gate, three `moderate` rules fail — the findings the gate deliberately drops and
that therefore never reached any CI output before now:

| axe rule | Impact | Screens | Maps to |
|---|---|---|---|
| `landmark-one-main` | moderate | **10 / 10** | 1.3.1, 2.4.1 |
| `region` | moderate | **10 / 10** | 1.3.1 |
| `page-has-heading-one` | moderate | 4 / 10 | 1.3.1, 2.4.6 |

All three are the same root cause, and it is a **structural** one:
[StudioShell.tsx](../../../packages/studio/src/StudioShell.tsx) renders a `<nav>` (:274) and
an `<h2>` (:1512) and **no `<main>`, no `<h1>`, and no skip link** — verified in the source,
not just inferred from the scan. Every content node therefore sits outside any landmark,
which is what `region` reports on all ten screens. T007 fixes all three at once.

Three rules come back `incomplete` (axe could not decide; **not** a pass):

| axe rule | Screens | Why it matters |
|---|---|---|
| `color-contrast` | 10 / 10 | see §3 — the offenders are excluded, so axe has nothing left to judge |
| `aria-valid-attr-value` | 10 / 10 | manual-review candidate for 4.1.2 |
| `aria-prohibited-attr` | 7 / 10 | manual-review candidate for 4.1.2 |

**30 axe rules are clean on every screen scanned** — clean meaning *passed somewhere and
never violated or `incomplete` anywhere*. This distinction matters: axe reports per node, so
a rule can appear in `passes` **and** `violations` on the same screen (`region` does exactly
that). Counting a rule as evidence because it appears in `passes` would have flipped
`region` and `color-contrast` to green. The 30:

`aria-allowed-attr`, `aria-allowed-role`, `aria-conditional-attr`, `aria-deprecated-role`,
`aria-hidden-body`, `aria-hidden-focus`, `aria-required-attr`, `aria-roles`,
`aria-valid-attr`, `autocomplete-valid`, `avoid-inline-spacing`, `button-name`, `bypass`,
`document-title`, `duplicate-id-aria`, `empty-heading`, `form-field-multiple-labels`,
`heading-order`, `html-has-lang`, `html-lang-valid`, `label`, `label-title-only`,
`landmark-unique`, `link-name`, `list`, `listitem`, `meta-viewport`, `meta-viewport-large`,
`nested-interactive`, `scrollable-region-focusable`.

> **`bypass` passes but 2.4.1 does not.** axe's `bypass` rule is satisfied by *any* of a skip
> link, a heading, or a landmark, and the shell has a heading and a `<nav>`. It passes while
> `landmark-one-main` and `region` fail on the same screen, and while the keyboard walk
> (T002) shows the first Tab stop is the "Studio" nav link with no skip affordance. Do not
> flip 2.4.1 on `bypass`.

---

## 3. The most important finding: the gate is green partly because it is blindfolded

The walk-spec lane rates `color-contrast` **`incomplete` on all 10 screens** — no verdict.
The standalone probe runs the identical rule with **no exclusions** on overlapping screens
and gets:

| Screen | Rule | Impact | Offending node |
|---|---|---|---|
| `welcome screen (first visit)` | `color-contrast` | **serious** | `div > div > button:nth-child(1)` |
| `route #preview` | `color-contrast` | **serious** | `div[aria-label="Keyboard source mode"] > button:nth-child(1)` |
| `route #output` | `color-contrast` | **serious** | `div[role="group"] > button:nth-child(1)` |

`div[role="group"] > button:nth-child(1)` is character-for-character the first selector in
`OUTPUT_SCREEN_DEBT`
([contrastDebt.ts:28](../../../packages/studio/e2e/helpers/contrastDebt.ts)). So the
serious-severity contrast failure is real, is present today, and is invisible to CI **only
because it is excluded**. That is the exclusion mechanism working exactly as designed and
documented — but it means **1.4.3 must be recorded `fail`**, and no reading of the
walk-spec lane's green result may be used to argue otherwise.

`div[aria-label="Keyboard source mode"] > button:nth-child(1)` — the Open-base / New-from-base
toggle on the Compare screen — is a **fourth offender not currently in
`contrastDebt.ts`**, surfaced by dropping the exclusions. T012 must fix it too; it is not in
any existing debt list.

---

## 4. Live per-node exclusion inventory

`grep -rn "DEBT" packages/studio/e2e/` — every live exclusion, so each is re-audited by
T013 rather than inherited.

**Shared, in [helpers/contrastDebt.ts](../../../packages/studio/e2e/helpers/contrastDebt.ts)** — all five cite 1.4.3:

| Constant | Selector(s) | Disposition |
|---|---|---|
| `OSK_IFRAME_DEBT` | `iframe` | **Keep permanently** — KeymanWeb's own markup, not authored here. T013 converts the comment to a third-party justification. |
| `SHARED_CHROME_DEBT` | `button[aria-label="Sign up with GitHub"]` | Fix in T012, then delete |
| `OUTPUT_SCREEN_DEBT` | `div[role="group"] > button` + shared + iframe | **Confirmed live offender (§3)**; fix, then delete |
| `GLYPH_KEY_CHIP_DEBT` | `button[aria-label*="— K_"] > span` | Fix in T012, then delete |
| `LINT_CHIP_DEBT` | `[aria-label="Lint findings"] code` | Fix in T012, then delete |

**Spec-local `KNOWN_CONTRAST_DEBT` lists** — five copies, each excluding its own walk's
extra nodes: [carve.spec.ts:67](../../../packages/studio/e2e/carve.spec.ts) (+ a second list
`KNOWN_CONTRAST_DEBT_OUTPUT` at :105),
[copy-edit.spec.ts:127](../../../packages/studio/e2e/copy-edit.spec.ts),
[decision-deeplink.spec.ts:70](../../../packages/studio/e2e/decision-deeplink.spec.ts),
[footer-progress.spec.ts:48](../../../packages/studio/e2e/footer-progress.spec.ts),
[tab-roundtrip.spec.ts:61](../../../packages/studio/e2e/tab-roundtrip.spec.ts),
[touch-derivation-us1.spec.ts:120](../../../packages/studio/e2e/touch-derivation-us1.spec.ts),
[touch-derivation-us2.spec.ts:202](../../../packages/studio/e2e/touch-derivation-us2.spec.ts).

**Every exclusion in the tree names 1.4.3 and nothing else.** No exclusion hides a rule other
than contrast, and there are no blanket disables — FR-003's scoping rule is being honoured.
The count to reduce is **6 shared constants + 8 spec-local lists**.

---

## 5. What this baseline supports, and what it does not

**Supports** (evidence for T004, walk-spec lane + probe agreeing):

- 1.4.3 → **`fail`**, with three named serious-severity nodes and a fourth undebted one.
- 1.3.1 / 2.4.1 / 2.4.6 → **`fail`** on the structural trio, corroborated in source.
- The 30 clean rules are real evidence, but each covers only *part* of a criterion — axe
  detects roughly 30–40% of violations, which is the whole reason Cycle 2 is manual.

**Does not support** — and no tracker row may cite this file for them:

- Anything decided only on the character-map, gallery, or Phase-B composite widgets: **not
  scanned**.
- `color-contrast` being clean anywhere: it is `incomplete` in every gated scan.
- 2.4.1 on the strength of `bypass` passing (see the callout in §2).
