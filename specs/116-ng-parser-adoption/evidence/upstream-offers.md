# Upstream offers to keymanapp/keyman (spec 116 T046, FR-014)

Draft texts for the three things this spec found while vendoring Keyman's next-generation `.kmn`
parser (`developer/src/kmc-kmn/src/ng-compiler`, commit `fb7afff8`, see
[PROVENANCE.md](../../../packages/engine/src/codec/ng/PROVENANCE.md)).

**Not filed.** Filing is outward-facing and needs the owner's approval. When approved, post each
as its own issue or PR against `keymanapp/keyman`, and record the link in the "Offered upstream"
column of PROVENANCE.md's local-patch table.

---

## 1. PR: faster lexer, same token stream

**Title:** `chore(developer): kmc-kmn next-generation lexer, dispatch on first character`

The next-generation lexer tries every scan recogniser at every offset, builds the line buffer by
concatenating each token, passes an options object per match, and allocates an `exec()` match
array per token. Over the 1,036 `.kmn` files in `keymanapp/keyboards` (`release/` and
`experimental/`) that is about 7.3 s of lexing in Node. With this change it is about 0.7 s, roughly
ten times faster. Lexing was about two thirds of the parser front end's time.

The change:

- Dispatch on the first character. A per-character candidate list is built lazily from the
  recogniser table, in table order, so precedence is unchanged. The lexer throws at load if a
  recogniser has no first-character rule, so a new recogniser can't be silently skipped.
- The line buffer is a slice of the source from the line start, not a per-token concatenation.
- `matchToken` takes its three flags positionally, with no options object per token.
- A sticky `regExp.test()` plus `buffer.slice(offset, lastIndex)` replaces `exec()[0]`.

**Evidence.** The token stream is identical to the unpatched lexer's, token by token (type, text,
line, column, line text), over every file in the corpus. We check this with a test that runs both
lexers side by side. We can contribute that test along with the change.

---

## 2. PR: opt-in `onTrivia` callback on the lexer

**Title:** `feat(developer): kmc-kmn next-generation lexer, optional callback for non-emitted tokens`

The lexer drops `COMMENT`, `WHITESPACE` and `CONTINUATION` tokens (`emit: false`), so the grammar
never sees them. That is right for compiling. But a tool that reads `.kmn` and writes it back,
such as an editor, a formatter or a converter, loses every comment.

This adds an optional third constructor argument, `onTrivia(token)`. It is called for every
`emit: false` token, in source order, with its line and column. An optional fourth argument, a set
of token types, limits the callback to those types. A caller that only wants comments then doesn't
build a `Token` for every whitespace run. With no callback, behaviour is identical to today: the
same emitted tokens, and no extra allocation.

We use it to keep comments when importing `.kmn` into an editable model. The `c` keyword counts as
a comment only where the upstream recogniser matches it, so a quoted `"c "` or a key name `[K_C]`
is never taken for one. That replaced a hand-written scan in our old reader.

---

## 3. Issue: `Parser.parse()` silently truncates at the first failing line

**Title:** `bug(developer): kmc-kmn next-generation Parser.parse() stops at the first line it can't parse, with no diagnostic`

**What happens.** When a line fails the grammar, the whole-file `Parser.parse()` returns the tree
built so far. It reports no error and gives no sign that the rest of the file was skipped.

**Repro.** `keymanapp/keyboards`,
`experimental/gff/gff_geez_emufi/extras/gff_geez_emufi-pua.kmn`. Line 1342 is

```
    + [K_TAB] > ''  fix 
```

It uses `fix`, which Keyman 19 removed, so the grammar rejects the line. That is expected. But
`Parser.parse()` returns a tree covering only the source up to that line: 51,249 of the file's
69,424 characters. The roughly 470 lines after it are gone, with no diagnostic. The same statement
appears again at line 1346.

**Expected.** Either a diagnostic naming the first line that failed, or recovery at the next
statement, so that one bad line doesn't lose the rest of the file. A compiler that silently drops
rules produces a keyboard that is missing behaviour, and nothing tells the author.

**Workaround we use.** We split the token stream at `NEWLINE` and parse each logical line with the
grammar's `line` production. A rejected line then costs only that line, and we report it.
