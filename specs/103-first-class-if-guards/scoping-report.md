# Scoping report: first-class `if()` guards in KeyboardIR

**Session**: joint engine+content scoping session, run 2026-10-15 under the
scope-only ruling on the first-class-guards issue (no implementation
authorised; implementation is sequenced after spec 082 lands and is gated on
the corpus round-trip vectors named in the draft spec alongside this report).

**Deliverables in this directory**: this report (corpus report, consumer
inventory, shape decision) and `spec.md` (the draft spec for the chosen
shape, for review — not ratified).

**Status of the status quo**: guarded rules are still opaque on current main.
`packages/engine/src/codec/parse.ts` classifies any `if(...)` in context
position as `OPAQUE_REASONS.IF_OPTION_STORE` and returns no typed elements
for the rule (parse.ts, `parseContextElements`); an `if(...)` in a store
body opaques the store the same way (`parseStoreItems`). Approach A (the
raw-fragment scan that makes strategy rule 3a reachable for guarded rules)
remains the only consumer of guarded rules, and it pattern-matches the raw
fragment text rather than typed IR.

---

## 1. Corpus report — `if()` usage

### 1.1 Corpus and method (coverage stated honestly)

Corpus actually available in the scanning environment:

| Source | What it is | .kmn files |
|---|---|---|
| `keyboards-full/` checkout | keymanapp/keyboards, full release + experimental trees as present locally | 933 |
| `keyboards/` checkout | keymanapp/keyboards, sparse subset (a handful of release keyboards) | 13 |
| keyboard-studio repo fixtures | in-repo `__fixtures__` / test keyboards | 28 |

The headline numbers below are the **933-file full checkout**. The sparse
checkout and the repo fixtures are reported separately in §1.4; the repo
fixtures contain **zero** `if()` occurrences, so every statement about guard
shape rests on the keymanapp corpus, not on repo test data. The corpus is a
local checkout, not a pinned snapshot id — no commit pin for it was recorded
by the scan, and the numbers should be re-derived when the implementation's
round-trip vectors are built (method in §1.5 is written to be re-runnable).

Method: line-oriented scan over logical lines (backslash continuations
joined), with quoted literals blanked and `c` comments stripped before
matching, so `if(` inside a literal or comment is never counted. A rule line
is a non-`store(...)` line containing an unquoted `>`; the context/output
split is the first unquoted `>`. Position is the token index of the guard in
the context token list, ignoring a leading `$label:` prefix (a
conditional-compilation marker, not a context element). Store class:
`&`-prefixed names are system stores; a user store is "runtime-written" if
it appears as a `set(...)` / `reset(...)` / `save(...)` target anywhere in
the same file, otherwise "never written in-file".

### 1.2 Headline numbers (933 files)

- **73 of 933 files (7.8%) use `if()` at all.** Guarded rules are common in
  absolute terms but confined to a minority of keyboards.
- **40,950 guard occurrences across 40,831 rules.** Every one of the 40,950
  is in **rule context (left-hand side)**. Output position: **0**. Store
  bodies: **0**. Standalone/other lines: **0**. The guard is a context-only
  construct in the entire corpus.
- **Guards per rule**: exactly 1 guard in 40,712 rules (99.71%); exactly 2
  in **119 rules (0.29%)**; maximum observed is 2. Two-guard rules are real
  and take the form of a head cluster, e.g.
  `if(&newLayer = "") if(&layer = 'numeric') any(digit) > context`
  (cantonese_telex, chechen_latin, dega, foochow, khmer_angkor, …).
- **Position in context**: context-initial in 40,782 guards (99.59%);
  mid-context in 136 (0.33%); **post-keystroke (after the `+` separator) in
  0**. Every mid-context guard is still inside the head cluster: it is
  either the second guard of a two-guard rule, or it follows a leading
  `platform('touch')` element (18 lines corpus-wide, e.g. khmer_angkor
  `platform('touch') if(&newLayer = "") if(&layer = 'numeric') …`). No
  guard ever appears after a content-matching element (char, `any()`,
  vkey, deadkey) or after the keystroke separator.
- **244 guarded rules have no `+` keystroke separator at all** — the guard
  cluster (plus at most `any()`/`context`) is the whole context, e.g.
  `if(&newLayer = "") if(&layer = 'symbols') > context` (chechen_latin).
