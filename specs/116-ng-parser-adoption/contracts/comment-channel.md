# Contract: comment side-channel (FR-010 to FR-014)

Keyman's lexer marks `COMMENT`, `WHITESPACE` and `CONTINUATION` as `emit: false`
(`scan-recognizer.ts`, the last entries of `KMN_SCAN_RECOGNIZERS`), so the grammar never sees them.
This spec keeps that, so the grammar file stays identical to upstream, and captures what is discarded
alongside the token stream.

## What is captured

| Record | Captured when | Fields |
|---|---|---|
| `CommentRecord` | the `COMMENT` recogniser matches | `text`, `line`, `column`, `kind` (`"line"` if no emitted token precedes it on the physical line, else `"trailing"`) |
| `ContinuationRecord` | the `CONTINUATION` recogniser matches | `line`, `logicalLine` |
| `BlankLineRecord` | a physical line holds only whitespace | `line` |

`text` is the comment body: the characters after the `c` keyword and its single separating space,
verbatim. A bare `c` gives `""`. This is the same text the current reader stores in `IRComment.text`
and `trailingComment` (to be confirmed per fixture by the comparison suite).

The `c` keyword is recognised only where the upstream recogniser matches it. This is
quote-aware and key-name-aware by construction, because quoted strings and `[K_C]` are consumed by
earlier recognisers. That replaces `stripTrailingComment`'s hand-written scan.

## How it is captured (decision: research R1, finding 5)

**One lexer pass with a local patch.** `Lexer` gains an optional `onTrivia(token)` callback, which
fires for every token the recogniser table marks `emit:false`: comments, whitespace and
continuations. It fires in source order with the token's line and column, and it doesn't change which
tokens are emitted. Default behaviour, with no callback, is identical to upstream.

The patch ships together with the lexer performance work. It is listed in `PROVENANCE.md` and offered
upstream as an opt-in hook (FR-014). The two-pass wrap was rejected because the corpus trial run
shows lexing is about two thirds of reader time, and a second pass would double it.

## Anchoring (unchanged rules, new input)

Lowering applies the current reader's rules, keyed on logical lines:

1. A `trailing` record on a rule or store line becomes that node's `trailingComment`.
2. A run of `line` records directly above a rule or store line, with no blank line between, becomes
   `IRComment{anchor:"leading", anchorRef}` on that node.
3. Everything else becomes `IRComment{anchor:"freestanding"}`, with `sourceLine` = the record's line.
4. A comment on a continued physical line anchors to the logical statement it belongs to. A
   `trailing` comment on the last physical line becomes the node's `trailingComment`. One on an
   earlier physical line is kept as a leading comment of that node, with its line recorded, so emit
   puts it back. Research R2 checks this against what the current reader does with the same input.
   Whatever the current reader does is the target for Phase 3.

## Acceptance

Across corpus and fixtures, the comparison suite compares `ir.comments` (text, anchor, anchorRef
target, sourceLine) and every node's `trailingComment` between the two readers. Phase 3 closes only
at zero differences.
