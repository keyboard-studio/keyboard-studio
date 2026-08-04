# Contract: copyright parse / render

Phase 1 output. The two pure functions that carry all of this feature's risk. Every input
shape below was **observed in keymanapp/keyboards** — see
[corpus-scan.out.txt](../corpus-scan.out.txt). Nothing here is hypothetical.

```ts
/** Parse every copyright line out of a LICENSE.md. Pure. */
export function parseCopyright(licenseText: string): ParseResult;

/** Render a canonical MIT LICENSE.md from a copyright block. Pure. */
export function renderLicense(block: CopyrightBlock): string;

export type ParseResult =
  | { ok: true; block: CopyrightBlock }
  | { ok: false; reason: ParseFailure; line: string };

export type ParseFailure =
  | "no_copyright_line"   // file has no line matching /^copyright/i
  | "template_placeholder" // literal YYYY and/or an underscore-run holder
  | "no_holder";           // a year but no holder token
```

## P1 — Failure is a value, never a fallback

`parseCopyright` **must not** return an empty block for unreadable input. FR-010 forbids
emitting a `LICENSE.md` whose only holder is the current user; an `ok: true` with an empty
block makes that outcome the natural path. Failures are therefore explicit, and D5 blocks
emission on them.

The `line` field carries the offending text so the error can name it.

## P2 — Marker forms

All three occur and all must parse. `©` may arrive as the literal character or as `&copy;`.

| Input | `marker` |
|---|---|
| `Copyright © 2016 Foo` | `©` |
| `Copyright (c) 2016 Foo` | `(c)` |
| `Copyright (C) 2016 Foo` | `(C)` |
| `Copyright 2016 Foo` *(no marker, 16 `.kmn` values)* | `©` *(default on render)* |

## P3 — Year forms

| Input | `years` |
|---|---|
| `Copyright © 2016 Foo` | `[2016]` |
| `Copyright (c) 2016-2021 Foo` | `[2016, 2021]` |
| `Copyright (c) 2016, 2019 Foo` | `[2016, 2019]` |
| `Copyright © SIL International` | `[]` |

Hyphen, en dash, and em dash all separate ranges. `[2016, 2021]` stores the endpoints, not
the enumerated span — rendering restores `2016-2021`.

## P4 — Rejections (must NOT parse as success)

These are the traps. Each is shipped in the real repo.

| Input | Result | Why |
|---|---|---|
| `Copyright (c) YYYY _____________________` | `template_placeholder` | Unfilled template, in `release/`. `YYYY` is not a year; `____` is not a holder. |
| `Copyright © 2015` | `no_holder` | In `legacy/`. A year alone attributes to nobody. |
| `The MIT License (MIT)` only | `no_copyright_line` | Body with no notice. |

A holder consisting solely of underscores, whitespace, or punctuation is **not** a holder.

## P5 — BOM and whitespace

A leading UTF-8 BOM must be stripped before matching. It is the *only* difference between the
two distinct license bodies found across all 920 files, so failing to normalise it would
otherwise read as two licenses.

**Internal** holder spacing is preserved verbatim — `"FirstVoices, SIL International,  First
Peoples' Cultural Foundation"` has a double space, and 52 keyboards carry it. Only leading and
trailing whitespace is trimmed.

## P6 — Rendering

```
<holder lines, ordered per D3>
<blank line>
<canonical MIT body>
```

Each line renders as `Copyright <marker> <years> <name>`, where `years` is:

- `[]` → omitted entirely, so `Copyright © SIL International`
- `[2016]` → `2016`
- `[2016, 2021]` → `2016-2021` (hyphen; contiguous endpoints)
- `[2016, 2019, 2024]` → `2016, 2019, 2024`

The body is one frozen constant, BOM-free, byte-identical across every keyboard (FR-005).

## P7 — Round-trip stability

```ts
parseCopyright(renderLicense(block)).block === block   // for every block this feature emits
```

This is the load-bearing test, because a fork-of-a-fork re-parses output this feature wrote.
**No `release/` keyboard has two copyright lines today** — multi-holder files have no precedent
in the corpus, so the studio authors the first ones and is its own only upstream. Exotic
third-party multi-holder shapes are therefore *not* the risk; our own output is.

Stability also requires the D3 sort be **stable**, or re-emitting an unchanged keyboard would
churn `LICENSE.md`.

## P8 — Dedupe and year accumulation

Dedupe is by **exact `name` match**. On a repeat contribution by an existing holder:

```
before:  Copyright (c) 2016-2021 Original Author
         Copyright (c) 2024 Second Author
Second Author derives again in 2026:
after:   Copyright (c) 2016-2021 Original Author
         Copyright (c) 2024-2026 Second Author     <-- extended, NOT duplicated
```

Exact-match dedupe is deliberately conservative: `SIL International` and `SIL Global` are
different strings and stay separate holders. Fuzzy matching would silently merge two distinct
legal entities, or "helpfully" collapse the rename that D4 explicitly refuses to rewrite.

## P9 — Purity

No I/O, no clock, no randomness. The emit year is passed **in** as a parameter, never read from
`Date` inside these functions — otherwise the round-trip test is time-dependent and the
functions are untestable at a year boundary. This mirrors the existing constraint that workflow
scripts cannot call `Date.now()`.

## Fixture obligation (FR-014)

The fixture table is **harvested** by [corpus-scan.py](../corpus-scan.py), not hand-written,
and must include at minimum:

- one instance of each marker form (`©`, `(c)`, `(C)`, bare)
- single year, hyphen range, comma list, and year-less
- the compound-holder line with its double space
- all three P4 rejections
- a BOM-prefixed file
- a two-, three-, and four-holder block of this feature's own rendering (P7)
