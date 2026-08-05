# Cycle 1 — keyboard-only walk (FR-012 manual pass)

**Task**: [tasks.md](../tasks.md) T002 · **Date**: 2026-08-04 · **Branch**: `056-ada-accessibility`
**Target**: Track 1 (adapt-from-base) · **Viewport** 1440×900 · Chromium (Playwright 1228 build)
**Raw data**: `kbwalk.json` / `kbwalk2.json` (probe output, reproduced inline below)

## What this pass is, and what it is not

FR-012 asks for a **manual** keyboard-only pass. This one was driven by an agent through a
real Chromium instance using **key events only** — `Tab`, `Shift+Tab`, `Enter`, `Escape`,
and typed characters. No `click()`, no `fill()`, no programmatic `.focus()` except in the
one explicitly-labelled 3.2.1 probe (§5) where focusing *without* a keystroke is the thing
being tested. Every stop's role, accessible name, computed focus indicator, viewport
position and occlusion state was read from the live DOM.

**Two honest limits, stated before the findings rather than after:**

1. **This is not a human pass.** It cannot report the things only a person notices — whether
   a focus ring is *perceptible* rather than merely present in the computed style, whether
   the reading order makes sense, whether an interaction felt like a trap. A human
   keyboard-only walk is still owed before US1's rows can be called finished.
2. **The walk is partial.** It covers the welcome screen, the survey's first question, and
   the `#preview` / `#trail` / `#output` routes — **five screens.** It does **not** reach
   base selection, Phase B's character map, or the mechanism/touch galleries, because the
   walk machinery those need is failing in this environment for reasons unrelated to
   accessibility (documented with a control run in
   [cycle1-axe-baseline.md §1](cycle1-axe-baseline.md)). **SC-004 — a full Track 1 walk with
   zero pointer events — is therefore NOT demonstrated by this pass.** T018 owes that.

---

## 1. Findings summary

| SC | Level | Verdict from this pass | Decided by |
|---|---|---|---|
| 2.1.1 Keyboard | A | **partial pass** — every control on 5 screens operable by key alone; composite widgets unreached | §2, §4 |
| 2.1.2 No Keyboard Trap | A | **pass** (5 screens) | §4 — ring closed on all 5; Escape always escapes |
| 2.4.3 Focus Order | A | **insufficient** — no disorder seen, but ring start varies and the dense screens were unreached | §2 |
| 2.4.7 Focus Visible | AA | **FAIL** — two controls focusable with no indicator at all | §3 |
| 2.4.11 Focus Not Obscured | AA | **partial pass** — zero occlusions in 54 stops; no scrolled survey content reached | §2 |
| 3.2.1 On Focus | A | **pass** | §5 — 40 stops, zero context changes |
| 3.2.2 On Input | A | **pass** | §6 — typing changed no step, heading or route |
| 2.4.1 Bypass Blocks | A | **FAIL** — no skip link; 7 chrome stops before content on every screen | §2 |

---

## 2. The tab ring, per screen

54 stops across 5 screens. **Every ring closed** (returned to its first stop) — the primary
trap test. `BODY` marks the wrap boundary where focus leaves the document for browser
chrome; it is the ring's edge, not a defect.

### welcome (first visit) — 10 stops

```
 0 a       Studio            5 button  Language
 1 a       Preview           6 button  Sign in with GitHub
 2 a       Output            7 button  Sign in with Google
 3 a       Decisions         8 button  I'm new
 4 a       Flow Map          9 (wrap)
```

### survey — first question (identity-lite) — 11 stops

```
 0 input   role=combobox     (the language field)
 1 ul      role=listbox      (see the note in §4)
 2 button  Reset survey
 3 (wrap)
 4-10  Studio · Preview · Output · Decisions · Flow Map · Language · Sign in
```

### route #preview — 14 stops

```
 0 button  Sign in           7  (wrap)
 1 button  Open base         8  a  Studio
 2 button  New from base     9  a  Preview
 3 input   role=combobox     10 a  Output
 4 button  Desktop OSK       11 a  Decisions
 5 button  Mobile KB         12 a  Flow Map
 6 iframe  (OSK)             13 button Language
```

### route #trail — 8 stops · route #output — 11 stops

Chrome only on `#trail` (the trail had no entries in this session); `#output` adds
`Open base`, `New from base` and the source-mode combobox.

**2.4.1 — the finding.** On every screen the first Tab stop is the "Studio" nav link, and an
author must pass **five nav links plus Language plus Sign-in — seven stops — before reaching
any content**, on every screen, every time. There is no skip link:

```
$ grep -n "<main\|<h1\|skip" packages/studio/src/StudioShell.tsx
(no match for <main, <h1, or a skip affordance; <nav> is at :274, <h2> at :1512)
```

This is the same root cause as the `landmark-one-main` / `region` axe moderates on 10/10
screens — the runtime and the source agree. **2.4.1 = fail**, fixed by T007.

**2.4.11 — no occlusion observed.** Each stop's rect was probed against
`document.elementFromPoint` at its top and bottom edge for any `position: sticky|fixed`
element covering it. **Zero occlusions in 54 stops, and zero off-viewport stops.** Recorded
as a partial pass only: the screens with sticky chrome over long scrolling content (Phase B,
the galleries) were not reached.

---

## 3. 2.4.7 Focus Visible — **FAIL**, with the two controls named

The indicator was read from computed style at each stop (`outlineStyle`/`outlineWidth`,
`boxShadow`, and `:focus-visible` matching). Two stops have **neither an outline nor a box
shadow** — no focus indicator of any kind:

