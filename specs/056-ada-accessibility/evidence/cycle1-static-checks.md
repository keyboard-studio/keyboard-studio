# Cycle 1 — statically-decidable criteria

**Task**: [tasks.md](../tasks.md) T003 · **Date**: 2026-08-04 · **Branch**: `056-ada-accessibility`
**Tree**: `d0ab11d4` + this branch's Phase 1 changes
**Scope**: `packages/studio` (spec 056 Assumptions — the studio SPA only, not generated keyboard artifacts and not third-party OAuth pages).

Each row below is decided by a **named command whose output is reproduced**, not by
inspection-and-belief. A row whose command cannot decide it says so and stays open —
that is the point of running these separately from the manual walk (T002): they stop
consuming manual-audit time only if the command is the evidence.

---

## 2.1.4 Character Key Shortcuts (A) — **pass**

The criterion covers shortcuts implemented **using only a character key** (letter,
punctuation, number, or symbol) that are active without a modifier and not scoped to a
focused control. Non-character keys — `Escape`, arrows, `Enter`, `Space`, `Tab` — are
outside the criterion entirely.

```
$ grep -rn "document.addEventListener\|window.addEventListener" packages/studio/src \
    --include=*.tsx --include=*.ts | grep -i "key"
packages/studio/src/components/AccountControl.tsx:201:    document.addEventListener("keydown", handleKeyDown);
packages/studio/src/components/SurveyResetButton.tsx:80:    document.addEventListener("keydown", onKeyDown);
packages/studio/src/editors/assignLoop/parts/StatusBar.tsx:45:    document.addEventListener('keydown', onKey);
```

Three document-level key listeners exist, and **all three test `e.key === "Escape"` and
nothing else**:

- [AccountControl.tsx:196-199](../../../packages/studio/src/components/AccountControl.tsx) — `if (e.key === "Escape") close();`, installed only while the menu is `open`.
- [SurveyResetButton.tsx:71-73](../../../packages/studio/src/components/SurveyResetButton.tsx) — `if (e.key === "Escape") setConfirming(false);`, installed only while `confirming`.
- [StatusBar.tsx:42-44](../../../packages/studio/src/editors/assignLoop/parts/StatusBar.tsx) — `if (e.key === 'Escape') onClose();`, installed only while the menu is mounted.

The remaining 25 key handlers are React `onKeyDown`/`onKeyUp` props — component-scoped by
construction, so they fire only when focus is inside the element and cannot be a global
character shortcut. The one that reaches widest,
[useCharCycleKeys.ts](../../../packages/studio/src/editors/assignLoop/useCharCycleKeys.ts),
is attached at the gallery **pane** level and handles `ArrowLeft`/`ArrowRight` — arrow
keys, not character keys, and still scoped to a subtree rather than the document.

**Verdict: pass.** No single-character key shortcut exists anywhere in the studio, so the
criterion's requirement (turn off / remap / active-on-focus-only) has nothing to apply to.
**Invalidating condition**: any future document-level handler keying on a printable
character.

---

## 2.2.1 Timing Adjustable (A) — **pass**

```
$ grep -rn "setTimeout\|setInterval" packages/studio/src --include=*.ts --include=*.tsx \
    | grep -v "\.test\."
packages/studio/src/components/OAuthCallbackScreen.tsx:102     window.setTimeout(... CALLBACK_TIMEOUT_MS)
packages/studio/src/hooks/useDebounce.ts:9                     setTimeout(() => setDebounced(value), delay)
packages/studio/src/hooks/useKeyboardArtifact.ts:76            setTimeout(... ) — withTimeout() network guard
packages/studio/src/lib/draftAutosave.ts:835,913               autosave debounce
packages/studio/src/lib/draftPersistence.ts:873,1246           AUTOSAVE_DEBOUNCE_MS / CLOUD_SYNC_DEBOUNCE_MS
packages/studio/src/survey/QuestionField.tsx:601               120 ms blur-close guard
```

The criterion governs **a time limit set by the content on the user's ability to complete
an activity**. Sorting the eight sites against that definition:

| Site | What it times | A user time limit? |
|---|---|---|
| `OAuthCallbackScreen` `CALLBACK_TIMEOUT_MS = 15_000` | the OAuth token-exchange **network handshake**; on expiry it renders a retryable error screen | No — the user is not being asked to act |
| `useKeyboardArtifact` `withTimeout()` | a **fetch** of keyboard source; rejects into a retryable `error/fetch` stage | No — same |
| `useDebounce`, `draftAutosave`, `draftPersistence` | input debounce and save scheduling | No — no content or availability changes for the user |
| `QuestionField:601` (120 ms) | closes a dropdown after blur | No — a paint-ordering guard |

