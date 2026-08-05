# Fixture provenance — `bambara`

Verbatim copy of the `bambara` keyboard's source files, used by
[`../../kmp.test.ts`](../../kmp.test.ts) to prove that `buildKmp()` resolves a
**real** package descriptor's member references against the VirtualFS.

| | |
|---|---|
| Source repo | [`keyboard-studio/keyboards`](https://github.com/keyboard-studio/keyboards) (the project's canonical corpus fork — see CLAUDE.md) |
| Source path | `release/b/bambara/` |
| Commit | `fd5ae18e4be4781e62f0140b639116bfe7a4e792` |
| Keyboard author | Sekou Goro |
| License | MIT (see `LICENSE.md`) |

## Files and why each is here

| File | Why |
|---|---|
| `source/bambara.kps` | **The point of the fixture.** Hand-writing a descriptor would pin our own assumptions instead of reality. This one exercises all three path shapes at once: `..\build\<id>.kmx\|.js\|.kvk` (up out of `source/`), `welcome.htm` / `readme.htm` (siblings), and `..\LICENSE.md` (up to the repo root). |
| `source/bambara.kmn` | Compiled during the test to produce the `.kmx`/`.kvk`/`.js`. Declares `&TARGETS 'any'` (so a `.js` is emitted) and `&VISUALKEYBOARD` (so a `.kvk` is), which is exactly why its descriptor lists all three. |
| `source/bambara.kvks` | Required for the compile to actually emit the `.kvk` the descriptor lists. |
| `source/welcome.htm`, `source/readme.htm` | Doc members the descriptor names. |
| `LICENSE.md` | The `..\LICENSE.md` member — the one reference that escapes `source/` to the root. |

## Deliberately absent

No `.kmx`, `.kvk`, or `.js` binaries are committed. The test compiles them from
`bambara.kmn` via the engine's own `compile()`, so it also pins that the two
halves of the pipeline — `.kmn` compile and `.kmp` package — actually fit
together. That integration is the real risk; a committed binary would hide it.

## Refreshing

Re-copy from the corpus checkout and update the commit above:

```
cp ../keyboards/release/b/bambara/source/{bambara.kps,bambara.kmn,bambara.kvks,welcome.htm,readme.htm} source/
cp ../keyboards/release/b/bambara/LICENSE.md .
```

If the upstream descriptor's `<Files>` list changes shape, `kmp.test.ts`'s
expected member list changes with it — that assertion is the proof the paths
resolved, so update it deliberately rather than loosening it.
