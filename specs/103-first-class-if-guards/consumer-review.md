# Spec 103 — FR-006 per-consumer review record

The review the spec requires before the typed guard could land: every
consumer inventoried in `scoping-report.md` §2 that walks rule contexts,
with the decision it makes for a `{ kind: "if", store, value }` element and
the basis for that decision. Compiled 2026-10-15 against the implementation
PR for this spec.

**The two counting disciplines (pinned by the FR-009 vectors).** A guard
produces no context character, but it occupies an element position:
Keyman `index()` offsets count context *elements*, guards included
(sil_ipa: guard at position 1, `any()` at position 2, offset 2). Consumers
that resolve `index()` alignment must count the guard; consumers that count
produced/preceding *characters* must skip it. Every verdict below names
which discipline the consumer uses and whether it agrees.

**The mutation rule (FR-006).** A mutation that cannot account for a guard
must not rewrite the rule. Walkers that rebuild a context array from
selected elements are the danger class; each one is named below.

## Compile-forced switches (scoping §2.1) — explicit `case "if"` added

| Consumer | Decision |
|---|---|
| contracts `keyboardIRRoundTrip.ts` (`contextElementKey`) | Guard contributes a stable `if:<store>=<value>` key part. |
| engine codec `emit.ts` (`fmtContextElement`) | Emits the FR-004 canonical form `if(<store> = '<value>')`; refuses a value containing a single quote rather than emitting corrupt KMN. |
| engine kmAssist `group.ts` (`guardToken`, `displayGuard`, `describeGuards`) | Guard tokens and prose cover typed guards alongside `&baselayout`. |
| engine kmAssist `explain.ts` (`describeContextElement`) | "the \"<store>\" store is set to \"<value>\"". |
| engine pattern-apply `collectCharContributors.ts` | Explicit no-contributor case: a guard produces no character, so it contributes no token — the *condition* is not dropped, it is simply not a character source. |
| studio `ruleNaming.ts` (`contextElementText`) | Guard renders in rule names in canonical form. |
| studio `RuleBuilderPanel.tsx` (`fmtContextElement`) | Guard renders in the rule builder in canonical form. |

## Unguarded / partial walkers (scoping §2.2) — explicit decision added

| Consumer | Decision |
|---|---|
| engine placement `extractVkey` | Explicit `case "if"` returning null: a guarded rule is never an unconditional placement. |
| studio `irToCarveNodes.ts` (`contextToKeys`, `precedingContextLabel`, `buildCondition`) | No key step for a guard; the condition is surfaced in the preceding-context label ("when &layer is 'symbols'") and, for a sole-guard preceding context, as the carve-node condition ("only when … is set to …"). A guard mixed with other preceding elements stays unrenderable rather than partially described. `isSimpleRemovableRule` already rejected guarded rules (context length) — unchanged, and its doc anticipated this variant. |
| engine validator `context-tolerance.ts` (`resolveRuleStatically`) | A rule whose preceding context carries a guard is refused by name (not-analysed, reason naming the guard), the same FR-010 refusal posture the diagnostic already applies to `platform()`/`baselayout()` preceding elements. The guard's condition is runtime store state this diagnostic does not model; the rule is never silently analysed as if unconditional, and the refusal finding is how it stays in the accounting. |

## Recognizer (scoping §2.3) — FR-007 verdict

No pattern is extended to claim guarded rules. Every recognizer predicate
is a positive-shape match, so a guard fails the shape and the rule is not
claimed — the fail-safe direction:

- `interpreter.ts`, `rules/s01-simple-swap.ts`, `rules/s02-deadkey-single-tap.ts`:
  exact context-length and `context[0].kind` predicates; a leading guard
  changes both, so guarded rules are never claimed as unconditional swaps
  or deadkey taps.
- `rules/parallel-index-fanout.ts`: pre-terminal elements must all be
  `deadkey`; a guard in pre-terminal position fails the predicate. Its
  offset invariant (`offset === context.length`) counts elements, which
  agrees with the guard-inclusive Keyman discipline — moot here, since the
  deadkey check already rejects.
- `classifyRemovalCapabilities.ts`: `context.length > 1` classifies a rule
  context-sensitive (not removable); a guard pushes a bare key rule past
  the threshold — conservative, never a wrongful removal.

## Validator (scoping §2.3)

- `context-tolerance.ts`: see §2.2 above — guarded rules are refused by
  name, so no variant is ever generated for them (pattern-apply's
  `context-variants.ts` independently skips them; see below). Its pairing
  analysis (`analyzeStores` in pattern-apply) resolves `index()` positions
  over the separator-stripped context *including* guards — verified to
  agree with the Keyman discipline (see `applyStoreSlotRemovals` below).
- `layer-a-prime.ts` (`checkBehaviourNulOnTextContext`): "text-bearing"
  counts any element that is not vkey/deadkey/`+`, so a guard counts as
  text-bearing. The check applies only to behaviour-owned (studio-synthesized)
  rules, which carry no author guards; if one ever did, the direction is
  conservative (flag, never miss).
- `corpus.ts`: collects vkey names from contexts by kind; a guard is not a
  vkey and is ignored by construction.

## Pattern-apply mutations (scoping §2.3) — named individually

- `carveSuppression.ts`: two sites, both safe. `suppressionVerb` defaults
  to `context` (preserve) for anything not bare-key or deadkey-only, so a
  guarded context preserves. The synthesized shadow-guard rule maps the
  source context replacing only the targeted `any()` element — the guard
  is carried verbatim, so the shadow fires under exactly the source rule's
  condition. **Guard preserved, not dropped.**