There is **no session expiry, no auth-token countdown that logs the author out, and no
content that becomes unavailable after an interval**. Authoring state is additionally
durable across reload
([draftPersistence.ts](../../../packages/studio/src/lib/draftPersistence.ts)), so even a
browser restart does not impose a deadline.

**Verdict: pass** (no time limit set by the content). **Invalidating condition**: adding a
session timeout, an expiring share link the author must act on, or a timed survey step.

---

## 2.2.2 Pause, Stop, Hide (A) — **pass**

```
$ grep -rn "@keyframes\|animation:" packages/studio/src \
    --include=*.css --include=*.ts --include=*.tsx | grep -v "\.test\."
packages/studio/src/components/OAuthCallbackScreen.tsx:76:  animation: "ks-oauth-spin 0.8s linear infinite",
packages/studio/src/components/OAuthCallbackScreen.tsx:140:  @keyframes ks-oauth-spin { to { transform: rotate(360deg); } }
```

Exactly **one** animation exists in the entire studio: a 36 px circular loading spinner
rotating once per 0.8 s on the OAuth callback screen. The criterion applies to
moving/blinking/scrolling information that (a) starts automatically, (b) lasts more than
five seconds, **and** (c) is presented in parallel with other content.

Condition (c) is not met: the spinner **is** the callback screen's content — that screen
renders the spinner, a status line, and nothing else while `phase === "working"`. It is
also bounded by `CALLBACK_TIMEOUT_MS = 15_000`, after which the screen replaces it with a
static error state, and the "essential" exception covers a progress indicator whose whole
job is to signal that an operation is in flight.

No auto-updating text, no carousel, no marquee, no auto-scrolling pane, no polling display
elsewhere in the app.

**Verdict: pass.** **Recorded residual (not an AA failure)**: the spinner honours no
`prefers-reduced-motion` query —

```
$ grep -rn "prefers-reduced-motion" packages/studio/src
(no output)
```

— which is **2.3.3 Animation from Interactions, Level AAA**, outside this spec's AA target.
Noted here so it is a known gap rather than an oversight.

---

## 2.3.1 Three Flashes or Below Threshold (A) — **pass**

Same single-animation inventory as 2.2.2. `ks-oauth-spin` is a continuous
`transform: rotate()` — a smooth geometric rotation with **no luminance or colour change
whatsoever**, therefore zero flashes, against a threshold of three per second. No other
animation, no video, no canvas rendering loop, no CSS `transition` on a colour that
oscillates.

**Verdict: pass.** **Invalidating condition**: any flashing/strobing indicator, or embedded
media.

---

## 2.5.4 Motion Actuation (A) — **pass**

```
$ grep -rn "devicemotion\|deviceorientation\|DeviceMotionEvent\|DeviceOrientationEvent\|accelerometer\|shake" \
    packages/studio/src --include=*.ts --include=*.tsx -i
packages/studio/src/lib/githubOAuth.ts:10:   ... authorize → callback → token-exchange handshake ...
packages/studio/src/lib/googleOAuth.ts:4:    ... identity-exchange handshake ...
packages/studio/src/lib/handleOAuthCallback.ts:165: ... processes the handshake ...
packages/studio/src/lib/services.ts:5:      ... tree-shakes them in real builds ...
```

All four hits are the substring `shake` inside the word **"handshake"** in prose comments.
There is **no device-motion or device-orientation listener and no accelerometer use** in
the studio; no function can be operated by moving the device.

**Verdict: pass.** **Invalidating condition**: adding any motion-actuated affordance.

---

## 1.4.5 Images of Text (AA) — **pass**

```
$ grep -rn "<img\|backgroundImage\|background-image" packages/studio/src \
    --include=*.tsx --include=*.ts --include=*.css | grep -v "\.test\."
(no output)
```

