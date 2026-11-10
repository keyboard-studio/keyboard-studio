# Spec 118 baseline (T001, T002)

Captured 2026-11-10 on branch `118-replayed-ir-output`, unchanged source tree (only
`specs/118-.../.spec-context.json` modified). Node v22.23.1, win32, Intel Core Ultra 9 275HX x24,
vitest jsdom (not a browser). `../keyboards` at the CI pin (see T002).

## T001a. Golden outputs (FR-030)

### Fixture `fullSpine` (committed, already consumed by a test)

Files: `packages/studio/src/lib/__fixtures__/flagParity/fullSpine.kmn` (1703 bytes) and
`fullSpine.keyman-touch-layout` (301 bytes). Consumer: `packages/studio/src/lib/projectWorkingCopyVfs.flagParity.test.ts`
(asserts `projectWorkingCopyVfs` output `=== ` the golden bytes).

| file | sha256 |
|---|---|
| fullSpine.kmn | `bf81d4121e7611c41a4ac8caa8bf0816eb808b699c593eb6fd8c3056fb0380ad` |
| fullSpine.keyman-touch-layout | `fd56777ee3a5a24da31fe8519dca73210f54af48e73930b43056a51dff1a44d5` |

Reproduce: `pnpm --filter @keyboard-studio/studio exec vitest run src/lib/projectWorkingCopyVfs.flagParity.test.ts`
(20/20 passed on the unchanged tree; from `packages/studio`: `pnpm exec vitest run <path>`).

### Reference keyboard `sil_euro_latin` (projection hashes)

The reference keyboard is `sil_euro_latin` (the spec 093 SC-004 keyboard), set up exactly as
`packages/studio/src/decisions/rebuildPerf.measure.ts` does (Track 1 `instantiateFromStart`, adapt decision
flow, one full `rebuildWorkingCopyFromStores`, character-inventory Phase B record), then
`projectWorkingCopyForOutput()` (the projection `buildOutputBundle` consumes; compiled artifacts are staged
only later on the download path, so they are not part of this projection).

Per-file sha256 of every projected VFS entry, sorted by path, is committed as
`evidence/reference-keyboard-projection.sha256` (45 files, aggregate over the sorted
`<hash>  <path>` lines = `594de1d61d582c2d3f6ba37bd54cb7ec92c36f866142f5567ddc684ebc03e9e1`).
Deterministic: the same aggregate came out of 3 independent runs. Source `.kmn` 12701 chars; projected
`.kmn` 12698 chars; 9 recorded decisions.

Reproduce: no committed script produces the hashes. I used a throwaway copy of `rebuildPerf.measure.ts`
that, right after `expect(setupKmnLength).toBeGreaterThan(0)`, called `projectWorkingCopyForOutput()`
and sha256-hashed each `out.vfs.entries()` content (utf8 for strings), sorted rows by path, hashed the
joined rows with `\n`. The copy was deleted. NOTE: `console.log` from the measure harness is not shown in
vitest output in this environment (nothing appears in stdout); the throwaway wrote to a file instead.
A later task that needs a standing gate should promote this into a `*.test.ts` that reads the `.sha256`
manifest (not done here; no test consumes the manifest yet).

## T001b. Rebuild timings (FR-032, SC-006 target: edit < 300 ms, draft restore < 2 s)

Command (from `packages/studio`, needs `../keyboards` and a built engine/contracts):
`pnpm exec vitest run --config vitest.measure.config.ts src/decisions/rebuildPerf.measure.ts`
(15 measured runs after 3 warmups; median reported). Scenarios: edit = warm incremental
`rebuildWorkingCopyFromStores` after flipping `standard-letters` + project + read `.kmn`;
resume (= draft restore) = cold full replay over a restored decision snapshot + project + read `.kmn`.
The timed region includes the projection, as the harness defines it. Measured via a copy of the harness
(identical timed code, plus the untimed hashing above and a JSON file dump), two independent runs:

