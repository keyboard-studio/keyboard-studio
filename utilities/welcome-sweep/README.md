# welcome-sweep

The offline corpus sweep behind spec 076's **SC-002**: every folder-convention base in
the `keymanapp/keyboards` corpus preserves its welcome page and 100 % of its welcome
images through adaptation ([specs/076-documentation-completeness](../../specs/076-documentation-completeness/spec.md),
research R13).

It runs the **real** engine code — the loader's welcome resolution
(`fetchKeyboardSourceToVfs`, fed by a disk-backed fetch instead of the Vite proxy) and
the **real** descriptor writer (`buildKpsContent`) — against each
`release/<x>/<id>/source/welcome/` folder in the sibling `../keyboards` checkout, and
asserts for each base:

1. it resolves as the folder convention with a welcome page;
2. every `welcome\…` image its `.kps` lists **and** ships on disk is carried into
   `baseWelcomeImages`;
3. the descriptor the projection would generate lists the page and every carried
   image as `welcome\…`, and never the flat `welcome.htm`.

Reported as `[WARN]` notes, not failures (they are the base's own defects, and the
output must still build): images the `.kps` lists but the base does not ship, images
the welcome page references that were not carried, and files on disk the `.kps`
never listed.

## Running

Plain node, imports the **engine dist** — build it first:

```sh
pnpm --filter @keyboard-studio/engine build
node utilities/welcome-sweep/run.mjs                 # whole corpus, errors + summary only
node utilities/welcome-sweep/run.mjs --verbose       # one line per base, plus notes
node utilities/welcome-sweep/run.mjs --only ahom_star
node utilities/welcome-sweep/run.mjs --limit 25 --keyboards ../keyboards
```

Exit code `0` when every base passes, `1` on any failure, `2` on a setup problem
(missing engine dist or corpus). Output uses `[OK]` / `[WARN]` / `[ERROR]`, no emoji.

Not part of the default CI lane: the corpus is a sibling-repo dependency
([docs/tooling.md](../../docs/tooling.md#standalone-utilities)). Run it on demand after
touching the loader's welcome resolution, the descriptor's `<Files>` list, or the
projection's welcome-folder write, and record the pass count in the commit message.
