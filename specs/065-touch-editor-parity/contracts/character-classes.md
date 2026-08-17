# Reachable character classes — the SC-007 gap analysis

**Status**: contract · spec 065 US5 T044 · prerequisite for FR-032, T045

FR-032 says the editor proposes an id **or states why it cannot** — never silence. That is only
meaningful once "every character class an author can reach" is written down. This table is that
enumeration, and [T045](../tasks.md) is a table-driven test over it: **every row must yield either
a proposal or a stated `noProposalReason`.** A row that yields neither is the defect SC-007 exists
to catch.

The vocabulary this table resolves into is fixed by
[id-and-keycap-proposals.md](id-and-keycap-proposals.md) §1.1 (`KeyIdMintingPath` + `"inherited"`)
and §1.2 (`NoProposalReason`). This document adds no new outcomes — it asserts coverage of the
existing ones.

## What "reachable" means

A class is reachable if an author can put it in the key property panel's character field, or in the
assign flow, without editing files by hand. Two consequences:

- **Lone surrogates are out of scope.** The field carries a JavaScript string that came from a text
  input; an unpaired surrogate is not typeable and does not survive the round trip.
- **The physical-key and inherit paths are not character classes.** Steps 1 and 2 of §1.1 resolve on
  the *keyboard's* state, not on what the character is, so they short-circuit every row below. This
  table describes what happens when both have already declined.

## The table

| # | Class | Example | Outcome | Keycap form |
|---|---|---|---|---|
| 1 | **Plain character** — any single assigned, non-combining, non-emoji codepoint (`Ll`, `Lu`, `Nd`, `Po`, `Sm`, …) | `ø` U+00F8 | `unicode-default` → `U_00F8`, with the `T_` alternative | `character` |
| 2 | **Combining mark** — `Mn`, `Mc`, `Me` | U+0301 | `combining-mark-guard` (guard rule **in addition** to the producing rule) | `dotted-circle-carrier`, standalone offered as `alternative` |
| 3 | **Multi-codepoint string** — two or more codepoints, with no `Extended_Pictographic` content (a ZWJ or U+FE0F alone does not disqualify it — see row 7) | `ch`; `a` + U+0301; `ന` + U+0D4D + ZWJ | `multi-codepoint-string` | `character` (the whole string) |
| 4 | **Cased single letter, triple requested** — `caseTripleRequested` and a `\p{Ll}`/`\p{Lu}` counterpart exists | `e` with CAPS handled | `case-triple` | `character` |
| 5 | **Titlecase character** — General_Category `Lt` | `ǅ` U+01C5 | **Proposal**: `unicode-default` → `U_01C5`. If a triple was requested, `noCaseTripleReason: "titlecase-self-third-form"` states why there is no trio | `character` |
| 6 | **Free-standing modifier symbol** — `Sk` spacing accents and modifier letters | `` ` `` U+0060; `ˆ` U+02C6 | `unicode-default` — a spacing character, so nothing special for the id | `character` |
| 7 | **Emoji sequence** — carries `Extended_Pictographic` content **and** a joiner: ZWJ (U+200D) or an emoji-presentation variation selector (U+FE0F) | 👩‍💻; ❤️ | `noProposalReason: { kind: "emoji-sequence-unsupported" }` | — |
| 8 | **Variation selector alone** — the output is only U+FE0E/U+FE0F or a `VARIATION SELECTOR-n`, with no base | U+FE0F | `noProposalReason: { kind: "variation-selector-only" }` | — |
| 9 | **Unassigned codepoint** — a codepoint with no Unicode assignment | U+0378 | `noProposalReason: { kind: "unassigned-codepoint" }` | — |
| 10 | **Empty output** — the empty string, or a keycap that is a bare U+25CC carrier crediting no character | `""` | `noProposalReason: { kind: "empty-output" }` | — |

Rows 1–4 are the four paths `proposeKeyId` already handles and this feature does not change. Rows
5–10 are the gap this analysis exists to close: before it, each of them silently produced nothing.

## Notes that the table cannot carry

**Row 5 is a proposal, not a refusal.** A titlecase character gets an ordinary `U_` id — only the
*case triple* is impossible, because `caseCounterpart` tests `\p{Ll}`/`\p{Lu}` and an `Lt`
character is already its own third form. That is fail-safe by design, and this feature adds the
copy that says so rather than any engine logic (§1.2). It appears in this table because the author
who asked for a triple must not be met with silence.

**Row 7 subsumes part of row 3.** A ZWJ sequence *is* a multi-codepoint string, so the check order
matters: emoji-sequence detection runs **before** the multi-codepoint path, or a 👩‍💻 would mint a
`U_` id for its first codepoint's worth of meaning and quietly lose the rest.

**Neither joiner is emoji-exclusive, so row 7 needs both halves.** ZWJ is linguistically
load-bearing — Devanagari/Bengali/Kannada conjunct control, Sinhala and Malayalam chillu formation,
Arabic cursive joining — and U+FE0F appears in non-emoji variation sequences too. Row 7 therefore
requires `Extended_Pictographic` content *in addition* to the joiner; a Malayalam chillu
(`ന` + U+0D4D + ZWJ) is an ordinary row-3 string and gets an id. Keying row 7 on the joiner alone
refuses a legitimate key with `emoji-sequence-unsupported`, which is a refusal the author cannot
act on.

**Row 8 is narrower than row 7.** A base character followed by a non-emoji variation selector (a
CJK ideographic variation sequence, say) is row 3 — a legitimate multi-codepoint string. Row 8 is
only the degenerate case where a selector arrives with nothing to select on.

**Row 9 is about assignment, not about support.** An assigned codepoint no font on the machine can
draw is still row 1: the id is well-defined and the keyboard is valid. Only genuine non-assignment
gets a stated refusal — the id would be meaningless, not merely unrenderable.

**Row 10 is what makes the dotted-circle edge case honest.** A keycap of bare U+25CC credits no
character (id-and-keycap-proposals.md §1.2), so there is nothing to propose an id *for*. Saying so is
the requirement; proposing `U_25CC` would be inventing a key that types a dotted circle.
