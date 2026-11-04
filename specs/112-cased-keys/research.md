# Research: Caps Lock and `&CasedKeys`

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-03

The Copy-side code survey is spec 106's [research R7](../106-consistent-keyboard-output/research.md#r7-caps-us5).
The notes below confirm it against the current code, and resolve what R7 left open.

## R1. `&CasedKeys` is per key, not per plane

**Finding.** kmcmplib's `ExpandCapsRulesForGroup` inverts the Shift state of a listed key under Caps
Lock **on every modifier plane** of that key, not only on the base plane. The studio's own
transcription of that rule is [capsExpand.ts:76-84](../../packages/engine/src/ldml-export/lower/capsExpand.ts#L76-L84)
(`toggleShift` keeps `ralt`). kmcmplib also rejects modifiers inside the store: `[K_A]` is valid,
`[RALT K_A]` is not.

**Consequence.** The spec's "case pair on a key ... on the same modifier plane" vocabulary is right
about *detecting* a pair, but the store cannot list a plane. Listing a key changes Caps Lock on all
its planes. A key with a case pair on base/Shift and a **non-case** pair on RAlt/Shift+RAlt (e.g.
`€`/`£`) would, under Caps, type `£` for RAlt.

**Decision.** A key qualifies for the derived set when:
1. at least one used plane carries a case pair (via `caseCounterpart`, R3), and
2. no used plane carries a distinct non-case pair (unshifted ≠ shifted, and not counterparts).

Planes where one side is empty are not a conflict (Caps then reaches the other side, which is what
the base keyboard does too). A key that fails rule 2 is excluded and **reported** as a conflict
(Copy: shown under the decision; 7.28: named in the FR-002 finding; Open: the comparison withholds
it, R5).

**Spec amendment proposed** (not made by this plan): Key Entities "Cased key set: keys (with plane)"
becomes "keys (planes are read to qualify a key; the store lists keys)", and FR-006 gains rule 2.

**Alternatives considered.** Listing every key with any case pair, conflicts included: rejected, it
breaks RAlt output under Caps silently (Art. X). Emitting per-plane CAPS rules for conflict keys
alongside `&CasedKeys`: rejected for v1; it reintroduces the mixed form Story 3 scenario 5 reports.

## R2. Where the key-set derivation lives

**Finding.** Three consumers need the same derivation: the 7.28 criterion in `@keymanapp/keyboard-lint`
(FR-002), the Copy projection in studio (FR-006), and the Open fixer in engine (FR-008).
`keyboard-lint` depends only on `@keyboard-studio/contracts`. `caseCounterpart` lives in
`engine/src/character-discovery/casePair.ts:99`; the per-combo key map is engine's
`buildComboKeyMap` (`pattern-apply/modifierCombos.ts:814`).

**Decision.** Put the pure derivation in `@keyboard-studio/contracts`, next to `buildProducedSet`
(`contracts/src/ir/casedKeys.ts`):
- move `caseCounterpart` and its `localeCase` helper to contracts, and re-export them from the engine
  path so existing imports are unchanged;
- add `keyPlaneOutputs(ir)`: per key, the single-character output on {base, Shift, RAlt, Shift+RAlt},
  from direct `+ [MODS VKEY] > 'c'` rules and the `any(store) > index(store, n)` form, skipping
  deadkey-context rules and folding CAPS/NCAPS siblings (the NCAPS output is the plane's output);
- add `casedKeySet(ir, { bcp47?, family })` returning `{ keys, conflicts }` per R1;
- add `declaredCasedKeys(ir)`: the parsed store, moved from `ldml-export/lower/capsExpand.ts`
  `casedKeys()` (which then imports it).

`buildComboKeyMap` stays in engine (it serves arbitrary combos and the touch synthesis). km-synthesis
reviews the overlap between it and `keyPlaneOutputs`; a later refactor may express one through the
other.

**Alternatives considered.** Adding `@keyboard-studio/engine` to keyboard-lint's dependencies:
rejected, Layer C is meant to stand alone (Art. IV) and depcruise forbids it. Duplicating the logic in
lint: rejected, two derivations would drift.

## R3. Language-aware pairs in lint

**Finding.** `caseCounterpart(char, bcp47)` is locale-sensitive (`tr`: `i`↔`İ`). Lint has no
language context of its own, but it parses the package (`.kps` languages).

**Decision.** 7.28 passes the first `.kps` language tag as `bcp47` when one exists, and none
otherwise. Copy passes the target language. Open passes the first package language. A keyboard whose
languages disagree on casing (e.g. Turkish and English together) is rare enough to accept the first
tag; the comparison (R5) still guards Open.

## R4. FR-002 severity

**Finding.** A criteria `CheckResult` is pass or fail; every `criteriaFinding` has severity
`warning`. There is no "pass with warning".

**Decision.** A declared-but-incomplete `&CasedKeys` makes 7.28 **fail** with a distinct message
naming the missing keys (and any R1 conflicts, as information). The corpus baseline in SC-001
(405 / 151 / 330 / 35) is re-recorded after the change: some of the 151 declared keyboards will move to
fail. The re-baselined counts are recorded in the implement-phase commit message.

**Alternative considered.** Passing with the missing keys in `verified` text: rejected, verified text
isn't surfaced as a finding, so the reviewer would never see it.

## R5. The caps comparison (FR-009, SC-004)

**Finding.** The simulator ([simulator/index.ts:117-160](../../packages/engine/src/simulator/index.ts))
already takes `caps` per keystroke and runs the compiled KeymanWeb JS, so `&CasedKeys` expansion is
honoured exactly as kmcmplib compiles it. The context-tolerance fix (spec 078,
`hooks/useContextToleranceApply.ts`) is the precedent for compile-and-simulate on demand, outside the
D3 cycle.

**Decision.** New engine module `engine/src/caps/compareCaps.ts`:
- `compareCapsBehaviour(beforeKmn, afterKmn, keys)` compiles both, then for every key in the union of
  keys with rules plus the derived set, simulates {none, Shift, Caps, Shift+Caps} on each used
  modifier plane, from an empty context.
- Verdict per key: `identical`, `gains-uppercase` (only the Caps / Shift+Caps outputs changed, and the
  new Caps output is the case counterpart of the none output, or the reverse for Shift+Caps), or
  `differs`.
- Overall: offer iff no key `differs`.

It runs on demand when the 7.28 finding's fix is built for an opened keyboard (once per working-copy
revision, memoised by the two texts' hashes), never on the 300 ms cycle. It produces no diagnostics,
so it is outside D3 (Art. IV), like spec 078.

Deadkey- and context-driven outputs (spec edge case) are covered by simulating the key after each
deadkey the keyboard defines as well. That multiplies the run by the deadkey count; it is capped at
the deadkeys that reach a key in the set, and measured on the corpus (SC-004 run).

## R6. The Open fixer (FR-008)

**Finding.** The spec's assumption that `stripCapsRules` can be reused as-is is **wrong**.
`stripCapsRules` (`scaffold-ir.ts:218`) deletes every rule carrying `CAPS` **or `NCAPS`**, whole.
On upstream basic_kbdus that deletes all four rules on each of K_A–K_Z, leaving the letters to fall
through to the base keyboard. On a US base that types the same; on any other base (AZERTY, Turkish F)
it changes the letters. `removeCapsContextElements` (:234) then has nothing left to clean.

The same function runs on Copy today (`scaffold-ir.ts:290`), so a copied keyboard whose letters are
written as NCAPS/CAPS rules silently loses them. Fork starting points are curated not to have such
rules, which is why no walk has caught it; it is a latent Copy defect this spec fixes in passing (see
R10).

The transform `&CasedKeys` actually replaces is: for each key in the set, delete the rules that test
`CAPS`, and remove the `NCAPS` token from the rules that test `NCAPS`, keeping them. On upstream
basic_kbdus that turns `[NCAPS K_A] > a`, `[CAPS K_A] > A`, `[NCAPS SHIFT K_A] > A`,
`[CAPS SHIFT K_A] > a` into `[K_A] > a`, `[SHIFT K_A] > A`, which `&CasedKeys` expands back to the
original four.

**Decision.** New `replaceCapsRules(ir, keys)` in `engine/src/caps/` implements that key-scoped
transform. It replaces `stripCapsRules` and `removeCapsContextElements` everywhere (both modes in
R10 call it), and the two old functions are deleted once they have no callers. `upgradeToCasedKeys(ir, { bcp47 })` in engine
(`engine/src/caps/upgradeToCasedKeys.ts`) applies, on the IR:
1. `replaceCapsRules` **limited to keys in the derived set** (a CAPS rule on another key, e.g. a
   numeric-row trick, is kept, and its key makes the comparison `differs` if it would change);
2. `&CasedKeys` with `casedKeySet` keys, written as `[K_A]..[K_Z]` plus the extra keys;
3. `&VERSION` raised to `14.0` when lower (and not when the store is absent and the file has no
   version; then it is added).

It returns the new IR and the comparison input. Text placement is spec 111's precise-edit projection
(FR-008 there); this spec doesn't build it. The existing `ensureCasedKeysStore` is generalised to take
a key list, so the scaffolder and the fixer write the store the same way.

**Mixed keyboards** (`&CasedKeys` declared plus leftover CAPS rules, Story 3 scenario 5): 7.28
passes; 7.26 (`check-caps-ncaps.ts`) already reports inconsistent per-key caps rules. No fix is
offered for the leftovers in v1; the finding text names them.

## R7. Fixtures

**Finding.** Both local basic_kbdus copies differ from upstream: the fork copy
(`../keyboards`, and `studio/tests/fixtures/walkBases/...`) already declares `&CasedKeys` with no CAPS
rules; `engine/src/pattern-apply/__fixtures__/touch-id/basic_kbdus` has neither (it is the
"no caps handling" case). The upstream keymanapp file has the NCAPS/CAPS block on K_A–K_Z, no
`&CasedKeys`, `&VERSION 10.0`, and its touch layout has no caps layer.

**Decision.** Add the upstream `basic_kbdus.kmn` and `.keyman-touch-layout` (keymanapp/keyboards
`master`, recorded commit) as `engine/src/caps/__fixtures__/upstream_basic_kbdus/`. Spec 111 T045
reuses it. Synthetic fixtures: `ŋ`/`Ŋ` on `K_LBRKT` (base/Shift) and on `RALT K_N` (RAlt/Shift+RAlt);
an R1 conflict key (`ŋ`/`Ŋ` base, `€`/`£` RAlt); a Turkish `i`/`İ` keyboard; a caseless keyboard; a
keyboard whose CAPS rules switch the number row (comparison `differs`).

## R8. Touch caps layer (FR-003, FR-011, FR-012)

**Finding.**
- `mutateCleanTouchLayout` (`scaffolder/cleanTouchLayout.ts:189-204`) clones `shift` → `caps` when
  absent, **before** nextlayer defaulting, so the clone keeps whatever `nextlayer` the starting
  point's shift keys had. A starting point whose shift letters carry `nextlayer: "default"` gives a
  caps layer whose letters drop out of caps: an FR-003 violation.
- Nothing adds the double-tap. The corpus pattern (fork `basic_kbdwol`, `basic_kbdus`) is a
  `multitap` on the default layer's `K_SHIFT`:
  `{ "id": "T_CAPS", "text": "*ShiftLock*", "nextlayer": "caps" }`. No engine code emits it.
- Assignments reach the caps layer only through CAPS-bearing combos
  (`propagateDesktopLayersToTouch`). With `&CasedKeys` there are no CAPS rules, so a letter assigned
  after scaffolding never reaches the caps layer.

**Decision.** A touch caps-sync step in engine, `engine/src/caps/syncTouchCapsLayer.ts`, run as part
of projection step 2.8 when the decision is `cased-keys` (Copy), and as the FR-012 fix (Open):
1. ensure a `caps` layer exists (clone `shift`'s geometry when absent);
2. for each default-layer key whose output is a cased letter, set the caps key's `text`/`id` to its
   uppercase counterpart (other keys mirror `shift`);
3. strip `nextlayer` from caps-layer character keys (keep it on frame keys: Shift returns to
   `default`, the layer-switch keys keep theirs);
4. ensure the default layer's `K_SHIFT` has the `T_CAPS` multitap to `caps`.

On Open it applies as a raw-JSON patch (the spec 035 R9 Case B convention, like the other touch
appliers), so untouched keys stay byte-identical. The FR-003 criterion is a new lint check
`check-touch-caps-layer.ts` reading the parsed touch layout (`parseTouchLayout`, already loaded in
`criteriaChecks.ts:232`). Wording of its criteria row is content's (Art. VI); this plan proposes
`18.16-touch-caps-layer-complete`, band `layer-c-enforce`, rule id `KM_LINT_TOUCH_CAPS_LAYER`.

`rightalt-caps` is out of FR-003's scope (the spec names the default layer only); the existing clone
is kept unchanged.

## R9. Copy decision and projection

Confirmed against the code (R7 line numbers have drifted):
- Gallery module shape: [windowsLayout.ts:34-42](../../packages/studio/src/survey/questions/gallery/windowsLayout.ts#L34-L42)
  (`provides`, `screen: "layout"`, `requires`, `apply: () => ({})`).
- Scaffolder call to remove: `scaffold-ir.ts:292` (`ensureCasedKeysStore(ir, opts.group)`); the
  family floors are `CASED_KEYS_QWERTY` / `CASED_KEYS_AZERTY` at :249-251, to export.
- Projection: step 2.7 is at `projectWorkingCopyVfs.ts:1058`; step 2.8 follows it, parsing the `.kmn`
  text the same way 2.7 does.
- Companion pre-accept: `useCasePairCompanion` is at `editors/assignLoop/casePairCompanion.ts:271`.

**Decision**: as R7, with one change: step 2.8 also runs the touch caps sync (R8), so desktop and
touch caps are derived from the same decision in one place.

## R10. The three modes on Copy

**Finding.** Spec 106 FR-050 named the modes `cased-keys | explicit-rules | none` but never defined
what `explicit-rules` produces. Today the scaffolder strips every CAPS/NCAPS rule at instantiation
(`scaffold-ir.ts:290-291`), so there is nothing left for an "explicit rules" choice to keep.

**Decision.** Caps rule handling moves out of `scaffoldIR` into projection step 2.8, with the
store, so all three modes are decision-driven and replayable (Art. III):

| Mode | `&CasedKeys` | Copied keyboard's CAPS/NCAPS rules | Touch caps sync |
|---|---|---|---|
| `cased-keys` | written, derived set (R1) | `replaceCapsRules` on the set's keys | yes (R8) |
| `explicit-rules` | not written | kept as copied | no (the CAPS combos already reach touch through `propagateDesktopLayersToTouch`) |
| `none` | not written | `replaceCapsRules` on every key that has CAPS/NCAPS rules | no |

`explicit-rules` never generates new CAPS rules for the author's assignments; assigned keys follow
Shift only under Caps. Offered only when the copied keyboard carries CAPS rules (otherwise the
choice is `cased-keys` or `none`). 7.28 then fails, by design (Story 2 scenario 5).

**Decision formats (Art. III).** `caps-handling` is a 088 decision-set entry with value
`{ mode: "cased-keys" | "explicit-rules" | "none" }`, provenance `"default"` when seeded and
`"asked"` once the author confirms or changes it. Its 053 record entries are agency
`"tool-proposed"` (seed) and `"hand-set"` (answer). A caseless alphabet records the step as
`not-asked` and writes no decision. The derived key set is never stored; it is
recomputed at projection.
