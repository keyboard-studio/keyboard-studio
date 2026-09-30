# Data model: keyboard attribution (037)

Phase 1 output. Entities live in `@keyboard-studio/contracts`; the parse/render behaviour is
specified in [contracts/copyright.md](contracts/copyright.md).

---

## CopyrightHolder

One copyright line's worth of information.

```ts
/**
 * A single copyright holder as recorded in a LICENSE.md line.
 *
 * `name` is VERBATIM as written in the source. It is never normalised, cased,
 * trimmed of internal spacing, or rewritten — "SIL International" and "SIL Global"
 * are distinct holders, and 280 vs 152 release keyboards use them respectively
 * during an in-progress rename. Rewriting one to the other modifies a legal notice.
 */
export interface CopyrightHolder {
  /** Holder text exactly as it appeared, e.g. "FirstVoices, SIL International,  First Peoples' Cultural Foundation". */
  name: string;
  /** Years attributed to this holder, ascending, deduped. MAY be empty (2 corpus lines carry no year). */
  years: number[];
  /** Marker style as found, so re-emission of an inherited line is byte-identical. */
  marker: "©" | "(c)" | "(C)";
  /** True when this holder came from a base rather than the current session. Drives D3 ordering. */
  inherited: boolean;
}
```

**Why `marker` is retained**: FR-007 requires inherited lines be carried **verbatim**. The
corpus uses all three forms (`©` 597, `(c)` 316, `(C)` 7). Normalising an inherited line's
marker would alter the notice; new lines get the project's chosen default.

**Why `years` is an array, not a range**: the corpus has single years (197), hyphen ranges
(720), and one comma-separated list. An array is the only shape that round-trips all three
without losing information — a range is a rendering choice over `[2016, 2021]`, not a storage
shape. See the rendering rule in the contract.

## CopyrightBlock

```ts
/**
 * The ordered, deduped set of holders for one keyboard — the ONLY part of a
 * LICENSE.md that varies between keyboards. The license body is a constant
 * (all 920 release LICENSE.md files are MIT with one canonical body).
 */
export type CopyrightBlock = readonly CopyrightHolder[];
```

**Invariants** (asserted by the round-trip test, FR-006):

1. No two holders share the same `name` — dedupe is by exact `name` match.
2. Ordering per D3: `inherited` holders first; within a group, year-less first (stable), then
   by earliest year ascending.
3. `parse(render(block)) === block` for every block this feature can produce.

## Attribution

The captured, persisted answer set — one per keyboard, on the working copy.

```ts
/**
 * Attribution captured during the walk. Persisted with the working copy so it
 * survives a reload (034 US3), and it is the SINGLE source feeding LICENSE.md,
 * IRHeader.copyright, and the .kps <Copyright>/<Author> fields (FR-003), so the
 * three cannot drift the way 22 shipped keyboards have.
 */
export interface Attribution {
  /** Person or group who made the keyboard. Prefilled from the GitHub profile `name`; never the bare login handle. */
  authorName: string;
  /** Optional contact. Null when the GitHub profile email is private — must never block emission. */
  authorEmail?: string;
  /**
   * Free-text copyright holder (D1). Defaults to `authorName` when the author
   * leaves it blank. One field, not a structured joint-ownership model — the
   * corpus expresses joint holders as prose within a single line.
   */
  copyrightHolder: string;
}
```

**No `year` field** — deliberate, per D2. The year is derived when the package is emitted, so a
draft resumed across a year boundary cannot carry a stale one.

**Not stored: the inherited block.** Inherited holders are derived from the base's `LICENSE.md`
at emit time (D4 precedence), not copied into `Attribution`. Storing them would create a
second source of truth that could drift from the base actually in the working copy.

---

## Where each field lands

| Field | `LICENSE.md` | `IRHeader.copyright` | `.kps` |
|---|---|---|---|
| `copyrightHolder` + emit year | new holder line | `store(&COPYRIGHT)` via codec | `<Info><Copyright>` |
| `authorName` | — | — | `<Info><Author>` |
| `authorEmail` | — | — | `<Author URL="mailto:…">` |
| inherited holders | preserved lines | (see D8) | — |

`IRHeader.copyright` is a **required existing field** (`contracts/src/keyboard-ir.ts:158`) that
the codec already parses (`parse.ts:980`) and emits (`emit.ts:268`). Populating it is the whole
of the `.kmn` work — no codec change, and no raw `.kmn` text manipulation, per Article II.

## Relationship to KeyboardIR

`Attribution` is **session state, not IR**. It lives alongside the working copy the way survey
phase results do; only its *projection* (`header.copyright`) enters the IR. This keeps
Article I intact (no `Pattern` field touched) and Article III intact (one working copy, no
second store).