- **Comparison operator**: `=` in 40,793 parseable guard heads (99.6%). No
  `<>` (not-equal) guard and no comma-form `if(store, 'value')` guard was
  found anywhere in the 933 files. 157 heads (0.38%) were not parseable by
  the scan's head regex (long-tail literal syntax); they are counted as
  occurrences but not classified further — see §1.5.

### 1.3 Store classes (option-store vs system-store)

Only **29 distinct store names** are tested by guards in the whole corpus.

| Class | Guards | Share |
|---|---|---|
| System store, recognised set (`&layer` 784, `&platform` 56, remainder `&baselayout`) | 842 | 2.1% |
| System store, other (`&newlayer`, 72) | 72 | 0.2% |
| User store, runtime-written (`set`/`reset`/`save` target in-file) | 831 | 2.0% |
| User store, never written in-file | 39,205 | 95.7% |

The last row needs its context: 39,201 of its 39,205 guards test a single
store, `option_toneplace`, in two generated keyboards (vietnamese_telex
26,128 guards; vietnamese_vni 13,064). Those stores are declared with a
scalar default and driven from outside the file via the Keyman options
mechanism — operationally they **are** option stores, as their `option_`
name says. So, read by intent rather than by write-site:

- **Option stores dominate**: ~40,032 guards (97.8%) test user option
  stores (`option_toneplace`, `option_key`, `option_key_t_letter_tyun`,
  `option_ligature_mv/ew`, `honorifics_toggle`, `opt1`, …).
- **System stores are the second class**: 914 guards (2.2%), overwhelmingly
  `&layer` / `&newlayer` (layer switching) and `&platform` (touch vs
  desktop).
- One evidence gap worth recording: `&newlayer` (72 guards) is a real
  Keyman system store that the validator's recognised set
  (`packages/engine/src/validator/checks/ifStoreResolution.ts`: `&platform`,
  `&layer`, `&baselayout`, `&mnemoniclayout`, `&bitmap`) does **not**
  include. Independent of this feature, that check would flag every
  `&newlayer` guard as an unrecognised system store.

### 1.4 The ex-Vietnamese cut (the distribution without the two outliers)

Because two generated files supply 95.7% of all guards, the corpus is also
reported without them (926 files scanned, 71 with guards, 1,758 guards):

- Guards per rule: 1 in 1,520 rules (92.7%); **2 in 119 rules (7.3%)**.
  Multiplicity is not a Vietnamese artefact — it is a layer-switch idiom
  spread across many keyboards.
- Position: initial 1,590 (90.5%); mid-context 136 (7.7%, all head-cluster
  as in §1.2); post-keystroke 0.
- Store class: system stores 914 of 1,758 (**52%**); runtime-written user
  (option) stores 831 (47%); never-written user stores 13 (1%).
- 244 of the 1,639 guarded rules have no keystroke separator.

Sparse checkout (13 files, for completeness): 52 guards in 3 files
(sil_ipa 30, sil_euro_latin 21, bj_cree_woods 1); 1 two-guard rule; same
head-cluster shape. Repo fixtures (28 files): no guards.

### 1.5 Limits of this scan

- The scan is lexical, not a full KMN parse: 157 guard heads (0.38%) were
  not classified, and a guard split across a continuation in an unusual
  place could be mis-positioned. Counts of files, occurrences, rules,
  positions, and multiplicity were cross-checked against `grep` counts on
  sampled files (sil_euro_latin: 20 lines / 21 occurrences by both
  methods).
- "Never written in-file" is a write-site observation, not proof a store is
  constant: option stores are set by the host application at runtime, which
  is exactly why the `option_`-named class is read as option stores.
- The corpus is the keymanapp release corpus as checked out locally; it is
  not the studio's import telemetry. Keyboards the studio has actually
  imported may weight the classes differently (the two keyboards named in
  the status-quo cost — the Carve gallery's non-toggleable guarded rule and
  the 082 rules step — are in-corpus shapes, not telemetry either).

---

## 2. Consumer inventory — who switches on `ContextElement.kind`