The studio renders **zero raster images** — no `<img>` element and no CSS
`background-image` anywhere in `src/`. The only vector content is three SVG users
([ProviderMarks.tsx](../../../packages/studio/src/components/ProviderMarks.tsx),
[DashboardView.tsx](../../../packages/studio/src/dashboard/DashboardView.tsx),
[FlowGraphView.tsx](../../../packages/studio/src/dashboard/FlowGraphView.tsx)); the first
is brand logotypes (the criterion's explicit **logotype exception**), and any text in the
other two is live SVG `<text>`, which is real text a user agent can restyle and scale, not
an image of text.

**The reasoning the task asked to be recorded — rendered glyphs are text, not images of
text.** The character map, key caps, and glyph cells display characters by rendering the
codepoint in a webfont. That is text content: it inherits font-size, respects zoom and
text-spacing overrides, and is selectable. The criterion targets text *baked into a
bitmap*, which the studio never produces. This holds even for the tofu-box and PUA cases —
a missing glyph is a font-coverage failure of real text, and the accessible name comes from
the codepoint (FR-007, T019), not from the rendered pixels.

**Verdict: pass.** **Invalidating condition**: shipping a screenshot, a rasterised sample-
text image, or a bitmap keyboard-layout diagram.

---

## 1.3.4 Orientation (AA) — **pass**

```
$ grep -rn "orientation" packages/studio/index.html packages/studio/src/index.css
(no output)
$ grep -rn "orientation.lock\|screen.orientation" packages/studio/src
(no output)
```

No CSS `@media (orientation: …)` rule that hides or blocks content, no
`screen.orientation.lock()` call, and no orientation constraint in the viewport meta:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

The layout is not restricted to a single display orientation. (The same meta tag carries
neither `maximum-scale` nor `user-scalable=no`, which is a supporting — not sufficient —
signal for 1.4.4; that row is decided by the T024 zoom measurements, not here.)

**Verdict: pass.** **Invalidating condition**: an orientation-locked touch-layout editor.

---

## 2.4.5 Multiple Ways (AA) — **NOT statically decidable → recommend `fail`, Cycle 3**

The task's instruction was explicit: *do not claim `n/a` without the WCAG-stated basis.*
Here is the basis, and it does not fully cover this app.

The criterion's exception is *"except where the Web page is the result of, or a step in, a
process."* The studio's view set
([location.ts:39-51](../../../packages/studio/src/lib/location.ts)) is:

| Route | A step in the authoring process? |
|---|---|
| `welcome` | entry point |
| `survey` (+ `step`, `question`) | **yes** — excepted |
| `output` | **yes** — the terminal step |
| `preview` (labelled "Compare") | no — a reference surface |
| `trail` | no — a production review surface (spec 053 FR-017) |
| `profile` | no |
| `flowmap` | no (dev-gated) |

So the exception cleanly covers `survey` and `output`, and those additionally have a second
locating mechanism already (the footer progress row and the decision-trail deep links, both
spec 057/053 — a linear walk *plus* a list of links to positions within it).

It does **not** cover `preview`, `trail`, and `profile`. For those, the persistent tab nav
is the **only** locating mechanism — one way, not "more than one". There is no site map, no
search, and no index of links elsewhere. Hash URLs are direct addresses, not a WCAG
"way" (the sufficient techniques are G125, G64, G63, G161, G126, G185 — a link set, a table
of contents, a site map, or search).

**Verdict: not `pass`, not `n/a`.** Recommending **`fail`** with a Cycle 3 issue, which
matches [spec.md](../spec.md)'s own Cycle 3 list (2.4.5 is named there). Recorded as a
recommendation rather than a flip because T004 owns the tracker write and T005 owns the
issue.

---

## Re-verification: the six media `n/a` rows (1.2.1–1.2.5, 1.4.2)

Re-run of the grep the tracker's 2026-08-03 rows cite, to confirm they have not drifted on
this branch:

```
$ grep -rn "<audio\|<video\|new Audio\|AudioContext\|<track " packages/studio/src \
    --include=*.ts --include=*.tsx | wc -l
0
```

Still zero. The six `n/a` rows stand, and the denominator stays **55 − 6 = 49 applicable**.

---

## Summary of T003

| SC | Level | Verdict | Deciding command |
|---|---|---|---|
| 2.1.4 Character Key Shortcuts | A | **pass** | global-listener grep; all three are `Escape`-only |
| 2.2.1 Timing Adjustable | A | **pass** | `setTimeout`/`setInterval` grep; no user time limit |
| 2.2.2 Pause, Stop, Hide | A | **pass** | `@keyframes`/`animation:` grep; one spinner, sole content, bounded |
| 2.3.1 Three Flashes | A | **pass** | same grep; rotation only, zero luminance change |
| 2.5.4 Motion Actuation | A | **pass** | device-motion grep; four hits are "handshake" |
| 1.4.5 Images of Text | AA | **pass** | `<img>`/`background-image` grep returns nothing |
| 1.3.4 Orientation | AA | **pass** | orientation/viewport grep; no lock |
| 2.4.5 Multiple Ways | AA | **fail (recommended)** | route inventory; nav is the sole way to 3 non-process routes |

**7 rows decidable to `pass` by static evidence; 1 row decided against.** These 8 rows are
now off the manual-audit list. T004 writes them into the tracker.
