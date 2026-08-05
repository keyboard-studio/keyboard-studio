# Content hand-off: attribution question wording (037)

**For**: Content (survey text is Content-owned — Constitution Article VI)
**From**: Engine, spec [059-keyboard-attribution](spec.md)
**Date**: 2026-08-04
**Status**: Engine work COMPLETE and shipped. **No prompt text was changed** — that is this
hand-off.

---

## Why this exists

Spec 037 put three attribution questions on the live identity flow. Engine deliberately did not
touch their prompt or help text: it is Content-owned surface. But the text was written for a
fuller Phase A battery, and their **behaviour changed** when they moved, so parts of it are now
inaccurate rather than merely off-tone.

Four of the five items below are wording. **Item 5 is a correctness concern** and is the one worth
a decision even if the rest is left alone.

## What the author now sees

The identity flow ends with three questions, reached from `il_target_script`'s default branch
(a gated script terminates before them):

| id | required | behaviour |
|---|---|---|
| `il_author_name` | **yes** | pre-filled from the signed-in GitHub profile's display name |
| `il_author_email` | no | pre-filled from the profile; often blank (private emails) |
| `il_copyright_holder` | no | **blank means "same as the author"** |

Each imports its prompt and help text from the demoted Phase A module of the same purpose
(`author_display_name`, `author_contact_email`, `pa_copyright_holder`) and overrides only `id`
and `next`. So there is one source of survey copy — see "Two ways to apply changes" below.

---

## The five items

### 1. `il_author_name` — the field is pre-filled, but the prompt asks as if blank

**Now**: "Who should be listed as the author of this keyboard?"

For a signed-in author the field already contains their name. A question phrased as a request
invites re-typing something that is already correct.

**Suggested**: "Is this the right name to credit for this keyboard?"

### 2. `il_author_name` help — conflates the author with the organisation

**Now**: "…You can use a person's name, an organization name, or a committee name, for example:
Bafut Language Committee."

That was right when this was the only attribution question. It no longer is: `il_copyright_holder`
captures the organisation separately. As written, the help steers the author to put the committee
name here *and* the same value two questions later.

**Suggested**: keep the first sentence, and replace the second with something that points forward —
e.g. "Use the person or group who made the keyboard. If an organisation holds the copyright, there
is a separate question for that."

### 3. `il_author_email` — now optional, but does not say so

**Now**: "What email address can people use to contact the keyboard author?" *(was `required: true`,
now `required: false`)*

It became optional because a GitHub profile email is frequently private, and spec 059 states an
absent email must never block emission. The prompt still reads as required.

**Suggested**: add "(optional)" to the prompt, matching the Phase F convention, and note in the
help that it may be left blank.

### 4. `il_copyright_holder` — the "blank means the same as you" default is undiscoverable

**Now**: "Who holds the copyright for this keyboard?" *(optional; blank defaults to the author
name)*

This is the most useful of the four. An author who is also the rights holder — the common case —
can skip the field entirely, and there is no way for them to know that. Most will retype their own
name.

**Suggested**: "Who holds the copyright, if not you?" with help stating that leaving it blank
credits the author named above.

### 5. ⚠️ `il_copyright_holder` on a DERIVED keyboard — a correctness concern, not wording

When a keyboard is derived from a base, the **base author's notice is now retained automatically**
and the new author is appended:

```
Copyright (c) 2016-2021 Original Author     <- kept automatically, verbatim
Copyright © 2026 New Author                 <- from this question / the author name
```

An author who does not know that may reasonably type the base author's name into this field in
order to credit them — and what happens then depends on the exact spelling. Measured against a
base whose notice reads `Copyright © 2019 SIL International`:

| Author types | Emitted `LICENSE.md` |
|---|---|
| `SIL International` *(exact)* | `Copyright © 2019-2026 SIL International` — merged, range extended |
| `SIL Global` | **two lines** — `© 2019 SIL International` *and* `© 2026 SIL Global` |
| `SIL␣␣International` *(double space)* | **two lines** for the same entity |

The first is harmless. The second is arguably correct — they are different legal entities. The
third is the problem: an invisible typo produces two copyright holders for one organisation, in a
legal notice, and nothing in the UI shows the author what went wrong.

Dedupe is exact-match on purpose (decision D4): fuzzy matching would silently merge two genuinely
distinct organisations, and would collapse the in-progress `SIL International` → `SIL Global`
rename that 280 and 152 shipped keyboards respectively still use. So this cannot be fixed by
making the matching cleverer — it has to be prevented by telling the author.

**Suggested**: the help text for this question should state that the original author's copyright is
kept automatically and does not need re-entering. Engine has no way to convey that; only the
question can.

---

## Two ways to apply changes

The `il_*` modules import their text from the demoted Phase A modules, so the mechanism matters:

**A — edit the Phase A module** (`survey/questions/a/author_display_name.ts` etc.)
Changes both the live identity flow **and** the proposed `phase_a_identity` graph in the Flow Map
Library. Right for wording that is simply better in both places — items 1, 2 and 4 probably
qualify.

**B — override `prompt` / `help_text` in the `il_*` module**
Gives identity-lite its own wording and leaves the Phase A graph untouched. Right for text that is
only true in the new position — item 3 ("optional") and item 5 (derived-keyboard behaviour) are
identity-lite-specific, since the Phase A battery has no attribution accumulation behind it.

Recommendation: **A for 1, 2, 4; B for 3 and 5.**

Whichever route, existing assertions on this text will need updating — `flow-parity.test.ts` holds
a projected snapshot covering `prompt` and `help_text` for both flows, and a handful of tests match
on prompt strings (`IdentityLite.attribution.test.tsx`,
`editors/adapters/panelAdapters.test.tsx`, `PreviewShell.test.tsx`). All are mechanical.

## What Engine is NOT asking for

- No change to `required` flags — those encode decisions D1/D6/D7 and are load-bearing.
- No change to question order or routing.
- No new questions. Item 5 is a help-text fix, not another field.
