# Success-criteria evidence: Identity in the package

**Feature**: 059-identity-in-package · **Branch**: `059-identity-in-package` · **Recorded**: 2026-08-03

Task T044. One row per success criterion from [spec.md](spec.md), with the named
evidence that satisfies it. A criterion is **met** only where the evidence is a test,
a check, or a structural property that fails loudly on regression — not where the code
merely looks right.

## Gate state at the time of recording

| Command | Result |
|---|---|
| `pnpm typecheck` | clean, all 7 projects |
| `pnpm -r test` | 8 528 passed, 2 skipped, 0 failed (contracts 533, engine 2 516, studio 5 174, keyboard-lint 82, glottolog 42, llm 9, oauth-backend 160) |
| `pnpm lint` | green — ESLint, `depcruise` (939 modules, no violations), `crew-lint` 7/7, `facet-lint`, `facet-index-lint`, `adaptation-catalog-lint`, `i18n-catalog-lint`, `content-i18n-freshness`, `content-i18n-lint`, `test-antipattern-lint` |

`pnpm lint` initially failed on a **pre-existing** stale `node_modules` (declared
`eslint-plugin-jsx-a11y` was not installed); `pnpm install --frozen-lockfile` fixed it
with no change to `package.json` or `pnpm-lock.yaml`.

---

## SC-001 — the author finds their language and code in the downloaded package, on either track

**Met.**

- Copy track: [`serializeWorkingCopy.descriptor.test.ts`](../../packages/studio/src/lib/serializeWorkingCopy.descriptor.test.ts)
  "replaces the base's declared language with the author's" asserts on the VFS handed
  to `toZip` — i.e. the tree the archive is built from.
- Adapt track: same file, "contains a descriptor declaring the author's language and
  name, without one being seeded".
- Both assert the language **and** the display name, which are the two things SC-001
  names.

## SC-002 — zero delivered packages declare the base keyboard's language

**Met**, and enforced at three levels rather than asserted once:

1. **Structural** — `buildKpsContent`'s signature has no parameter through which a base
   tag could arrive. The pre-057 `languages: string[]` is gone
   ([`build.ts`](../../packages/engine/src/package-descriptor/build.ts)); the writer
   receives only `PackageDescriptorIdentity`. Pinned by
   [`build.test.ts`](../../packages/engine/src/package-descriptor/build.test.ts)
   "never declares a base keyboard's tag, because it is never given one".
2. **Total replacement** — [`patch.test.ts`](../../packages/engine/src/package-descriptor/patch.test.ts)
   "replaces the base's language TOTALLY, leaving only the author's" asserts the
   language element list `toEqual` exactly one element, so a descriptor declaring both
   `fr` and the author's tag fails.
3. **End-to-end** — `serializeWorkingCopy.descriptor.test.ts` (both tracks) and the
   Track-1 walk in [`copy-edit.spec.ts`](../../packages/studio/e2e/copy-edit.spec.ts),
   which now asserts the archive's `.kps` declares exactly one `<Language>`, carrying
   the author's composed tag and their language's English name.

The blank-code path is covered separately, because "no author tag" must degrade to the
`und` placeholder and **never** reach for the base's: `build.test.ts` "uses the
well-formed und placeholder when the tag is absent", `projectWorkingCopyVfs.test.ts`
"declares the und placeholder, never the base's tag, on a blank code".

## SC-003 — zero delivered packages lack a package descriptor

**Met.** The adapt track — the one that shipped none — is covered by
`serializeWorkingCopy.descriptor.test.ts`, whose seeder **deliberately takes no
`kpsContent` parameter**. That is the point: the pre-057 tests passed one in, which is
how a missing descriptor coexisted with a green suite (FR-017 / E-7). The descriptor is
generated during projection when absent
([`patch.ts`](../../packages/engine/src/package-descriptor/patch.ts) `applyIdentityToKps`),
and the generation is **named** in the download path's warnings rather than silent
(FR-006) — asserted by "names the generation on the download path rather than doing it
silently".

