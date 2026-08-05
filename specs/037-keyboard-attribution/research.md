# Research: keyboard attribution and license provenance (037)

Phase 0 output. Resolves the six Open Questions from [spec.md](spec.md) and records the
codebase findings that shape the Phase 1 design.

**Status of these decisions** *(updated 2026-08-04, after implementation)*: originally PROPOSED by
the engine side, grounded in the corpus scan ([corpus-scan.py](corpus-scan.py) /
[corpus-scan.out.txt](corpus-scan.out.txt)) and in existing project positions.

**All are now IMPLEMENTED and load-bearing in shipped behaviour**, so they are no longer cheap to
overturn — each has tests and, in D3/D4's case, emitted-artifact consequences:

| | Where it is now load-bearing |
|---|---|
| D1 | blank copyright holder defaults to the author name |
| D2 | `emitYear` is a parameter, and the pure functions never read the clock |
| D3 | holder ordering in every emitted `LICENSE.md` |
| D4 | `LICENSE.md` authoritative; exact-match dedupe keeps `SIL International` and `SIL Global` distinct |
| D5 | download is BLOCKED on an unreadable base notice, with a manual-entry escape hatch |
| D6 | the author-name question is the one required field |

The user ruled directly on the US2 substance ("the base author's notice with the new author added
to it, not replacing it"), which D3/D4/D7/D8/D9 all serve. D4 and D5 were the two flagged as
wanting a deliberate ruling and were implemented as proposed; overturning either is now a real
change rather than a note. D4's exact-match dedupe has a known consequence for authors — see
[HANDOFF-CONTENT.md](HANDOFF-CONTENT.md) item 5.

---

## D1 — One free-text copyright holder, prefilled (resolves OQ-1)

**Decision**: Capture **one free-text copyright holder string**, plus a separate author display
name. The holder defaults to the author name when left blank. No multi-holder entry UI.

**Rationale**: The corpus settles this. What look like multiple holders are single copyright
*lines* with compound holder text:

```
FirstVoices, SIL International,  First Peoples' Cultural Foundation   (52 keyboards)
Galaxie Software and SIL Global                                        (6 keyboards)
thamizha.com and SIL Global                                            (4 keyboards)
```

No `release/` `LICENSE.md` has two copyright lines. Authors already express joint ownership as
prose inside one line, so a free-text field matches practice exactly, and a structured
multi-holder editor would model something the corpus never does.

This also respects the project's standing preference for the minimum number of questions: one
prefilled field the author confirms, not a form.

**Author vs holder are distinct fields** because they land in different places — `.kps
<Author>` (442 keyboards populate it) versus `.kps <Copyright>` (917 do). They are frequently
different: an individual authors, an organisation holds.

**Alternative rejected**: structured `{ individual, organisation }`. Cannot represent
`"Galaxie Software and SIL Global"` without inventing a joint-ownership model no shipped
keyboard uses.

---

## D2 — The year is emit-time, not scaffold-time (resolves OQ-2)

**Decision**: Derive the copyright year when the package is **emitted**, not when the keyboard
is scaffolded. Do not persist a year on the working copy.

**Rationale**: Today `generateStubs` calls `new Date()` at scaffold time, so a keyboard
scaffolded in December and published in January carries the wrong year. A copyright notice
records when the work was published. Deriving at emit is both more correct and simpler — one
less persisted field, and no staleness to manage across the resumable draft
([034](../034-mvp-authoring-walk/spec.md) US3).

**Consequence, accepted**: resuming a months-old draft across a year boundary yields the later
year. That is the desired behaviour, not a defect.

---

## D3 — Inherited holders precede the current author; year-less sort first, stably (resolves OQ-3)

**Decision**: Two-tier ordering.

1. Holders **inherited from the base** always precede the current author's line.
2. Within the inherited group, order by earliest year ascending; holders with **no year sort
   first**, preserving their relative source order (a stable sort).

**Rationale**: Ordering by earliest year makes the provenance chain readable, but 2 corpus
`LICENSE.md` lines and 556 `.kmn` values carry no year, so "earliest year" alone is
undefined for them. Tier 1 resolves it on semantics rather than arbitrary choice: anything
inherited from a base *predates the current derivation by definition*, whatever its stated
year. A year-less inherited holder is therefore safely "older", not "unknown".

Stability matters because re-emitting the same keyboard must produce a byte-identical
`LICENSE.md` (FR-006 round-trip stability); an unstable comparator would churn the file.

---

## D4 — `LICENSE.md` is authoritative; `header.copyright` is the fallback (resolves OQ-4)

**Decision**: When `LICENSE.md` and the `.kmn` `COPYRIGHT` store disagree, **`LICENSE.md`
wins**. If `LICENSE.md` is absent, fall back to `header.copyright`. Record the disagreement in
a diagnostic; never merge the two into two holder lines.

**Rationale**:
- MIT's own text refers to *"the above copyright notice"* — the notice in the license file is
  the operative legal statement.
- It is the better-formed source: **918 of 920** `LICENSE.md` lines carry a year, against
  **366 of 922** `.kmn` values. The `.kmn` store is a holder with usually no date.
- The 22 observed disagreements are almost entirely the in-progress `SIL International` →
  `SIL Global` rename applied to one file and not the other, i.e. drift, not two genuine
  holders. Merging them would fabricate a second rights holder from a typo.

**Never merge** is the important half. `balochi_phonetic` would otherwise emit both
`SIL Global` and `SIL International` as separate holders of the same work.

**Worth a deliberate ruling** — it is a legal-interpretation call, not a technical one.

**STATUS 2026-08-04**: implemented as written and now load-bearing. The exact-match dedupe this
decision requires has a consequence for authors — see [HANDOFF-CONTENT.md](HANDOFF-CONTENT.md)
item 5.

---

## D5 — Unparseable base license blocks emission, with an entry escape hatch (resolves OQ-5)

**Decision**: If a base's `LICENSE.md` exists but yields no parseable copyright line, **block
emission** and surface an actionable error naming the base and the offending line. Offer the
author a field to enter the original holder manually, which unblocks. Apply this to **both**
the ZIP and PR paths.

**Rationale**: The stated principle is fail loud rather than silently strip, and the failure
being guarded against — emitting a `LICENSE.md` whose only holder is the modifying user — is a
licensing defect, not a cosmetic one. A warn-and-proceed path produces exactly that artifact.

**Both paths, not just PR**: a downloaded ZIP is redistributable, so the obligation is
identical. Gating only the PR path would leave the compliance hole open via download.

**The escape hatch is what makes a hard block acceptable**: the author is never stuck, and the
remedy (type the original holder) preserves the notice rather than dropping it. Real cases this
fires on, all shipped in `release/`:

```
Copyright (c) YYYY _____________________     unfilled template
Copyright © 2015                             year, no holder (legacy/)
```

**Worth a deliberate ruling** — it is the one decision that can stop a user completing a walk.

**STATUS 2026-08-04**: implemented as written, including the escape hatch
(`ScaffoldOptions.baseHolderOverride`), and now load-bearing — download is blocked while a base
notice is unreadable.

---

## D6 — Guests must type an author name (resolves OQ-6)

**Decision**: A guest with no GitHub session **must** supply an author name before emission.
No placeholder is emitted.

**Rationale**: The alternative reproduces the corpus's own bug — `Copyright (c) YYYY
_____________________` is a real shipped `release/` file, created exactly this way. One
required field is a smaller cost than shipping an unfilled notice.

For signed-in users this field is prefilled from the GitHub profile (D7) and merely confirmed,
so the required-field cost falls only on guests, who have supplied no identity by any other
means.

---

## D7 — GitHub `/user` already returns the name; retain it (no new request)

**Finding**: `verifyToken` ([output/github.ts:156](../../packages/engine/src/output/github.ts))
parses the `/user` response as `{ login?: string }` and discards everything else. GitHub
returns `name` and `email` in that same payload.

**Decision**: Widen the parsed type to retain `name` and `email`. Attribution is then
propose-then-confirm, consistent with how language identity already works
([034](../034-mvp-authoring-walk/spec.md) FR-002: never a blank BCP47 form).

**Caveats**: `name` is null when the user never set a profile name — fall back to asking, not
to the bare `login` handle (a handle is not a copyright holder). `email` is null when private;
it is optional metadata and must never block.

---

## D8 — The codec already round-trips `COPYRIGHT`; write the IR field, not `.kmn` text

**Finding**: The IR spine already models this. `IRHeader.copyright: string` is a **required
field** ([contracts/src/keyboard-ir.ts:158](../../packages/contracts/src/keyboard-ir.ts)),
`parse.ts:980` populates it from `store(&COPYRIGHT)`, and `emit.ts:268` lists `COPYRIGHT`
among the header stores it writes.

**Decision**: Satisfy the `.kmn` half of FR-003 by populating `header.copyright` on the IR.
The codec emits the store. **No codec change, and no raw `.kmn` string manipulation** — which
is what Article II requires anyway.

**Correction to the spec's Context table**: it states the `.kmn` has "no `COPYRIGHT`". That is
true only of the *scaffolder's literal stub template* (`generateStubs` writes a `.kmn` string
containing `NAME / VERSION / KEYBOARDVERSION / TARGETS` and nothing else). The codec supports
the store fully. Consequence: a keyboard **derived from a base** likely already preserves the
base's `COPYRIGHT` through parse → emit, because stubs are write-if-absent and the base's
`.kmn` is used instead; a keyboard from the bare stub path gets none.

### D8 VERIFIED 2026-08-04 — the inference above was WRONG, and the truth is worse

Task T010 measured it instead of assuming. The `.kmn` is **not** more correct than `LICENSE.md`;
it is actively destructive. `resetIdentity`
([scaffold-ir.ts:174](../../packages/engine/src/scaffolder/scaffold-ir.ts)) **overwrites** the
parsed copyright:

```ts
const copyright = identity.copyright ?? `Copyright © ${currentYear()} ${displayName}`;
...
ir.header.copyright = copyright;
setSystemStore(ir, "COPYRIGHT", kmnStringEscape(copyright));
```

Observed end to end (parse → scaffoldIR → emit) against a base carrying
`store(&COPYRIGHT) '© 2016-2021 Original Author'`:

| Stage | `header.copyright` |
|---|---|
| after `parse()` | `© 2016-2021 Original Author` |
| after `scaffoldIR()` | `Copyright © 2026 My Keyboard` |
| emitted `.kmn` store | `store(&COPYRIGHT) 'Copyright © 2026 My Keyboard'` |
| original author retained? | **NO — stripped** |

**Three consequences that change the work:**

1. **There are TWO fabrication sites, not one.** `scaffolder/index.ts:352` (`LICENSE.md`) and
   `scaffold-ir.ts:174` (the `.kmn` store) independently build the same wrong
   `Copyright © <year> <displayName>` string. FR-003's single source of truth must replace both,
   or they will keep drifting exactly as the 22 corpus keyboards already do.
2. **A real notice is destroyed, not merely absent.** `parse()` reads the base's copyright
   correctly and `resetIdentity` then discards it. The MIT retention problem is therefore live
   in the `.kmn` today, not only in `LICENSE.md` — which raises US2's severity from "missing
   provenance" to "strips an existing notice".
3. **The fix has a seam that already exists.** `identity.copyright` is an optional field on
   `ScaffoldIRIdentity`, and passing it overrides the fabricated default — verified in the same
   run. No new plumbing through `scaffoldIR` is needed; the work is computing the right value.

**Correction to D2**: `currentYear()` is called inside `resetIdentity`, which runs at *scaffold*
time. So the wrong-year bug is real in the `.kmn` as well as in `LICENSE.md`, and D2's move to
emit-time must cover both sites.

---

## D9 — Copyright as data with pure parse/render

**Decision**: Model the copyright block as structured data in `@keyboard-studio/contracts`
with pure `parseCopyright` / `renderLicense` functions, rather than assembling strings at emit
time. See [data-model.md](data-model.md) and
[contracts/copyright.md](contracts/copyright.md).

**Rationale**: Every behaviour the feature needs falls out of the data: dedupe is a lookup,
year-range extension is arithmetic, chronological ordering is a sort, and round-trip stability
is testable in isolation. The risky part — the regex against messy real-world input — becomes a
pure function with a fixture table harvested from the corpus (FR-014), rather than logic
embedded in the scaffolder where it can only be tested end-to-end.

**One canonical body**: the scan found all 920 files are MIT with exactly **2 distinct bodies,
differing only by a UTF-8 BOM**. So the body is a single constant with BOM normalised on
input. No license detection (FR-005).

---

## Summary of decisions

| ID | Resolves | Decision |
|---|---|---|
| D1 | OQ-1 | One free-text holder + separate author name; holder defaults to author |
| D2 | OQ-2 | Year derived at emit, never persisted |
| D3 | OQ-3 | Inherited holders precede current author; year-less first, stable sort |
| D4 | OQ-4 | `LICENSE.md` authoritative; `header.copyright` fallback; never merge |
| D5 | OQ-5 | Unparseable base license blocks emission, with manual-entry escape hatch; both paths |
| D6 | OQ-6 | Guests must type an author name; no placeholder emitted |
| D7 | — | Retain `name`/`email` from the `/user` call already made |
| D8 | — | **VERIFIED**: `resetIdentity` OVERWRITES the base's copyright, stripping a real notice. Two fabrication sites, not one. Fix via the existing `identity.copyright` seam |
| D9 | — | Copyright as data; pure parse/render; one canonical MIT body |