- `touchRuleSynthesis.ts` (`renameTouchKeyRule`): maps context rewriting
  only `vkey` elements; all other elements (guards included) are carried
  by reference. **Guard preserved.**
- `applyStoreSlotRemovals.ts`: the `index()` pairing walks the
  separator-stripped context including guards (`effectiveContext[offset-1]`)
  — the guard-inclusive discipline, agreeing with Keyman; this is the
  consumer the offset pin most directly protects. It builds usage/pairing
  facts and does not rebuild contexts.
- `oe2SoleSource.ts`: same guard-inclusive pairing for fan-out slot
  attribution; its trigger segment is the slice after the last `+`, which
  a head guard never enters.
- `context-variants.ts`: variants are generated only for rules the
  context-tolerance diagnostic reports a gap for; guarded rules are
  refused by that diagnostic (see Validator), so they never reach
  generation. Independently, its own gate also protects: it generates only
  for a preceding context of exactly one element, and a guarded rule's
  preceding context is at least two (guard + character) — so **no unguarded
  variant can be synthesized from a guarded rule** even if a gap were
  reported. Its insertion-point fallback likewise requires an empty
  preceding context, which a guard defeats.
- `context-tolerance-overlay.ts`: inserts pre-built batches by group and
  anchor rule; it does not rebuild rule contexts.
- `shiftRules.ts`: positive scan for `vkey` elements in context; other
  kinds are not matched and not rewritten.
- `mark-guards.ts`: synthesizes its own guard rules from mark pairs; does
  not consume author rule contexts.
- `normalization-step/pack.ts`: assembles synthesized normalization rules
  from parts it constructs; no author context is rebuilt.
- `modifierCombos.ts`, `keyEditOps.ts`, `producerIndex.ts`,
  `applyKeyEditsToLayout.ts`, `applyCarveKeycapRemovalsToVfs.ts`: no
  context-element walking that selects or rebuilds elements (keyEditOps,
  producerIndex, applyKeyEditsToLayout contain no context references at
  all).

## Contracts helpers (scoping §2.3)

- `ir/producedSet.ts`, `ir/reachableProducedSet.ts`: walk outputs and
  fragment sketches, never context positions.
- `ir/backspaceContext.ts`: `some(kind === "vkey")` membership only.
- `ir/deadkeys.ts`: shape predicates over separator-stripped contexts; a
  leading guard defeats the trigger/output shape match, so no deadkey
  fact is fabricated for a guarded rule (fail-safe).
- `keyBudget.ts` (`ruleKey`): the struck key is the *last* context
  element; a parseable guard is never last (head cluster only).
- `touch-key-rule-join.ts`: `indexOfStruckVkey` scans by kind (unaffected);
  `hasPreContext` counts any non-separator element besides the struck key,
  so a guard makes the rule context-carrying — conservative for a join
  that only claims bare key rules.
- `ir-path.ts`: addresses rules by node id, not by context shape.

## Studio surfaces (scoping §2.3)

- `lib/irToCharacterView.ts`: `index()` expansion resolves
  `effectiveCtx[offset - 1]` over the separator-stripped context including
  guards — guard-inclusive, agreeing with Keyman. Cell labels come from
  `keySequenceLabel`, which declines a context it cannot label, so a
  guarded rule's cells are omitted rather than mislabelled (the same
  absence as the fragment era, when the rule was not in `group.rules`).
- `lib/docContent.ts`: mechanism detection uses exact-length and kind
  shapes (`hasRepeatToCycle`, deadkey membership); a guard defeats the
  exact shapes — conservative non-detection.
- `components/rules/narrowGuard.ts`, `components/rules/guardRuleSynthesis.ts`:
  both map a template rule's context replacing exactly one located element
  (the `any()` / the key) and carry every other element — a guard on a
  template would be preserved. Their inputs are studio-synthesized guard
  templates, which carry no author `if()` guards today.
- `editors/carve/CarveGalleryV2.tsx`: renders carve nodes built by
  `irToCarveNodes.ts` (see §2.2); no direct context walking.
- `lib/irToCarveNodes.ts` `keySequenceLabel`'s `NON_KEY_PRECEDING_KINDS`
  set: deliberately left unchanged — a guard is a *key-relevant condition*,
  not a non-key preceding kind; the label path that renders it is
  `precedingContextLabel` above.

## Scaffolder / transforms (scoping §2.3)

- `scaffolder/scaffold-ir.ts` (`removeCapsContextElements`): maps context
  rewriting only `vkey` modifiers; all other elements carried. **Guard
  preserved.**
- `facet-transform/migrations/encoding-spelling.ts` (`soleVkey`): requires
  context length exactly 1; a guarded rule is never folded into a
  split-modifier pair (fail-safe).
- `deadkey-lifecycle/cluster.ts`, `placement/deadkey.ts`: no context
  element selection or rebuilding; placement's context consumer is
  `extractVkey`, decided in §2.2.

## Strategy detection (FR-008)

`strategy-selector/import-mark-order.ts`: the Approach A raw-fragment scan
is retired; guarded postfix rules are read from typed IR by the same shape
function as guard-free rules, with the offset invariant generalised to
`offset === guardCount + 1`. One evidence-standard subtlety is preserved
and recorded in code: the retired scan never resolved the guarded rule's
store pair (it fired on shape + offset + witness agreement), and the live
sil_ipa pairs do not all pass the base→marked relation check (e.g.
B → small-capital B is a name change, not a name extension) — so guarded
rules fire on shape + offset, while guard-free rules keep the full
relation check. Tightening the guarded standard would silently lose the
import fill; it is a separate decision if ever wanted. SC-005's suite,
including the real sil_ipa integration case, passes on the typed path.