## SC-004 — for every identity answer that reached the artifact, the trail names the changed file

**Met.** [`DecisionEntryRow.test.tsx`](../../packages/studio/src/decisions/DecisionEntryRow.test.tsx)
"names the package descriptor as the changed file once resolved";
[`impact.test.ts`](../../packages/studio/src/decisions/impact.test.ts) row 3 of the
precedence table asserts the resolved impact's `files` is `["source/kb.kps"]`.

"None report an unavailability reason once a working copy exists" is the precedence
table's own shape: `no-working-copy-yet` is returned *only* when
`hasWorkingCopy()` is false (`impact.test.ts` rows 3 and 4 are the paired assertions).

## SC-005 — preview, archive, and pull request agree

**Met by construction, and asserted.** The descriptor is written at **projection step
3.6** ([`projectWorkingCopyVfs.ts`](../../packages/studio/src/lib/projectWorkingCopyVfs.ts)),
which is the single helper both `serializeWorkingCopy` (zip + PR) and
`useWorkingCopyTransform` (OSK preview) delegate to. There is no second write site —
audited independently and confirmed: the only `.kps` writers are the two permitted
callers plus the pre-existing `<Version>` regex patch (see SC-005's own guard test,
`serializeWorkingCopy.descriptor.test.ts` "gives the pull-request tree and the zip tree
the identical descriptor", which compares the two byte-for-byte).

The contract's "`serializeWorkingCopy` must NOT grow a descriptor write of its own"
holds (T042).

## SC-006 — expanding one identity entry computes an impact for that entry and no other

**Met by construction.** [`useEntryImpact.ts`](../../packages/studio/src/decisions/useEntryImpact.ts)
gates its effect on `expanded`; there is no batch form and no signature accepting a
list. Asserted by `DecisionEntryRow.test.tsx` "resolves nothing on mount, and only the
expanded entry on expand", and by `impact.test.ts` "has no batch form". The pre-existing
053 FR-021 tests (`impact.test.ts` "rendering a stage roll-up resolves no entry's
impact") still pass unchanged.

A stored capture resolves **synchronously** so a long-recorded fact never flickers
through the pending state — `DecisionEntryRow.test.tsx` "renders a stored capture
synchronously, with no pending state".

## SC-007 — the audit's account and the artifact's content never disagree

**Met.** Both sides of every counterfactual come from `projectWorkingCopyForOutput`,
differing in exactly one pure `identityOverride`
([`counterfactualProjection.test.ts`](../../packages/studio/src/decisions/counterfactualProjection.test.ts)
"projects exactly twice, differing in exactly one overlay field").

The two attribution mechanisms are shown to **agree on the same artifact**:
[`snapshotSource.test.ts`](../../packages/studio/src/decisions/snapshotSource.test.ts)
"agrees with the counterfactual account of the same descriptor" asserts the boundary
capture and the counterfactual name the same file, in the same direction, with the same
magnitude. And the boundary account re-applies to reproduce the shipped text exactly
("re-applies to produce the revised descriptor exactly").

Volatile content is excluded on **both** sides through one shared module
([`projectedText.ts`](../../packages/studio/src/decisions/projectedText.ts)), so FR-013
cannot go stale in one comparer only.

## SC-008 — a false shipping promise is caught by a repository check, not by inspecting a package

**Met, and demonstrated to fail on the defect.**
[`outputReach.test.ts`](../../packages/studio/src/survey/questions/outputReach.test.ts)
runs under `pnpm --filter @keyboard-studio/studio test` (and so under `pnpm test`).

Verified by **temporarily reverting the defect**: removing `outputs` from
`il_language_code` made the check fail with

```
"il_language_code" tells the author "goes on the finished keyboard" but declares neither
an output reach nor an IR write.
    PREFERRED: make the promise true — write the answer somewhere and declare it …
    FALLBACK: change the text so it no longer promises something that does not happen.
    LAST RESORT: add "il_language_code" to PROMISE_CHECK_EXEMPT with a one-line justification …
```

3 of 8 assertions failed; the file was restored immediately afterwards. The remedies are
listed in the spec's order of preference — make the promise true, not make it quieter
(FR-018).

`PROMISE_CHECK_EXEMPT` ships **empty**, and that is asserted rather than merely looped
over, so the test cannot pass vacuously.

---

## FR-018 — resolved the preferred way (T040)

`il_language_code`'s help text — "This is the standard code for the language you picked
— it goes on the finished keyboard" — **needed no edit**. It is now true: the answer
composes into `IdentityLiteResult.bcp47`, crosses into the working copy via
`projectNameOptions.onCommit`, and is declared as the descriptor's `<Language ID>`. The
Content-team text edit named as the fallback was not required, and `outputReach.test.ts`
holds the promise true from here on.

---

## Deviations from the task list, stated

1. **T017/T039 landed in a new file**,
   `packages/studio/src/lib/serializeWorkingCopy.descriptor.test.ts`, rather than in
   `serializeWorkingCopy.test.ts` as tasks.md names. That file mocks
   `projectWorkingCopyVfs` — correctly, since it tests the arguments
   `serializeWorkingCopy` assembles — and the descriptor is written *by* the projection.
   A descriptor assertion there could only pass by seeding the descriptor, which is
   exactly what FR-017 forbids. The new file runs the **real** projection and stubs only
   `toZip`, to capture the tree the archive is built from.

2. **T019 required no behaviour change.** The version agreement holds because step 3.6
   generates the descriptor with `identity.version` (the bumped value), asserted by
   "keeps the descriptor's keyboard version in agreement with the bumped source". What
   T019 did surface was a **false comment** in `serializeWorkingCopy.ts` claiming "Track
   2 imports an existing keyboard that will have a `.kps` already" — the E-6 premise.
   That comment is corrected; the `<Version>` patch itself is unchanged.

3. **A behaviour change outside the descriptor, and worth flagging.** Populating
   `identity.bcp47` on the copy track (FR-001) means Track 1 now has a language tag for
   the first time. `useCarveNeededSet` keys its CLDR/SLDR exemplar lookup on that tag and
   settles synchronously only when there is **no** language to look up — so the
   pre-carve convenience step's gate, previously always immediate on Track 1, is now
   genuinely asynchronous. This is the step working as designed (it holds its gate until
   exemplars settle); it was simply unreachable on Track 1 before, for the same root
   cause this feature fixes. 19 step-routing tests asserted the landing synchronously and
   now await it (`StudioShell.test.tsx`, `stepHost.goldenWalk.test.tsx`). The golden-walk
   fixtures are **unchanged**: the settle is awaited inside the recorder's step window,
   so the transparent steps' store calls stay attributed to the step that triggered them.

4. **The scaffolder's placeholder now declares one base language, not all of them**
   (`base.languages[0]`), because the descriptor declares exactly one language. It is a
   placeholder that step 3.6 replaces before anything ships. `scaffolder.test.ts`'s
   assertion moved accordingly, with the reasoning recorded at the test.

## Follow-ups deliberately not taken

- **A shared "locate the `<Keyboards><Keyboard>` scope" helper.** `patch.ts` and
  `serializeWorkingCopy.ts`'s `<Version>` patch each hand-roll that scoping regex, with
  slightly different tolerances. Not a live defect — both only ever run against
  descriptors this writer produced — and sharing across the engine/studio boundary for
  two call sites is not yet worth the coupling. Worth doing if a third such patch appears.
- **`patchKpsIdentity` does not rewrite an attribute-form `<Name value="…"/>`.** Real
  Keyman descriptors use element text (`<Name URL="">text</Name>`), which is what both
  writer paths emit, and the loader never fetches a base's raw `.kps` — so an
  attribute-form descriptor cannot reach this code through either documented caller.