Method: ripgrep over `packages/` (non-test sources) for every
`switch (... .kind)` site, every `never`-checked default, and every file
referencing the `ContextElement` type (35 files). Each candidate site was
read and its switched value's static type verified — several `switch
(el.kind)` sites switch on `OutputElement`, `StoreItem`, rule-kind, or
operation unions and are **not** ContextElement consumers; they are listed
in §2.4 so the sweep is auditable. The repo compiles with `strict` and
`noImplicitReturns`, so a switch whose every case returns a value is as
compile-forced as one with a `never` default: adding a union member makes
both fail to compile until the new kind is handled.

### 2.1 Compile-forced exhaustive switches — 7 files, 9 switch functions

Adding a `ContextElement` member breaks compilation at every one of these
until a decision is made. This is the enforcement surface the shape
decision in §3 relies on.

| # | File | Switch | Guard style |
|---|---|---|---|
| 1 | `packages/contracts/src/keyboardIRRoundTrip.ts` | `contextElementKey` | `never` default |
| 2 | `packages/engine/src/pattern-apply/collectCharContributors.ts` | `contextElementTokenDisplay` | `never` default |
| 3 | `packages/engine/src/codec/emit.ts` | `fmtContextElement` | all-return, no default |
| 4 | `packages/engine/src/kmAssist/group.ts` | `guardToken` | all-return, no default |
| 5 | `packages/engine/src/kmAssist/group.ts` | `displayGuard` | all-return, no default |
| 6 | `packages/engine/src/kmAssist/group.ts` | inline in `describeGuards` | all-return, no default |
| 7 | `packages/engine/src/kmAssist/explain.ts` | `describeContextElement` | all-return, no default |
| 8 | `packages/studio/src/components/rules/ruleNaming.ts` | `contextElementText` | all-return, no default |
| 9 | `packages/studio/src/components/ruleBuilder/RuleBuilderPanel.tsx` | `fmtContextElement` | all-return, no default |

(9 switch functions across the 7 files — kmAssist/group.ts carries three
of them. 2 are `never`-guarded (rows 1–2) and 7 are all-return, which is
equally compile-forced under `noImplicitReturns`.)

### 2.2 Exhaustive today, but NOT compile-forced — 2 files, 3 switches

These cover all 9 current kinds with break-style cases and no `never`
default, so a new kind compiles silently and falls through:

| File | Switch | Fall-through consequence for a guard element |
|---|---|---|
| `packages/engine/src/placement/index.ts` | `extractVkey` | guard treated as an allowed pre-context element; vkey extraction proceeds as if unguarded |
| `packages/studio/src/lib/irToCarveNodes.ts` | `contextToKeys` | guard contributes no key step (arguably correct display, but unchosen) |
| `packages/studio/src/lib/irToCarveNodes.ts` | `precedingContextLabel` | guard silently omitted from the label |

The same file carries two further **partial** switches with defaults that
already make a decision for unknown kinds: `triggerKeyLabel` (default →
`undefined`) and `buildCondition` (default → `unrenderable`). A guard in
trigger position cannot occur per §1.2 (guards are never the keystroke),
but a guard in preceding context reaches `buildCondition` today only as an
opaque rule, never as a typed element.

### 2.3 Non-exhaustive walkers — predicates and if-chains (the silent-ignore surface)

The remaining ContextElement-referencing files (of the 35) walk
`rule.context` with `kind ===` predicates or if-chains. Under **either**
candidate shape these keep compiling and keep their current behaviour for
guarded rules — which for most of them means "the guard is not seen". The
material ones:

- **Recognizer** (`packages/engine/src/recognizer/interpreter.ts`,
  `classifyRemovalCapabilities.ts`, rules `s01-simple-swap.ts`,
  `s02-deadkey-single-tap.ts`, `parallel-index-fanout.ts`): positive-shape
  predicates (`ctx.kind === "vkey"` etc.). A typed guard element in context
  simply fails each pattern's positive checks — patterns stay unrecognised
  rather than misrecognised. Safe direction, but recognition coverage for
  guarded rules stays at today's level until patterns opt in.
- **Validator** (`packages/engine/src/validator/context-tolerance.ts`):
  if-chains ending in an explicit ``kind "…" not analysed`` reason — the
  one walker that fails loudly on an unhandled kind instead of ignoring
  it. `layer-a-prime.ts` and `corpus.ts` use predicates over context and
  output kinds.
- **Pattern-apply** (`shiftRules.ts`, `context-variants.ts`,
  `carveSuppression.ts`, `applyStoreSlotRemovals.ts`,
  `normalization-step/pack.ts`, `oe2SoleSource.ts`, `touchRuleSynthesis.ts`,
  `modifierCombos.ts`, `mark-guards.ts`, `keyEditOps.ts`,
  `context-tolerance-overlay.ts`, `producerIndex.ts`,
  `applyKeyEditsToLayout.ts`, `applyCarveKeycapRemovalsToVfs.ts`):
  mutation and analysis walks, mostly predicate-based. These are the
  consumers where an unconsidered guard is a correctness risk (a mutation
  that rewrites a rule while dropping or ignoring its condition), and they
  are **not** protected by the type system under either shape — they need
  the per-consumer review the draft spec requires, not just a compile
  pass.
- **Contracts helpers** (`ir/deadkeys.ts`, `ir/backspaceContext.ts`,
  `keyBudget.ts`, `ir-path.ts`, `touch-key-rule-join.ts`,
  `ir/producedSet.ts` context walks, `ir/reachableProducedSet.ts`):
  predicate walks over context; a guard element is invisible to them,
  which is correct for deadkey/backspace/budget questions and must be
  confirmed per helper rather than assumed.
- **Studio surfaces** (`lib/irToCharacterView.ts`, `lib/docContent.ts`,
  `components/rules/narrowGuard.ts`, `components/rules/guardRuleSynthesis.ts`,
  `editors/carve/CarveGalleryV2.tsx`): display and synthesis walks. The
  Carve gallery is where the status-quo cost is already visible (guarded
  rules render non-toggleable because they are opaque fragments).
- **Scaffolder / transforms** (`scaffolder/scaffold-ir.ts`,
  `facet-transform/migrations/encoding-spelling.ts`,
  `deadkey-lifecycle/cluster.ts`, `placement/deadkey.ts`): predicate
  walks that construct or cluster rules.

### 2.4 Verified NOT ContextElement consumers (excluded after reading)

`switch` sites on sibling unions, checked and excluded so they are not
double-counted in future sweeps: `codec/emit.ts` `fmtOutputElement` /
`fmtStoreItem`; `keyboardIRRoundTrip.ts` `outputElementKey` /
store-item key; `contracts/ir/producedSet.ts` `collectFromElements`
(OutputElement, `never`-guarded); `contracts/ir/outputRepertoire.ts`
(OutputElement); `strategy-selector/derive-remap-posture.ts`
(OutputElement); `kmAssist/group.ts` / `explain.ts` switches on the
rule-kind classification; `pattern-apply` operation switches
(`keyEditOps`, `layerFamilies`, `touchKeyCollateral`,
`applyKeyEditsToRawJson/Layout` — edit-operation unions, not elements);
studio switches on unrelated unions (workToDo items, publish errors,
stage kinds).

### 2.5 The producer and the schema surface

- **Producer**: `codec/parse.ts` `parseContextElements` is the single
  place typed context elements are born; `if(...)` there opaques the
  **whole rule** (the rule never reaches `group.rules`). `parseStoreItems`
  opaques a store whose body contains `if(...)` (0 corpus occurrences).
  Output-position `if(...)` is not special-cased in the output parser and
  has 0 corpus occurrences.
- **Schema/drift surface**: `ContextElement` is a hand-written TS union in
  `packages/contracts/src/keyboard-ir.ts`. There is **no zod mirror** for
  it — `KeyboardIRSchema` (`packages/contracts/src/schemas.ts`) validates
  the touch surface precisely and is `.passthrough()` on the rest, so the
  drift guards that react to a new member are the TS type itself, the
  `never`/all-return switches in §2.1, and the round-trip key functions —
  not a schema-generated guard. The useGroup precedent (an additive
  OutputElement member, typed per a spec FR, then consumed by recognizer
  and carve) is the established path for exactly this kind of change.

---

## 3. Shape decision

**Decision: a new `ContextElement` variant — `{ kind: "if", store: string,
value: string }` — in context position. The panel default is CONFIRMED, and
the corpus evidence removes the condition that could have overturned it.**

### 3.1 Why the overturn condition fails

The ruling recorded that the corpus report could overturn the default if
`if()` proved **always single and context-initial** (in which case a single
optional `IRRule.guard` field would lose nothing). The corpus shows the
conjunction is false on both conjuncts:

- **Not always single**: 119 rules carry 2 guards — 7.3% of guarded rules
  once the two Vietnamese outliers are removed. A singular `guard` field
  cannot represent `if(&newLayer = "") if(&layer = 'numeric')` without a
  second mechanism (a list, a conjunction string, or dropping one guard).
- **Not always the first element**: guards follow a leading
  `platform(...)` element (18 lines) and follow each other; what is
  invariant is not "position 0" but "inside the head cluster, before any
  content element and before the keystroke separator" (post-keystroke
  guards: 0 of 40,950). A rule-level field would have to encode that
  positional constraint separately; a context element carries it for free,
  in order.

### 3.2 The options and each option's risk

**Option A — `ContextElement` variant `{ kind: "if", store, value }`
(chosen).**
A guard is an element of the context sequence, in source order, repeatable.
Parse stops opaquing the rule; emit reproduces `if(store = 'value')` at
its recorded position; the 9 compile-forced switch functions in §2.1 fail
to compile until each consumer decides what a guard means there (render it,
ignore it explicitly, or treat the rule as unhandled).
- *Risk*: the enforcement is real but partial — §2.2's unguarded switches
  and §2.3's predicate walkers do not fail compilation, so a consumer can
  still ignore a guard silently; the spec therefore pairs the variant with
  a named per-consumer review list rather than trusting the compiler
  alone. A guard element also flows into positional machinery (context
  offsets for `index()`/`context(N)` pairing count context elements), so
  the spec must state whether a guard occupies an offset position (KMN
  semantics: it does not produce a context character — the draft spec
  requires the offset accounting to be pinned by round-trip vectors
  before implementation).

**Option B — `IRRule.guard` field (rejected).**
One optional field on the rule, e.g. `guard?: { store: string; value:
string }` (or a list of them).
- *Risk*: silent-ignore is the default failure mode — every consumer in
  §2.1–§2.3 keeps compiling unchanged, and a consumer that forgets the
  field treats a conditional rule as unconditional (the exact defect class
  this feature exists to remove; a mutation in pattern-apply could rewrite
  a guarded rule and drop its condition without any signal). It also
  cannot represent the corpus as-is: 119 two-guard rules force the field
  to become a list (at which point it is a parallel context sequence with
  worse ordering semantics), platform-preceded guards lose their position,
  and the 244 no-keystroke rules show the guard cluster sometimes *is*
  effectively the context — a side field misdescribes it. Its one
  advantage — a smaller diff — buys that diff by giving up the compile
  forcing that is the point of modelling the guard at all.

### 3.3 Consequences the draft spec carries

1. Variant shape: `{ kind: "if", store, value }` with `store` carrying the
   store name verbatim (including the `&` prefix for system stores) and
   `value` the compared literal. Corpus-attested comparisons are `=`
   only; a `<>` guard, if ever parsed, must stay opaque rather than be
   mistyped as `=` (fail-closed, per the codec's existing posture).
2. Guards may repeat and may follow a `baselayout`-class head element;
   they never appear after the keystroke separator in the corpus, and the
   spec does not require the parser to accept a post-keystroke guard as
   typed (opaque remains acceptable there until a corpus case exists).
3. Implementation is gated on corpus round-trip vectors (parse → IR →
   emit → identical KMN) for: single initial guard (option store),
   two-guard layer cluster, platform-preceded guard, no-keystroke guarded
   rule, system-store guard, and the Vietnamese scale case — per the
   ruling's sequencing (after spec 082 lands; the vectors are the gate,
   not a formality).

---

## 4. What this session did not decide

- No implementation is authorised by this report. The draft spec is for
  review; ratification and the implementation go-ahead remain the
  maintainer's.
- Pattern recognition of guarded rules (which patterns may claim a rule
  whose context contains a guard element) is specified as an explicit
  per-pattern decision in the draft spec, not pre-decided here.
- The `&newlayer` gap in the validator's recognised system-store set (§1.3)
  is recorded as a finding; fixing it is a separate small change, not part
  of this feature's scope.
