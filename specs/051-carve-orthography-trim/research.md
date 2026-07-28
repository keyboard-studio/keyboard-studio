# Phase 0 Research — 051 Carve orthography trim

Resolves the NEEDS CLARIFICATION items from [plan.md](plan.md)'s Technical Context **and** the spec's five open
questions (OQ-1…OQ-5). Grounded in the code on `main` at `88cd2a9d`.

---

## R1 — FR-001/FR-002 are already satisfied; they need tests, not code

**Decision.** Do not change the proposal domain. Add regression tests pinning it.

**Rationale.** `recommendedRemovalChars` ranges over `buildProducedSet(ir)`
([irToCarveNodes.ts:1913](../../packages/studio/src/lib/irToCarveNodes.ts)), and `buildProducedSet`
([producedSet.ts](../../packages/contracts/src/ir/producedSet.ts)) walks **`rule.output` only** — never
`rule.context`. Store expansion happens exclusively from `index()` / `outs()` **output** elements. An
`any()`-consumed input store is therefore never expanded into the produced set, and an input-only character is
never a trim candidate.

So FR-001 ("compare produced characters against the needed set") and FR-002 ("input characters are not
independently compared") describe the shipping behaviour. This materially shrinks the feature: the produced-vs-input
error the spec describes is **not** in the domain, it is downstream in the collateral guard (R2).

**Consequence.** Two characterization tests, so a future refactor of `buildProducedSet` cannot silently regress
this: (a) a character appearing *only* in an `any()`-consumed store is absent from `buildProducedSet`; (b) it never
appears in `recommendedRemovalChars`.

---

## R2 — The ɨ defect, located exactly

**Decision.** The single defective predicate is `coordinatedDropHitsNeededChar`
([irToCarveNodes.ts:1506-1518](../../packages/studio/src/lib/irToCarveNodes.ts)):

```ts
const partners = resolveCoordinatedPartnerItems(mode, itemsIndex, storesByName);
return partners.some(({ item }) =>
  isCharCoveredForLocale(item.value, needed, bcp47 ?? '', form),
);
```

It asks only *"does a coordinated partner slot hold a needed character?"* — with no regard for whether that
partner is an input or an output store, and no regard for whether the character has another producer. For the
Cameroon `dkf`/`dkt` pair, trimming `ɨ` (an output slot) resolves the partner `dkf#i` holding `i`, which is
needed, so the predicate returns `true`.

That `true` propagates to both consumers, which is why the spec sees one symptom in two places:

- `recommendedRemovalChars` sets `dependsOnNeeded = true` and `continue`s
  ([irToCarveNodes.ts:1956](../../packages/studio/src/lib/irToCarveNodes.ts)) — so `ɨ` is never *proposed*.
- `annotateRemovalRecommendations` uses the same predicate for the node-level signal — so the tile is never
  *flagged*.

NFR-001 (the two signals must agree) is satisfied structurally, by both calling the one predicate. Keep it that
way: fix the predicate, not its call sites.

**FR-003 restated as the implementable conjunction.** A partner slot counts as "removing a needed character" iff:

```
partnerIsOutputStore(partner)                        // (a) index()/outs() target, not any()-consumed
  AND producerCountOf(partnerChar) <= 1               // (b) this slot is its only producer
```

`.some()` over partners with that predicate. For ɨ/`i`: (a) is false (`dkf` is `any()`-consumed), so no shield —
US1-AS1. For a partner that *is* an output store holding a needed character with no other producer: both hold,
shield stands — US2-AS1. For a needed character produced elsewhere too: (b) is false — US2-AS3.

---

## R3 — Where do the two engine facts come from?

**Decision (a) — store role.** `StoreUsageFlags` gains `asIndexOutputTarget: boolean`, set by `analyzeStores`.

`analyzeStores` ([applyStoreSlotRemovals.ts:236](../../packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts))
already records `asAnySource`, `asNotAny`, and `asContextIndex` during its single rule scan, and it already visits
every output `index()` element at line 297 (`ensureNode(el.storeRef)`). Setting one more flag there is a
one-line addition inside a loop that already runs. `outs()` targets are recorded at line 294
(`outsReferencedNames`) and count as output targets too.

Not derivable from what exists: `pairSets` membership is symmetric (union-find joins the output store *and* its
`any()` source), and `unresolvedIndexOutputNames` holds only the *unresolved* ones. There is currently no way to
ask "is this store an output target?" — hence the new flag rather than a derivation.

**Decision (b) — producer count.** A new `buildProducerIndex(ir): ReadonlyMap<string, number>` in
`packages/engine/src/pattern-apply/producerIndex.ts`, computed in **one** pass over the IR and hoisted per-IR by
the caller.

Why not `collectCharContributors(ir, Y).storeSlotIds.length`: that function merges input-store and output-store
slots into one flat array by design (its own header, "OUTPUT + INPUT STORE SLOTS (#525 v2)"), so the count would
be inflated by pure input occurrences — exactly the conflation FR-003 exists to remove. And it is O(rules) per
character, which inside the `recommendedRemovalChars` loop is O(chars × rules); the `#931` perf note in that
function warns against precisely that shape.

`buildProducerIndex` counts, per NFC character: whole-rule producers (rules whose entire output is that character)
plus **output**-store slots holding it, excluding S-02 trigger rules — the same producer notion
`collectCharContributors` uses, minus the input side.

**Decision (c) — role on the contributor record.** `CharContributors` gains an additive
`storeSlots: { slotId: string; role: 'input' | 'output' }[]`. (As shipped this is a narrower union than the
four-way `StoreRole`, deliberately: a single slot is reached by one branch or the other, so `'both'`/`'unused'`
are not inhabitable at slot level — the "output dominates" rule resolves a slot reached both ways.)
`storeSlotIds` keeps its current meaning and contents, so
every existing call site (`cascadeDelete`, `coordinatedCollateralForSlots`, `buildPendingCascade`, the restore
path) compiles and behaves unchanged. New logic reads `storeSlots`.

**Alternatives considered.** Changing `storeSlotIds` to the richer shape — rejected: it is passed positionally
into `cascadeDelete(ruleNodeIds, storeSlotIds)` and threaded through the studio in half a dozen places; a
breaking change there buys nothing that an additive field doesn't.

---

## R4 — OQ-1: what counts as "another producer"?

**Decision.** Yes — the producer count ranges over the **whole keyboard**: plain rules *and* output-store slots in
any mechanism, including other deadkeys. A needed character emitted by two different deadkey fan-outs has another
producer and is not shielded.

**Rationale.** FR-003(b)'s question is "will this character still be producible after the trim?" That is a
property of the keyboard, not of one mechanism. Scoping the count to plain rules only would re-introduce a
narrower version of the same conflation this feature removes — a character reachable solely through two deadkeys
would be treated as unproducible and shield trims it shouldn't.

Two exclusions, both inherited from `collectCharContributors`' existing semantics so the two notions of "producer"
cannot drift:

- **S-02 trigger rules** (`isDeadkeyOnlyOutput`) are not producers — they emit a deadkey state token, not a glyph.
- **Opaque `RawKmnFragment`s** are not counted as producers. They are already handled by a *stronger* rule: any
  blocked contributor shields the candidate outright ([irToCarveNodes.ts:1936](../../packages/studio/src/lib/irToCarveNodes.ts)),
  so an opaque producer never reaches the producer-count test. Counting them would be unsound anyway — the codec
  cannot statically confirm what they emit.

---

## R5 — US3 needs a reproduction before a patch

**Decision.** Slice 3 starts by reproducing the "nothing changes colour" report against a real fixture. The plan
fixes the *invariant* and the *reason path*; it does not pre-commit to a specific line change.

**Rationale.** The id channel is more consistent than the spec's account suggests, so the obvious diagnosis is
probably not the real one:

- Fan-out glyph tiles are minted with `gid = ${outputStore.nodeId}#${i}`
  ([irToCarveNodes.ts:293](../../packages/studio/src/lib/irToCarveNodes.ts), "gid contract (locked)") — the same
  `<storeNodeId>#<itemsIndex>` string `collectCharContributors` returns and `StoreCharChip.chipId` uses.
- `cascadeDelete` unions rule ids and slot ids into **one** item channel
  ([CarveGallery.tsx:486](../../packages/studio/src/editors/carve/CarveGallery.tsx)).
- Confirmed collateral partner slot ids are already folded into the same `cascadeDelete` call — an explicit prior
  P1 fix, with a comment naming this exact symptom ("the Gallery kept showing the collateral char as KEPT").

So gid/slot-id mismatch is largely ruled out. Two live candidates remain:

1. **The primary symptom is US1, not a rendering bug.** `ɨ` is shielded, so it is never proposed; an author who
   then trims it manually sees the *proposal/annotation* layer stay unchanged, because that layer is still
   shielding it. Fixing R2 removes the symptom without touching rendering.
2. **The plain-toggle fast path.** `buildPendingCascade` returns `null` — plain single-gid toggle via
   `handleToggleGlyph` — when `removableCount <= 1 && blocked.length === 0 && collateral.length === 0`
   ([CarveGallery.tsx:174](../../packages/studio/src/editors/carve/CarveGallery.tsx)). If a character has a second
   producer that is *not* in `removableRuleIds` (e.g. filtered as not-removable), only the clicked tile flips and
   the other stays lit, with no dialog to explain why. That is FR-008's gap.

**What the plan commits to regardless of which it is**, both executable:

- **Invariant (FR-007):** after any applied trim, `{tiles showing removed}` ⊇ `{ids in the trimmed contributor
  set}`. Asserted as a test over rendered state, not by inspecting the store.
- **Reason path (FR-008):** every trim request terminates in one of exactly three outcomes — applied, applied-with-
  explicitly-retained-producers (each with a reason), or refused-with-reason. "Dialog closes, nothing visibly
  happens" is not a reachable outcome.

### R5 outcome (T020) — candidate 1 confirmed; candidate 2 is unreachable by construction

**Reproduced against the post-Phase-3 build. The symptom was US1 shielding, not a rendering bug.** No patch was
invented; slice 3 reduced to its two invariant tests exactly as the plan allowed for.

Candidate 2 (the `buildPendingCascade` plain-toggle fast path flipping only the clicked gid) does not exist. The
fast path fires only when `removableCount <= 1 && blocked.length === 0 && collateral.length === 0`, and a second
producer cannot satisfy all three:

- a second *removable* producer — rule id or store slot — is counted in `removableCount`
  (`removableRuleIds.length + found.storeSlotIds.length`), pushing it to 2, so the dialog opens;
- a second *not-removable* producer is filtered out of `removableRuleIds` but lands in `blocked`, which is also a
  dialog trigger — and the dialog names it with its `capabilityHint` reason;
- any coordinated partner lands in `collateral`, likewise a dialog trigger.

So the fast path only ever fires when the clicked tile IS the whole trim. Both FR-007 (rendered-state invariant,
incl. `kept`/`total`) and FR-008 (all three outcomes) pass with **no production change** — they are pinned as
regression tests in `CarveGallery.test.tsx` so the property cannot silently rot. Consequently **T022 required no
code change** beyond a comment recording the invariant at the fast path, and **T023 added no message ids**: the
reasons FR-008 requires were already carried by `capabilityHint` and the existing "Marked not-removable" copy.

---

## R6 — Where does case pairing live?

**Decision.** A studio module `packages/studio/src/lib/carveCasePairs.ts`, built on the engine's `caseCounterpart`.
Not in the engine.

**Rationale.** The engine already owns the only domain fact — what a character's case counterpart is. The rest is
*carve policy*: which characters are trimmed together, and when a shared uppercase retires. That policy is
specific to the carve gallery's produced set and its trim units; it is not a general fact about a keyboard.

This also matches the precedent set for the mechanism galleries' case-pair companion, which likewise consumes
`caseCounterpart` from the studio rather than pushing UI policy into the engine
([MechanismGallery.tsx:2088](../../packages/studio/src/editors/assignLoop/MechanismGallery.tsx)). Both surfaces
calling the same engine primitive is what makes "the two surfaces never disagree about what a case pair is" (spec
Definitions) true by construction.

NFR-004's intent is respected: the IR facts (store role, producer count) are engine-side; case *pairing policy*
is not an IR fact.

---

## R7 — OQ-4: is many-to-one real, or a bad example?

**Decision.** The issue's example is wrong, but the phenomenon is real. FR-013's reference-set model stays, and
the tests are grounded in actual Unicode folds rather than synthetic ones.

**The example is wrong.** Greek `α` U+03B1 uppercases to `Α` U+0391 (Greek capital alpha), not Latin `A` U+0041.
Latin `a` and Greek `α` do **not** share an uppercase.

**Genuine many-to-one through `caseCounterpart`** (verified — each lowercase is `\p{Ll}`, each fold yields exactly
one `\p{Lu}` code point, so `caseCounterpart` returns non-null for all six):

| Lowercase pair | Shared uppercase |
|----------------|------------------|
| `s` U+0073 · `ſ` U+017F (long s) | `S` U+0053 |
| `i` U+0069 · `ı` U+0131 (dotless i) | `I` U+0049 |
| `μ` U+03BC · `µ` U+00B5 (micro sign) | `Μ` U+039C |

`i`/`ı` is the locale-sensitive case the spec anticipated, and it is many-to-one under the **locale-insensitive**
fold (no `bcp47`, or a non-Turkic one). Under `tr` it splits into two 1:1 pairs (`i`→`İ`, `ı`→`I`) — so the same
fixture exercises both the shared-uppercase path and the locale-sensitivity of FR-011 depending on the identity
tag. That makes it the primary US4 §3–4 fixture.

**Not usable as a fixture:** the `ǳ`/`ǲ`/`Ǳ` digraph triple. `ǲ` U+01F2 is `\p{Lt}` (titlecase), not `\p{Ll}`, so
`caseCounterpart` returns null for it by guard 2 — only `ǳ`→`Ǳ` pairs. Correct behaviour, but it does not produce
a shared uppercase.

**Consequence.** US4 §3–4 tests use `s`/`ſ`→`S` (script-neutral, no locale interaction) as the primary case and
`i`/`ı`→`I` as the locale-sensitive one. No synthetic PUA fixture is needed.

---

## R8 — OQ-2, OQ-3, OQ-5

**OQ-2 (FR-005 copy).** The strings to replace are at
[CarveGallery.tsx:213-215](../../packages/studio/src/editors/carve/CarveGallery.tsx). Today all collateral shares
one warning box whose severity is driven by `anyNeeded`. FR-005 splits it by **partner role**:

- *output* partner holding a needed char with no other producer → warning, current copy, keep `role="alert"`;
- *input* partner → informational, naming the transform that stops firing:
  "The `i` → `ɨ` deadkey combination will no longer fire." — `role="status"`, not `role="alert"`.

Both drop the leading `⚠` emoji (Article VIII). Final wording is content-team owned; km-domain should confirm it
reads correctly for AltGr fan-outs as well as deadkeys, where "combination" may not be the right noun. Flagged in
tasks, not blocking — a placeholder id with the above English ships and can be reworded without code change.

**OQ-3 (prune the now-dead input slot?).** **Leave it — the pair splices, and that is intentional.**
`applyStoreSlotRemovals`' coordinated drop already removes both members at the index; the input slot does not
survive as dead weight, so there is nothing extra to prune. The change FR-005 makes is purely in how that drop is
*described* to the author: informational, not a loss warning. Recorded here so a reviewer does not read the
unchanged splice behaviour as an oversight.

**OQ-5 (paired proposal granularity).** **All-or-nothing per proposal row, matching the mechanism galleries'
companion**, which is confirm/decline over the whole pair. Rationale: FR-014 exists to stop the author reconciling
two rows; re-introducing per-case opt-out inside the row rebuilds the thing it removes. The author who genuinely
wants to keep `É` while dropping `é` is not blocked — they decline the paired proposal and trim `é` manually
through the existing per-chip cascade, which is unchanged and still per-character. Worth one line of UI copy on
the row so that escape hatch is discoverable.

---

## Open items carried into implementation

- **NFR-004 wording fixed** (T030) — [spec.md](spec.md) now states the real invariant: the engine must not
  import the studio, while the studio imports the engine throughout.
- **US3 reproduction outcome recorded** — see [R5 outcome (T020)](#r5-outcome-t020--candidate-1-confirmed-candidate-2-is-unreachable-by-construction)
  above; slice 3 reduced to the FR-007 invariant test plus the FR-008 reason path, with no production change.
- **OQ-2 (FR-005 informational copy) is resolved** (T031, km-domain read). Verdict: "combination" is the right
  mechanism-neutral noun — it covers a deadkey sequence and an AltGr fan-out equally, where "sequence" would
  wrongly exclude the simultaneous press and "chord"/"shortcut" are engineer jargon. Two register fixes applied:
  "will no longer fire" (event-system jargon) became "will no longer work", and the passive "itself stays
  typeable" became the active "You can still type X on its own", which lands the reassurance FR-005 exists to
  give. Placeholder count, order and roles unchanged.
- **OQ-5's escape hatch is preserved by design** — decline the paired row, trim one case via the existing
  per-chip cascade. The one line of UI copy making it discoverable shipped in T029
  (`editor.assignLoop.removalBanner.pairEscapeHatchHint`).

### Where the FR-013 retire rule actually runs (as-built; T027 described it differently)

T027's task text says the *cascade handlers* resolve `caseTrimSet`. As built, the retire rule runs one step
earlier — at **proposal** time, inside `recommendedRemovalChars`' case fold — and the gallery consumes the
already-resolved `caseGroup`. Same single implementation (`caseTrimSet`), one call site, no duplicated rule.

This ordering is not cosmetic. The first fold collapsed any two rows sharing an uppercase *without* consulting
the retire rule, which broke the exact many-to-one case issue #1357 is about: with produced `{ s, ſ, S }` and
`ſ` in the orthography, it proposed trimming `s` + `S` together and left `ſ` with no uppercase. Applying the
rule at proposal time means a shared uppercase whose referent survives is never *offered* — neither folded into
a pair row nor listed as a row of its own. Two distinct lowercases that merely share an uppercase (`s` and `ſ`)
are likewise never folded together; they are not counterparts of each other. Regression tests:
`recommendedRemovalChars — shared uppercase retires last (spec 051 FR-013)`.

### Shipped so far (Phases 2–5)

- `asIndexOutputTarget` and `storeRoleOf` added to the store analysis.
- `buildProducerIndex` — new engine module.
- `CharContributors.storeSlots` — additive, role-tagged.
- `coordinatedDropHitsNeededChar` narrowed to the FR-003 three-part conjunction.
- `CoordinatedCollateralChar` gained `role` and `isLost`.
- The collateral UI split into an alert box (`isLost`) and a status box (input partner).
- FR-006 backstop added on the banner bulk path.
- T018 found **no ordering gap**: the existing shield order in `recommendedRemovalChars` (needed.size===0 early
  return, then surplus/always-keep, then blocked/no-contributors, then removability, then the coordinated
  conjunction) already matched what FR-003 requires — truth-table tests G3–G8 passed with no code change.