| run | edit median / mean / min / max (ms) | resume median / mean / min / max (ms) |
|---|---|---|
| 1 | 522.18 / 529.81 / 488.64 / 576.56 | 550.98 / 547.44 / 518.82 / 571.89 |
| 2 | 602.69 / 603.29 / 568.62 / 644.94 | 603.69 / 597.71 / 558.75 / 631.16 |

Findings and caveats:
- Run-to-run spread is about 15 percent on one machine; treat ~520-600 ms as the edit baseline and
  ~550-600 ms for resume. Phases should compare against this band, not a single figure.
- The edit baseline is already ABOVE the 300 ms SC-006 target on this tree (jsdom, Node, not a browser).
  Resume is well under the 2 s target. Warm edit is not faster than cold resume here, which suggests the
  projection step dominates both (not separated out; unverified).
- The original harness `rebuildPerf.measure.ts` itself was not run unmodified (its output cannot be
  seen); it was not changed. Spec 093 `perf-baseline.md` figures were not found in this tree
  (`specs/093-derived-keyboard/perf-baseline.md` absent, archived), so no comparison to the 093 numbers.
- No browser timing was taken.

## T002. Corpus pin and blocking edges

- `KEYBOARDS_CORPUS_SHA` in `.github/workflows/ci.yml` line 54 = `435f82d69bfc926eb03c2d8632571b41b6da3266`;
  `../keyboards` HEAD = `435f82d69bfc926eb03c2d8632571b41b6da3266`. EQUAL (confirmed).
- Spec 117 (typed rule shape): exists only on `origin/117-typed-rule-shape` (also a local worktree branch),
  NOT merged to `origin/main` (`git merge-base --is-ancestor` says not merged). Contents: spec.md and
  checklist only; `.spec-context.json` `currentStep: specify`, `status: specified`. Commits:
  `e1c2a1c8 specify`, `552ec0ca B2 revises spec 103's guard placement`. The ordering in spec 117 is
  B1 (explicit keystroke) then B2 (typed left-hand side). No plan, tasks or code yet, so the
  explicit-keystroke change has NOT landed. Phase 2 of spec 118 (pattern application, plan.md line 84/96)
  and the task at tasks.md line 83 are blocked on an unbuilt change: the edge is real.
- Spec 105 (derived working copy): `specs/105-derived-working-copy/tasks.md` has only Phase 0
  complete (T001-T008 checked, PR #2292 recorded as "NOT merged"; later commit `8b71f6de` merge of #2332
  "ack spec 105"). Phases 1-9 (T101 onward) have 0 checked boxes, 51 unchecked tasks. No
  `AS-BUILT.md`. Phase map: 1 starting point, 2 deadkeys, 3 carve, 4 physical layout/mechanisms,
  5 touch layout, 6 spec-104 touch identity, 7 docs/identity/overlays/raw-KMN, 8 survey residue,
  9 envelope v3 + store reduction. So spec 105's Phases 4 and 7 have not started: the blocking edges for
  spec 118 Phases 4 and 7 are real. Whether Phase 0 of 105 is on `origin/main` was not verified beyond
  the git log hits above.

## T017. Rebuild timings after phase 3 (FR-032)

Same harness and protocol as T001b (15 measured runs, 3 warmups), one run via a throwaway copy that writes the
report to a file (deleted afterwards). Phase 3 routes every `.kmn` write and every output path through the emit
stage; no replay change.

| run | edit median / mean / min / max (ms) | resume median / mean / min / max (ms) |
|---|---|---|
| phase 3 | 199.51 / 199.71 / 162.20 / 236.90 | 197.91 / 199.29 / 152.06 / 242.06 |

- No regression against the T001b band (edit 520-600, resume 550-600). The absolute drop is larger than a phase that
  changed no replay should explain; it is most likely machine load at the baseline run, so read it as "not slower",
  not as a speed-up. Edit is under the 300 ms SC-006 target on this run; one run only, no browser timing.
