# Phase 0 Research: Context normalization group

Decisions that turn the spec into a buildable design. Code references were verified on `main` at `e6c52260` (2026-10-06). Spike evidence is in [spec.md § Evidence](spec.md#evidence-from-the-spike).

## R1. Where the step's input comes from: a static output repertoire

**Decision.** Add a pure, browser-safe `buildOutputRepertoire(ir)` in `packages/contracts/src/ir/outputRepertoire.ts`, a sibling of `buildProducedSet`. It returns exact produced clusters, not NFC code points. Atoms come from:

- **Rule outputs.** `char`, `index(store,n)` and `outs(store)` expand over the store's char items. `context`/`context(n)` expand over the context elements they echo.
- **Opaque rules.** `RawKmnFragment.producedOutput`, the parser's output sketch, unions option-guarded (`if()`) rules over all states.
- **Touch keys.** `U_XXXX[_YYYY]` ids (`decodeUnicodeKeyId`) and the outputs of rule-bound keys.
- **Base-layout fallback.** A new static US table (R4) for keys with no matching rule.

Clusters are then a **closure**: every atom that starts with a base character, followed by mark-initial atoms, up to the keyboard's maximum stack depth (the most marks seen in any single atom or rule context, capped at 3).

**Rationale.** Postfix keyboards build clusters across rules. `sil_yoruba8`'s `any(dot+nsl) + any(key.all) > index(dot+nsl,1) index(ac.all,2)` appends a mark to a letter already in the text, so `ẹ◌́` is in no single output. The closure must be a **superset** of what the keyboard really produces:

- A superset can only add maps for clusters nobody types. Those are harmless: they rewrite to a form the keyboard would produce anyway.
- A subset could miss a produced alternate and then *rewrite the keyboard's own output* (an FR-005 / FR-013 violation).

The harness (R8) checks the superset claim empirically per keyboard.

**Alternatives considered.**
- *Simulate as the spike did* (about 65,000 keystrokes per keyboard). Rejected: FR-017.
- *Modify `buildProducedSet`.* Rejected: its semantics are documented as frozen (`producedSet.ts:46-69`), and it flattens to NFC code points (`flushRun` :132), which loses the produced form FR-002 needs.
- *Exact reachability* (only letter+mark pairs some rule's context admits). Deferred. It is tighter and would cut rule counts for open-matrix keyboards, but it is harder to prove sound. Revisit only if SC-003 fails (R10).

## R2. Opaque stores block the repertoire (codec extension)

**Decision.** Extend the parser so a store-level `RawKmnFragment` (`parse.ts:997-1008`) carries an optional `storeSketch?: StoreItem[]`. It is extracted leniently, the same way `producedOutput` is for rules: `outs()` is flattened, SMP literals are kept as char items, and named deadkeys are kept as deadkey items. The repertoire resolves `index()`/`outs()` through the sketch when the store is opaque. If neither the store nor a sketch resolves, the step is **refused** (FR-012) with reason `opaque-output-store`. It is never generated from a partial repertoire.

**Rationale.** `sil_yoruba8`, the reference keyboard, defines `store(grv.all) outs(base) outs(grv) …`, and the parser makes such stores opaque. Without the sketch, the reference keyboard would be refused. The field is additive and optional on an IR type. That is not the locked `Pattern` contract (Constitution I), and it changes neither parse nor emit of the source (Constitution II: opaque nodes preserved, not dropped).

**Alternatives.** Teaching the codec to model `outs()` store items fully: larger, touches round-trip, out of scope. Refusing every keyboard with an opaque output store: rejects the reference keyboard.

## R3. Target form, ambiguity, conflicts

**Decision.**

- **Target (FR-002).** Each closure cluster *c* is its own target. Its NFC and NFD forms, where they differ from *c*, are alternates mapping to *c*.
- **Conflicts (FR-005).** An alternate that is itself in the repertoire is dropped.
- **Ambiguity (FR-004).** When an alternate maps to several clusters (same NFC form, different mark order), pick the one whose code-point sequence sorts first. Record it in the map as `ambiguous: [other forms]`.

**Rationale.** The spike's first attempts used a global policy, either NFD-then-compose-into-produced or NFC-then-split-unproduced, and each fit some keyboards and broke others:

- `sil_yoruba8` produces the non-NFC `e◌̩◌́`.
- `sil_cameroon_qwerty` produces the NFC `ẅ◌̧`.

Targeting the produced form directly removed every such failure. Sorting is deterministic (FR-015) and independent of iteration order.

## R4. Base-layout fallback table

**Decision.** Add an exported, browser-safe `US_BASE_LAYOUT: ReadonlyMap<vkey+shift, char>` in `packages/contracts/src/ir/usBaseLayout.ts`, covering unshifted and shifted printable keys. The existing private `US_TRIGGER_CHAR` (`deadkeys.ts:327`) is folded into it. The repertoire adds fallback characters for every key with no rule on the default layer, for both positional and mnemonic keyboards; for mnemonic keyboards this assumes the US OS layout.

**Rationale.** `reverseUsLayoutKey` maps the other way and imports the vendored engine, which cannot be bundled for the browser (`verify.ts:36-47`). Fallback characters were part of the spike's repertoire ("base fallback", per the user), and plain letters are the bases that marks attach to.

## R5. Rule packing

**Decision.** Port the spike's packer (`normgen.test.ts`, final version) into `packages/engine/src/pattern-apply/normalization-step/pack.ts`. It is a greedy set cover over five shapes, each emitted as IR rules over generated stores:

| Shape | Context → output |
|---|---|
| P0 | `any(H) any(M)…` → `index(F,1)… index(M,2)…`: rewrite the head, pass the marks through |
| T | `any(H) <literal tail>` → `index(E,1)…`: per tail |
| H | `<literal head> any(T)` → `index(E,2)…` (two-character maps) |
| P | `any(H) m1 any(M)…`: fixed first mark, the rest pass through |
| P2 | `any(H) any(Mid) m2` → `index(F,1) index(Mid,2)`: middle mark from a learned set |

A pass-through shape is admitted for a head only if (a) it can never match a repertoire cluster and (b) it agrees with every known map it covers (the safety check from the spike). Pass sets are learned from the maps, not the whole mark repertoire. That learning is what took `sil_tchad` from 77 rules to 49.

**Rationale.** It was measured on seven keyboards (spec Evidence). Greedy set cover is good, not optimal, and the spec explicitly accepts that (Out of scope).

**Note on Keyman semantics** (confirmed in the spike):
- `if()` occupies an `index()` offset.
- `index()` in context matches the same item as an earlier `any()`.
- A group may call itself.

The packer emits no `if()`.

## R6. Inserting and removing the step

**Decision.**

- **Insert.** Append a non-keys `IRGroup` named `generated_context_normalize`, holding the packed rules plus `match > use(<entry>)` and `nomatch > use(<entry>)`. Set `ir.header.entryPoints.main` to the new group. Generated stores are prefixed `generated_cn_`.
- **Remove.** Read the original entry back from the group's `nomatch > use(X)` target, restore `entryPoints.main = X`, and delete the group and its stores. That makes removal exact (FR-011) without an extra IR field.
- **Regenerate.** Always remove first.
- **Entry name.** Use `entryPoints.main`, **not** `entryGroupOf` (`ir-insert.ts:24`). `entryGroupOf` returns the first writable keys group, and the two can disagree.

**Rationale.** `emit.ts:709-714` writes `begin` from `entryPoints.main`, so this is the only redirect point. The marks guard (`mark-guards.ts`) chains *after* the entry group via `match > use(generated_marks_guard)`. The step sits upstream and does not interact with it.

**Context-only is mandatory** (FR-006). The spike verified that a `using keys` group with `nomatch > use(main)` does not pass the key to `main`: KeymanWeb's default output fires instead.

## R7. Authoring path and caching

**Decision.**

- **Generator.** `proposeNormalizationStep(ir): Promise<NormalizationStepResult>` in the engine. It is pure, simulates nothing, and returns either `{ kind: "step", group, stores, ruleCount, examples, maps, cacheKey }` or `{ kind: "refused", reason }`.
- **Cache key.** `cacheKey = sha256(emit(ir with any generated step removed)) + "|" + NORMALIZATION_STEP_GENERATOR_VERSION`, using `computeSha256Hex` (`codec/hash.ts:14`, Web Crypto, browser-safe).
- **Studio cache.**
  - *In memory:* a `Map<cacheKey, result>` lives in the analysis module.
  - *Persisted:* the result is written to an optional working-copy snapshot field `contextNormalizationStep?: { cacheKey, result }`, next to `contextToleranceOverlay` (`persistWorkingCopy.ts:197`). Fields are added there without bumping `DRAFT_VERSION`, matching existing practice (`draftTypes.ts:101,126,138`).
- **Lookup.** `analyseContextTolerance` (`contextToleranceAnalysis.ts:29`) checks the cache before calling the generator.
- **Fallback.** If the result is `refused`, it falls back to `proposeContextVariants` (FR-019).

**FR-017 scope.** The existing spec 078 diagnostic `computeContextTolerance` simulates. It runs in `launchContextTolerance` (`useKeyboardArtifact.ts:478-507`), unawaited, after each preview compile, outside the D3 cycle. This feature does **not** change that diagnostic. FR-017 is amended in the spec to cover deriving, generating and retrieving the *step*. Replacing the diagnostic with a static "maps would change N clusters" check is a recorded follow-up, not part of 086.

**Rationale.** It follows the facet-index model (per-source hash plus a generator-version stamp) but lives where authoring state already lives. There is no new timer (Constitution IV) and no host-disk write (Constitution V).

**Alternatives.**
- A committed per-keyboard step file for every corpus keyboard, read by the studio. Deferred: useful for corpus bases, but the static generator is fast enough (SC-005) that it is optional. The harness record (R8) is committed for *verification*, not as the studio's source.

## R8. Verification: the corpus harness, once per keyboard version

**Decision.** Add a `normalization-step` mode to `utilities/nfd-tolerance-corpus`. For each keyboard:

1. Generate the step through the engine (static).
2. Compile both builds.
3. Check typed output byte-identical over every one- and two-key sequence. The full key set is 47 keys × 4 modifier states, giving 35,532 sequences.
4. Probe each repertoire cluster's alternates with every key that acts on it, plus backspace and a control key.
5. Compare compile diagnostics, which must be equal (FR-010).

Keyboards that compile with errors but still emit KeymanWeb JS are **simulated anyway**, with the error sets compared. Today `simulable()` requires `success` (`analyze.ts:185-187`), which would skip `sil_yoruba8`.

Results go to a committed `docs/context-normalization-verification.json`, keyed per keyboard by source sha256 and `NORMALIZATION_STEP_GENERATOR_VERSION`, with `corpusCommit` in the manifest. It follows the facet-index freshness model (`utilities/facet-index/src/freshness.ts`):
- `--incremental` re-simulates only changed keyboards.
- `--check` exits non-zero when the record is stale.
- `--fail-on-regressed` fails on any typed-output difference (SC-006).

**Rationale.** It satisfies User Story 4 and FR-017: the simulation runs once per keyboard version, in CI, and never in the browser.

**Cost and scoping.** The spike spent 60–400 seconds per keyboard, dominated by the two-key typed check (2 builds × 35,532 sequences) and by exploration. Exploration disappears with the static repertoire. Across a corpus of over 700 keyboards, an unscoped run would still take more than a day. So:

1. **Cheap refusals first.** Keyboards whose repertoire has no alternates are refused before any compile (`no-alternates`, an expected majority).
2. **Narrower two-key check.** The typed check runs every single key, plus pairs whose *second* key is one some rule binds (its key part or `any(keystore)`). An unbound second key falls through to the base layout identically in both builds.
3. **Parallel first run.** The first full record is produced once, offline, with `--jobs N` parallelism, and committed.
4. **CI never runs the full corpus.** It runs `--check` (no simulation), and `--incremental` only re-simulates keyboards whose source or the generator version changed.

The real per-keyboard cost is measured in the first implementation task. If the first full run exceeds 2 hours with `--jobs 8`, the record is scoped to keyboards with a phonebook entry plus those with alternates, and the decision is recorded in this file.

**Note.** `ci.yml:226` duplicates the harness test step at `:208`. Remove the duplicate when wiring the new mode (out-of-scope cleanup, its own commit).

## R9. Studio surface (FR-020)

**Decision.** Reuse `ContextToleranceStation` (`survey/marks/ContextToleranceStation.tsx:111`). When the proposal is a step:

- The intro reads "Adds N rules. None of your rules change."
- A new `NormalizationExamples` list shows up to five pasted-form → result pairs, with character names. The names reuse the `ContextToleranceNotice` naming helper.
- Per-site ticks are replaced by a single confirm. It is still emitted through `FacetTransformPanel` with one site, `siteId = "normalization-step"`, so `applyFacetTransform`'s partial-acceptance path collapses to all-or-nothing.
- The decision trail keeps the question ids `marks.context_tolerance` and `marks.context_tolerance.sites` (`decisions/contextToleranceProposal.ts:25`).

The overlay (`context-tolerance-overlay.ts`) gains a `kind: "normalization-step"` batch holding the group, its stores and the original entry name. `applyContextToleranceOverlay` replays it in the projection (`projectWorkingCopyVfs.ts:841-851`). `removeContextToleranceOverlay` strips it before re-analysis.

**Rationale.** It is the smallest change to a shipped surface. Constitution IX holds because the station is already a manifest step; no new survey surface is created.

## R10. Risks

- **Rule counts may exceed the spike's (SC-003).** The static closure (R1) is a superset of the spike's simulated repertoire, so it can create maps the spike never saw. *Mitigation:* pass-through shapes absorb open matrices, and only unmatched, non-repertoire combos add rules. If SC-003 fails on a keyboard, tighten the closure with context reachability (R1, alternatives) before relaxing the criterion.
- **Superset soundness.** If the closure misses a produced cluster whose alternate is also produced, typed output can change. The harness (R8) fails the keyboard (SC-006); the authoring path still offers the step. *Mitigation:* the verification record marks such a keyboard `regressed`, and the studio does not propose the step for a keyboard whose record says so.
- **Other engines.** Only KeymanWeb was simulated (spec Open questions). Context-only groups chained through `match`/`nomatch` are standard Keyman, documented on help.keyman.com (`group`, `use`, `match`). Desktop verification is a release gate, not a planning blocker.
- **Large keyboards.** `vietnamese_telex` (about 72,000 rules) may blow the time bound. The generator enforces a budget (SC-005) and refuses with `time-bound` past it.