| Screen | Control | outline | box-shadow | `:focus-visible` |
|---|---|---|---|---|
| `#preview`, `#output` | `input[role="combobox"]` (the base-source field) | `none 0px` | `none` | matches |
| `#preview` | `iframe` (KeymanWeb OSK) | `none 0px` | `none` | does not match |

The combobox is the exact hazard
[index.css](../../../packages/studio/src/index.css) already warns about: `.ks-focus-ring`
is **opt-in**, so a control that omits the class gets nothing, and its inline styles
suppress the UA default outline. This is a keyboard user losing their place on a control
they must operate — T011's baseline `:focus-visible` rule is what fixes it.

The OSK `<iframe>` is a tab stop with no indicator and no `:focus-visible` match. Its
*interior* is KeymanWeb's markup and out of scope (the same reasoning that makes
`OSK_IFRAME_DEBT` permanent), but **whether the iframe is in our tab order at all is our
decision**, and today a keyboard author tabs into an unlabelled, unindicated frame. Flagged
for T015/T017.

All other 52 stops carry an indicator.

---

## 4. 2.1.2 No Keyboard Trap — **pass**

Every one of the five rings closed. The explicit dismissal probe, run entirely from the
keyboard:

```
trigger:            button "Language"       (shell chrome SelectMenu)
Enter    ->  listboxes: 1, activeElement role = listbox     (focus moves into the list)
Escape   ->  listboxes: 0
focus after Escape: button "Language"        focusReturnedToTrigger: true
```

That is the APG listbox dismissal pattern behaving correctly, **including the hard part** —
[SelectMenu.tsx](../../../packages/studio/src/ui/SelectMenu.tsx) portals its list to
`document.body`, so returning focus to the trigger cannot rely on DOM ancestry, and it still
lands. US1 acceptance scenario 2 is satisfied for this widget.

The survey language combobox behaves the same way: `Escape` closes the list and leaves focus
on the input (§5).

**One thing to re-check in Cycle 2, recorded rather than resolved.** In the survey ring the
stop after the combobox was its `ul[role="listbox"]` — i.e. the open list appeared to be in
the tab sequence. The follow-up probe (§5) could not reproduce it: there, `Tab` from the
combobox closed the list and moved on. So it is **intermittent and unconfirmed**, likely
depending on whether the list was open when `Tab` fired. Not written up as a defect; noted
so T015 looks for it deliberately.

---

## 5. 3.2.1 On Focus — **pass**

Forty consecutive `Tab` presses on the welcome screen, comparing `location.hash`, the count
of open dialogs/listboxes, and the first heading before and after each press:

```
changes recorded: []   (zero, over 40 stops)
```

**The one behaviour that needed deciding.** Focusing the survey's language combobox — with
no keystroke, `element.focus()` alone — **opens its listbox**. Measured over 3 trials behind
an explicit readiness gate (`waitForSelector('input[role="combobox"]')` + 3 s settle), all
three identical:

```
before focus:  listboxCount 0   aria-expanded "false"
after  focus:  listboxCount 1   aria-expanded "true"   activeElement input[role=combobox]
after  Escape: listboxCount 0   aria-expanded "false"  activeElement input[role=combobox]
```

*(An earlier ungated run reported focus falling to `body` after `Escape`. That run's own
`ready` state shows the survey had not finished rendering when the probe began — a probe
timing artifact, not app behaviour. The gated 3-trial run above supersedes it and is the
data saved in [kbwalk2.json](kbwalk2.json).)*

This is **not** a 3.2.1 failure, and the reason matters. A change of context is a change of
user agent, viewport, **focus**, or content that changes the page's meaning. Here focus does
**not** move — it stays on the input — no new window opens, the meaning of the page is
unchanged, and `Escape` reverses it with focus intact. A suggestion list appearing under a
combobox is a change of *content*, which 3.2.1 permits. It also satisfies the spec's own
stricter wording for US1 scenario 3, which forbids "a popover auto-open **that moves
focus**".

Recorded explicitly because it is the single most plausible thing for a later reviewer to
misread as a 3.2.1 violation.

---

## 6. 3.2.2 On Input — **pass**

Typed `Bambara` into the language field, keyboard only, and re-read the route and heading:

```
typed into: input[role=combobox]
before: { hash: "", heading: "Let's identify your language" }
after:  { hash: "", heading: "Let's identify your language" }
changed: false
```

No auto-advance, no route change, no context change on input. This is the specific risk
[SurveyRunner.tsx](../../../packages/studio/src/survey/SurveyRunner.tsx) was suspected of in
the tracker note ("Survey auto-advance behavior needs checking") — on this question it does
not occur. T016 still owes the same check on the *selection*-driven questions, which this
pass did not reach.

---

## 7. What T004 may and may not take from this file

**May cite** — 2.4.7 `fail` (two named controls), 2.4.1 `fail` (no skip link, corroborated in
source), 2.1.2 `pass` (5 screens, ring closure + Escape/return-focus), 3.2.1 `pass`
(40 stops), 3.2.2 `pass` (typed input on the identity question).

**May not cite** — 2.1.1 or 2.4.3 as a full pass: the composite widgets that decide them
(character map, galleries, multi-selects, radio groups) were never reached. 2.4.11 as a
full pass: no sticky-over-scrolling-content screen was reached. Any claim that a human
keyboard-only pass has happened: it has not.
