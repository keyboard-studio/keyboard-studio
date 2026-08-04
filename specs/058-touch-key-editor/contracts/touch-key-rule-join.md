# Contract: the touch key ↔ rule join, and the two producibility views

Normative for FR-001…FR-012 and FR-040…FR-045 of [spec.md](../spec.md). Rationale is in [research.md](../research.md) R2/R4/R5.

---

## 1. Why this contract exists

A `T_XXXX` touch key has no intrinsic output; it produces only via a `.kmn` rule keyed on it. Our two producibility calculations each know one half of that relation and never meet, so one over-credits and the other under-credits (see [spec.md](../spec.md) §Context). This contract defines the missing primitive and pins **which consumer gets which view**, so a future contributor cannot "helpfully" unify them.

**Placement is forced.** The join lives in `packages/contracts` because `@keymanapp/keyboard-lint` must use it and cannot import engine (dependency-cruiser `lint-not-to-engine`, spec §10). This is the same precedent `buildProducedSet` and `computeTouchCoverage` already set.

---

## 2. The join

New module in contracts. Shape (illustrative — the plan owns final naming):

```ts
/** Upper-cased key id — the kmcmplib VKDictionary interning key. */
export type NormalizedTouchKeyId = string;
export function normalizeTouchKeyId(id: string): NormalizedTouchKeyId;

export type TouchKeyRuleRole =
  | "produces"     // emits characters
  | "guard"        // `> context` — re-emits the pre-context; produces NOTHING
  | "suppresses"   // `> nul`, or an empty output
  | "transitions"  // only useGroup / deadkey / beep — wired, produces nothing
  | "opaque";      // unclassifiable raw output — wired, production unknown

export interface TouchKeyRuleBinding {
  readonly ruleNodeId: string;
  readonly groupName: string;
  readonly usingKeys: boolean;
  /** Id exactly as spelled in the .kmn (case preserved) — feeds the case diagnostic. */
  readonly keyIdAsWritten: string;
  /** Modifier words from the vkey element: uppercased, deduped, sorted.
   *  NOT chirality-unified and NOT narrowed to ModifierToken — see §2.4. */
  readonly modifiers: readonly string[];
  readonly role: TouchKeyRuleRole;
  /** NFC, one JS char per entry. Non-empty only when role === "produces". */
  readonly produced: readonly string[];
  /** Verbatim leading char-run, unsplit: T_FCFA -> "FCFA". Absent when store-driven. */
  readonly producedText?: string;
  /** True when the context carries pre-context beyond the struck key. */
  readonly contextGuarded: boolean;
  readonly storeRefs?: readonly string[];
}

export interface TouchKeyRuleIndex {
  readonly byId: ReadonlyMap<NormalizedTouchKeyId, readonly TouchKeyRuleBinding[]>;
  readonly spellings: ReadonlyMap<NormalizedTouchKeyId, readonly string[]>;
  readonly producingIds: ReadonlySet<NormalizedTouchKeyId>;
  /** ir.raw.length — consumers MUST degrade when an opaque fragment could hold a rule. */
  readonly opaqueFragmentCount: number;
}

export function buildTouchKeyRuleIndex(
  ir: KeyboardIR,
  options?: { includeSpace?: boolean; customIdsOnly?: boolean },
): TouchKeyRuleIndex;
```

### 2.1 Which key a rule is keyed on

The **first** `{kind:"vkey"}` element in `rule.context`, after filtering plus-separators. This matches the existing `extractRuleVkey` and key-budget conventions; reuse the shared plus-separator predicate rather than re-deriving it (which requires lifting that predicate into contracts, re-exported from its current engine home so no call site changes). Rules with no vkey element are not indexed.

### 2.2 Scope: index `T_`, `U_`, **and `K_`**

Default is all three. This is deliberate scope expansion and it is the larger win: `sil_cameroon_qwerty.kmn` has `+ [K_QUOTE] > U+0300` with a `◌̀` keycap — the **identical** under-credit shape as `T_0300`, and equally invisible today. One join fixes both classes. `customIdsOnly: true` exists for the 0x092-parity dead-key check, which is about custom keys specifically.

### 2.3 Role classification — evaluated in this order

1. Output length 0, or exactly one raw element whose trimmed text case-insensitively equals `nul` → **`suppresses`**.
2. Exactly one raw element whose trimmed text case-insensitively matches `context`, `context(1)`, **or `context(N)` for N≥2** → **`guard`**. The `context(N)` form is KMN's offset re-emit; it re-emits context exactly as `context`/`context(1)` do and produces nothing, so it is classified with them rather than falling through to `opaque` — the classifier must recognize it as text distinct from the bare `context` spelling, not a numeric variant it fails to parse.
3. Every element is `useGroup` / `deadkey` / `beep` → **`transitions`**.
4. Any remaining raw element → **`opaque`**.
5. Otherwise → **`produces`**.

`guard`, `suppresses`, `transitions`, and `opaque` all carry `produced: []`.

This is what makes Cameroon's guard-first idiom correct **without special-casing the store name**:

```
any(diablock) + [T_0300] > context     → guard,    produces nothing
+ [T_0300] > U+0300                    → produces, U+0300
```

and it is what keeps `+ [T_CAM] > nul` classified as *wired, not dead*.

**A rule keyed on a `U_` id is an override, not redundancy, unless proven otherwise.** `forUnicodeKeynames` ([key-id-policy.md](key-id-policy.md) §1a) makes every `U_` id self-output *before* any rule can run against it, so a rule keyed on one always fires ahead of — and instead of — that default, exactly like a rule keyed on any other id. Report a `U_`-keyed `produces` binding as "redundant" only when its `produced` text equals the id's decoded codepoint(s) exactly; otherwise it is a genuine override and must not be flagged. (This governs the reporting layer built on top of role classification, e.g. [key-id-policy.md](key-id-policy.md) §3.5 — role classification itself is unaffected, since a rule that emits different text is still correctly `produces`.)

### 2.4 Two reuse rules

- **Production collection MUST reuse the exported `collectFromElements` walk**, called per binding with a **fresh** collector — that is precisely why it is exported. Store expansion (`index()` / `outs()`), NFC run-merging, and the control-character filters therefore cannot drift from `buildProducedSet`.
- **`producedText` is computed separately** as the concatenated *leading* char-run, and is `undefined` when the output is store-driven. A store-driven `T_` key has no single keycap string, and the coverage consumer needs to know that rather than guess.

**Modifiers are raw, not canonical.** The modifier-combo vocabulary (chirality unification, the NCAPS case-pair fold) lives in engine, which contracts cannot import; duplicating it would create a second source of truth. So the join returns raw uppercased/deduped/sorted words, **documented as non-canonical**, and engine callers canonicalize themselves. If canonical combos are later needed inside contracts, the clean fix is a **pure move** of the combo module into contracts, re-exported from its engine home so the public surface is byte-identical — a separate mechanical change, not part of this feature.

### 2.5 Case policy

Index on upper-case, matching `kmcmplib`'s case-insensitive matching, so the join finds the rule the compiler will find. This case-insensitivity has two distinct sources depending on the id kind, and only one of them is VKDictionary interning: an unknown/custom name (`T_…`, `U_…`) is interned into the VKDictionary case-insensitively (`Compiler.cpp`'s `GetVKCode`/`BuildVKDictionary` — see [research.md](../research.md) R5); a `K_` name instead resolves against the **fixed keyword table** (`VKeyNames` / `KeymanWebTouchStandardKeyNames` / `KMWAdditionalKeyNames`), a compiled-in lookup, not a runtime-interned one. The join's upper-case indexing is correct for both, but the attribution matters for anyone reading the compiler source looking for where a `K_` id resolves. Retain every as-written spelling. A key whose layout id and rule id differ only by case therefore **joins** (correct for our arithmetic) while remaining **reportable** — because Developer's validator compares case-sensitively and will warn on a file our compile accepts. That asymmetry is the entire reason for the case hint in §5.

**Footnote — `&mnemoniclayout`:** the mnemonic-layout system store shifts a `K_` name's meaning from a physical position to the character it produces (a mnemonic keyboard's `K_A` means "the key that types 'a'", not "the US-layout A position"). This join and the `K_`-scope expansion in §2.2 assume position semantics; mnemonic-layout interaction is out of scope for this increment and noted here so nobody reads the `K_` scope expansion as implying mnemonic support.

---

## 3. Touch coverage: additive, and all callers migrate together

Extend the existing function with an **optional options argument**, not a replacement function. Rationale: it is public from contracts with two callers plus its own suite; an options bag keeps every existing test green as a regression lock and makes each call site's migration visible in review — the same discipline `excludeBackspaceCorrections` used.

```ts
export interface TouchCoverageOptions {
  /** From buildTouchKeyRuleIndex(ir). Absent ⇒ today's semantics, byte-identical. */
  readonly ruleIndex?: TouchKeyRuleIndex;
  /** Additively credit a dotted-circle-stripped form of `text`. Default true. */
  readonly stripDottedCircle?: boolean;
}
```

Per key, after the existing text / output / `U_`-id collection, credit what the key's **producing** bindings emit, and pass the index down into `sk` / `multitap` / `flick` so a sub-key joins identically.

### 3.1 The U+25CC strip is additive and narrow

Never *replace* the credited text; always credit both forms. Strip only when, after removing every U+25CC, the remainder is **non-empty** and consists **solely** of combining marks (`\p{Mn}\p{Mc}\p{Me}`).

Consequences, each deliberate:

- `"◌̀"` additionally credits U+0300.
- A bare `"◌"` keycap is **not** stripped to empty — load-bearing, because `sil_cameroon_qwerty`'s `store(letter)` ends in a literal `◌`, making U+25CC a real inventory character on that keyboard.
- `"a◌b"` is untouched.

Because the strip only ever *adds*, the false-positive question reduces to "could crediting U+0300 for a key labelled `◌̀` ever be wrong?" — only if the key emits U+25CC+U+0300 as a literal unit, in which case its `output` or id already credits that literal and nothing is lost. Net risk: negligible. It also means the mark keys stop reading as uncovered even without the rule index — a useful independent safety net.

### 3.2 Migrate every caller in the same change

Four call sites, all in the same change. The engine wrapper (threading the index through **before** its composability augmentation, so a mark credited by the join then feeds composability — that compounding is the point); the Layer C coverage check (with the lint context building the index when a keyboard IR is present); the studio inventory-gate helper (whose inputs gain an optional index; absent, behaviour is unchanged, still failing closed on a corrupted layout); and [TouchGallery.tsx](../../../packages/studio/src/editors/assignLoop/TouchGallery.tsx)'s **direct** import of `computeTouchCoverage` (~line 1964), which builds `baseTouchCoveredSet` (the un-augmented, direct-reachability half of coverage, feeding `collectCompositionMethod`) independently of the engine wrapper. It is easy to miss because it bypasses that wrapper entirely — exactly the failure this section warns against. Leaving one caller on the unjoined path defeats the fix.

---

## 4. Two named producibility views

### 4.1 The plain view is frozen

`buildProducedSet`'s default semantics **do not change**. A regression test MUST pin that it still counts an orphan `T_` rule as produced. That single test is the anti-regression pin for `docs/keyboard-facet-index.json`.

### 4.2 The reachability view is a sibling function, not an option

```ts
export interface ReachableProducedSetResult {
  /** Produced by a rule whose struck key is actually reachable. */
  readonly reachable: Set<string>;
  /** Produced ONLY by unreachable-key rules — the honest delta. */
  readonly orphaned: Set<string>;
  readonly orphanBindings: readonly TouchKeyRuleBinding[];
}
export function buildReachableProducedSet(
  ir: KeyboardIR,
  options?: BuildProducedSetOptions,
): ReachableProducedSetResult;
```

Three reasons for a sibling rather than an option: the orphan list **is** the deliverable and an option returning a narrowed `Set` throws it away; an option on a heavily-called function invites a later contributor to flip the default; and the facet-transform equality invariant must keep asserting on the exact function it names.

### 4.3 Reachability predicate — by id prefix

| Struck key | Reachable when |
|---|---|
| `T_` | Its normalized id is carried by a key on a **reachable** layer (BFS from `default`, per platform, unioned across platforms), including `sk` / `multitap` / `flick` |
| `K_` | **Always** — a physical key exists regardless of the touch layout |
| `U_` | Same as `T_` (a `U_` id in a rule is layout-dependent) |
| any | If the IR has **no** touch layout, everything is reachable and the result equals `buildProducedSet` exactly |

The `K_` row and the no-layout row are both load-bearing: a desktop-only keyboard must never be penalized, and a physical key's rule must never be called unreachable because the touch layout omits it.

**Scope: "reachable" means layout-reachable only, and it has two documented limitations.** (a) The BFS checks touch-layer reachability from `default` only — it does not check that the rule's own **group** is reachable via the `.kmn` `use()` chain from the entry group. A rule sitting in a group nothing ever `use()`s is layout-reachable (its struck key is on a reachable layer) yet never actually fires; this view cannot see that. (b) There is **no layer↔modifier cross-check**: a `T_X` id carried only on the `default` touch layer, whose sole binding requires `[SHIFT T_X]`, is credited as reachable, because the struck key existing on a reachable layer is all this predicate asks — it does not verify the layer's own modifier state would satisfy the rule's context. Both are candidates for a later hint-level check (comparing a binding's `modifiers` against the layer(s) that carry its struck key); both are explicitly out of scope for this increment.

### 4.4 Adopter list — normative, and repeated in both module headers

| Consumer | View | Why |
|---|---|---|
| Layer C inventory-coverage check | **joined** | Already scope-guarded to a *scaffolded* IR with no opaque fragments — a keyboard **we** generated, where an orphan `T_` rule can only be our own bug (and becomes possible the moment rule synthesis ships and a later edit deletes the key). Zero legacy-corpus fallout by construction, and the facet index never runs on scaffolded IRs. |
| New orphan-rule check (§5) | **joined** | It is the reporting surface. |
| Studio inventory diff | **neither — extend** | Switching would move characters from "already produced" into "letters to add" for the ~205 corpus bases with orphan rules, silently increasing author workload and moving the §18.6 denominator. Add a **third** `producedButUnreachable` array instead; leave the existing arithmetic untouched and let the UI say "the base declares a rule for X but no key reaches it." |
| Facet-transform propose / verify | **plain** | The invariant is "did my transform change what the rules emit" — a rules-only question. Making it reachability-dependent would make a no-regression assertion flaky whenever the layout is edited in the same session. |
| All `utilities/facet-index` classifiers | **plain** | Committed `docs/keyboard-facet-index.json` + corpus-calibrated tests. |
| `producedGlyphs`, char-contributor attribution, character-discovery, mechanism gallery, character-map tinting, convenience-chars gate, carve nodes, desktop-modification derivation | **plain** | None asks a reachability question; several run before any touch layout exists. |

`docs/keyboard-facet-index.json` MUST be regenerated and asserted **byte-identical** in the change that introduces the joined view.

---

## 5. Layer C checks

**No rows are added to `criteria.json`.** Its length is not test-asserted — `schemas.test.ts`/`types.test.ts` deliberately assert schema-validity and the four-band partition (every record falls into exactly one band, no orphans), never a literal cardinality, precisely so the catalog can grow (see this repo's CLAUDE.md contract-source-of-truth note). The real constraint is `CriteriaBands.lintRuleId: string` — **singular, 1:1** with a criterion row. A prior check addition hung several sibling codes off one row's `lintRuleId` and was reverted for exactly that reason: nothing enforces a code↔criterion bijection, and a row's own description stops describing what its codes report. So every new code here lands at **check-module level** — an additional finding emitted by an existing 18.x check file, documented in that file's header — not as an extra code hung off a criteria row whose description doesn't cover it. This is the same shape the existing touch-coverage precedent already uses, and it holds regardless of catalog size: the argument is the content-team-surface one (a criteria row is authored prose reviewed by Content; a check-file addition is Engine's own surface), not a row-count budget.

| Sibling of | Code (illustrative) | Severity | Keyman analogue |
|---|---|---|---|
| 18.6 inventory coverage | `KM_LINT_TOUCH_KEY_NO_RULE` | warning | `WARN_TouchLayoutCustomKeyNotDefined` 0x092 |
| 18.6 | `KM_HINT_TOUCH_KEY_ID_CASE` | **hint** | — (the latent case asymmetry, §2.5) |
| 18.6 | `KM_LINT_TOUCH_RULE_ORPHAN` | warning | — (Developer has no such check) |
| 18.4 control-key drift | `KM_WARN_TOUCH_DUPLICATE_KEY_ID` | warning | — |
| 18.4 | `KM_WARN_TOUCH_MISSING_REQUIRED_KEY` | warning | `WARN_TouchLayoutMissingRequiredKeys` 0x093 |
| 18.5 layer-switch return | `KM_WARN_TOUCH_MISSING_LAYER` | warning | `WARN_TouchLayoutMissingLayer` 0x091 |

**`ERROR_TouchLayoutInvalidIdentifier` 0x05A is deliberately absent from this table — it is not a Layer C check.** An id the compiler rejects is a Layer A validity concern, not a style/hygiene one, and every check shipped in `@keymanapp/keyboard-lint` today is warning-severity (grep confirms zero `error` severities) — introducing the first Layer C error here would be a layer-boundary breach. The two paths that actually own it: for author-typed ids, **edit-time rejection** (FR-045, [key-id-policy.md](key-id-policy.md) §3.1) blocks the mutation before it can be saved; for an imported keyboard's existing ids, this is exactly the shape of a **Layer A′ import-fidelity** check ([layer-a-prime.ts](../../../packages/engine/src/validator/layer-a-prime.ts) is the precedent for validity findings surfaced on import rather than on edit). Neither path adds an error to Layer C.

**Severity policy: keep parity with Developer for everything Layer C does own.** Every code in the table above stays warning-or-hint, matching the fact that Developer's touch-layout validator has exactly one error (0x05A, routed away as above) and everything else is a warning. Do **not** promote the dangling-`nextlayer` check to an error even though it silently under-credits our own reachability BFS — upstream warns, and hundreds of corpus keyboards contain instances. Escalation belongs in **edit-time validation**, which rejects a *mutation* rather than emitting a *finding* (FR-045).

### 5.1 Dead-`T_`-key exemptions — mirroring 0x092, and then some

These exemptions **are** the design, so each needs its own test.

- Skip when the key has a `nextlayer` (0x092 parity — it is a layer-switch key).
- Run only when `sp ∈ {absent, 0, 8}` (0x092 parity — requires the corrected enum reading from [research.md](../research.md) R2).
- Skip a `*`-prefixed keycap label (frame-key labels such as `*Shift*`, `*abc*`).
- Skip the sentinel ids (`T_BLANK`, `T_SPACER`, `T_NUL`) and any blank/spacer-class key.
- Skip Developer's auto-mint `T_new_*` and our reserved neutralization prefixes (`T_removed_*`, `T_carved_*`, `T_touchdel_*`).
- **Downgrade to a hint when any opaque fragment is present anywhere in the IR** — i.e. `ir.raw.length > 0`, whole-IR scope, not scoped to the key's own group. This matches the touch-coverage check-18-6 precedent of skipping conservatively on *any* opaque fragment rather than trying to localize. Finer (same-group) scoping is deliberately not attempted: an opaque fragment's group attribution is exactly the information the codec failed to recover when it fell back to `RawKmnFragment` in the first place (see [codec/opaque-reasons.ts](../../../packages/engine/src/codec/opaque-reasons.ts)) — there is no group to scope the check to.
- A key whose only bindings are `guard` / `suppresses` / `transitions` / `opaque` is **wired, not dead**. Only *zero bindings at all* fires. `+ [T_CAM] > nul` MUST NOT be reported.
- Descend into `sk` / `multitap` / `flick`, as Developer does. Cameroon's `U_00A1` / `U_00BF` longpresses under `T_0021` / `T_003F` are correctly exempt because a `U_` id self-outputs.

**0x093 required keys, upstream citation.** The required set is `CRequiredKeys = [K_LOPT, K_BKSP, K_ENTER]` (`keyman/developer/src/kmc-kmn/src/kmw-compiler/constants.ts`, `TRequiredKey`/`CRequiredKeys`), checked by `ValidateLayoutFile` in `keyman/developer/src/kmc-kmn/src/kmw-compiler/validate-layout-file.ts` against a single `FRequiredKeys` accumulator per layer. **The set does not vary by platform or layer** — the same three-key list is required of every layer of every platform the file declares; there is no phone/tablet-specific required set in this code path.

### 5.2 Orphan-rule reporting

Fires only when a touch layout exists. Distinguish two sub-reasons so the AZERTY defect is told apart from a stranded layer: **absent** (the id is on no key of any layer of any platform) versus **unreachable-layer** (present, but only on a layer the `default` BFS never reaches). For **absent**, name the near-miss when one exists — for `T_03B1` the layout carries `U_03B1`, so the actionable message is that the self-outputting `U_` id **bypasses the author's `any(diablock)` guard**. That is the finding's real payoff.

### 5.3 Duplicate-id exemptions

In order: sentinel/auto ids; blank/spacer class; and **keys disambiguated by a per-key `layer` override**. That third exemption is what takes the check from ~13,900 corpus findings to ~1,170, and it is **unimplementable on `TouchLayoutIR` today** — see §7.

### 5.4 Wiring

The joined checks need rules *and* layout. Add one internal resolver so precedence is stated once — the IR's touch layout first (spec-014 made it the canonical mutable home), then the lint context's, then a VFS parse — and gate the joined checks on a keyboard IR being present, exactly as the desktop inventory check is gated. No new lint-context field is required.

---

## 6. Mutation contracts

### 6.1 Rule synthesis

`ensure` / `remove` / `rename` operations for a touch key's rules, in engine.

- **Opaque carve-out (P0-4).** When `opaqueFragmentCount > 0`, synthesis MUST downgrade from automatic to warn-and-confirm before writing anything. The join cannot prove no equivalent rule for this key already hides inside a `RawKmnFragment` — that is the same blind spot §5.1's dead-key downgrade exists to acknowledge — and a silent synthesis on such a keyboard risks emitting a rule that permanently shadows or duplicates one already there, which violates the idempotence guarantee below and FR-027/SC-008. This gate applies before the "Group choice" step, not after: nothing below runs unconfirmed when an opaque fragment is present.
- **Group choice: the entry group** — the first `using keys` writable group, resolved with the existing helper. Not a dedicated group: a `T_` rule must fire on a keystroke, so it must live in a `using keys` group, and a second one is reachable only via an explicit hop — needless machinery plus a real ordering hazard. Insert before the terminal `match` / `nomatch` rules using the existing helper, lifted to a shared location so the mark-guard synthesizer and this one cannot diverge.
- **Ordering is correctness, not cosmetics.** Emit guard-then-producing as a **contiguous pair** in that order, matching the attested Cameroon source order. When a guard already exists for this key+combo, insert the producing rule **immediately after it**, never at the group tail — a producing rule ahead of its guard silently defeats the guard.
- **Idempotency MUST be semantic, not nodeId-based.** Recognize our own output by a generated-nodeId prefix (`gen-touch-*` — see the naming rule below), *but* dedupe by matching (normalized id, canonical combo, role) against **any** existing rule via the join. Otherwise importing Cameroon and touching one key would duplicate all of its hand-written `T_` rules. A hand-written match counts as unchanged and is **never rewritten**.
- **Guard naming follows the [mark-guards.ts](../../../packages/engine/src/pattern-apply/mark-guards.ts) precedent exactly — do not mint a third scheme.** That module's own convention is nodeIds under `gen-marks-*` (e.g. `gen-marks-block-1`, `gen-marks-guard-hop`) with store/group *names* under `generated_marks_*` (e.g. `generated_marks_guard`, `generated_marks_unwrap_from`) — nodeId and name deliberately use different prefixes. Rule synthesis here is the sibling: nodeIds under `gen-touch-*`, store/group names under `generated_touch_*`.
- **Guard synthesis** triggers when the output is a single combining mark. Propose reusing an existing guard-shaped store (non-system, all char items, contains space and digits, contains no letters — Cameroon's `store(diablock)` matches) before minting one under the `generated_touch_*` convention above. Propose-then-confirm: the author sees the store and the rules before they are written. **A freshly minted guard store MUST be populated from the keyboard's own repertoire** — declared exemplars or the discovered inventory via character-discovery — never a hardcoded ASCII literal. Cameroon's `diablock` (space, digits, ASCII punctuation) is that keyboard's own convention, not a universal one; a keyboard whose punctuation or digit repertoire is non-Latin needs its own guard set derived the same way, or the guard protects nothing for it.
- **Case variants** are driven by explicit combos, with defaults derived from the keyboard rather than invented — propose the CAPS/NCAPS triple only when the keyboard already handles CAPS, detected with the existing predicate, reusing the existing notion of the case quad.
- **Delete MUST NOT cascade silently.** A `T_` id can legitimately appear on several layers and platforms. On key deletion, recompute presence; only when the id is carried by **no** key anywhere, **propose** removing its rules (producing and guard, plus the guard store if now unreferenced), defaulting to remove for rules we generated and to **keep-and-let-the-orphan-check-report-it** for hand-written or imported ones. Silently deleting an author's guard rule because they moved one key is exactly the failure the orphan check exists to describe.
- **Rename** rewrites the vkey name on every binding for the old id (guard and producing alike), the layout key id, the node-id map entries (which embed the key id), and any matching address in the studio's deletion overlay — where a stale address silently fails to resolve, which is desirable idempotence for the carve cascade but silent data loss here.

**Normalization.** Synthesized output text passes through the same NFC run-merge `collectFromElements` already applies (§2.4) — synthesis must not invent a second normalization path. **Canonical ordering *across* successive keystrokes (mark stacking) is explicitly out of scope this increment.** If an author types two synthesized `T_` mark keys in sequence, the resulting combining-mark order is whatever order the keystrokes occurred in; reordering to canonical combining-class order is the author's domain, not something synthesis attempts. Documented here so the gap is a stated decision, not a silent one.

### 6.2 One operation type, two thin appliers

Requirement R9 (spec 035) means the import-adapt emission path must never round-trip through the IR. Rather than writing every applier twice, define **one** key-edit operation type — add / remove / set / rename key, add / remove sub-key, and (later) add / remove row and layer — addressed by the **existing** `touchKeyAddress` scheme, with:

- one shared address **parser** (the inverse the repo currently lacks), placed beside the existing builders so format and parser cannot drift;
- one shared field-semantics function (the single place where, for example, changing a key's id clears a stale `output`);
- two thin appliers: an IR one reusing the existing structural-sharing skeleton and node-id minting, and a raw-JSON one reusing the existing platform→layer→key index build and placeholder-promotion behaviour.

**The defence against the doubling is a test, not discipline:** apply the *same* operation list through both appliers, parse the raw-JSON result with the canonical parser, and structurally compare against the IR result — modulo node ids and the fields Case A is documented to drop. Any operation whose twins diverge fails immediately.

Which mutations need the raw twin: **all layout operations** (R9). Rule synthesis does **not** — R9 protects the `.keyman-touch-layout` bytes only, and the `.kmn` has its own emit path that existing assignment and mark-guard synthesis already travel. One risk to *test* rather than assume: for an imported base with opaque fragments, the emitter uses a position-faithful path keyed on source lines, and synthesized rules carry none. Pin it with an emit → parse → re-emit round-trip on the Cameroon fixture.

---

## 7. The one locked-contract change

**`TouchKeyIR.layer?: string`** — the per-key modifier override — **and `TouchKeyIR` (subkey) `default?: boolean`** — the longpress preselect flag. Both are additive and optional (absent ⇒ no override / not preselected), so a minor bump under the 0ver convention, matching the shape of the earlier `provenance` addition. `default` joins `layer` here rather than getting its own change because it is the same defect class: a real serialized wire field the writer special-cases (`keyman-touch-layout-file-writer.ts` deletes a literal `false` — `if(Object.hasOwn(key, 'default') && (<any>key).default === false) delete (<any>key).default;` — so `true` survives) that [parseTouchLayout.ts](../../../packages/contracts/src/parseTouchLayout.ts)'s `convertKey` never maps and the engine emitter never round-trips, and the studio's own longpress editing needs to know which sub-key is preselected without re-deriving it.

Must land in **one** commit across: the interface, the zod mirror, the compile-time drift guard, the parser's key conversion, and the emitter's key emission — for **both** fields. Requires §18 sign-off recorded in [docs/spec-signoff.md](../../../docs/spec-signoff.md).

Justification (measurements in [research.md](../research.md) R4): 11,593 corpus keys use `layer`; without the field the duplicate-id check is unimplementable on the IR, Case A silently collapses those keys, and the studio could add a key that `touchKeyAddress` cannot stably address. `default` has no equivalent corpus count in this pass, but the drop is unconditional (zero hits in `parseTouchLayout.ts`) and cheap to fix at the same time as `layer`.

**If declined:** run the duplicate-id check against raw JSON inside `keyboard-lint`, which already has the VFS and its own parser, and record the Case A fidelity loss as a known limitation. The addressing hole remains, mitigated only by rejecting new in-layer collisions at edit time. **This also has a UI consequence, not just a lint one:** any key whose disambiguation depends on `layer` (or whose longpress preselection depends on `default`) renders **read-only in the grid**, with an explanatory note, and is **excluded from mutation** — the studio must never silently mis-address a key it cannot uniquely identify or silently drop a preselection it cannot represent.

**Explicitly declined:** adding a `context` member to the output-element union. The join classifies raw text correctly (§2.3); this would touch a locked union with a round-trip emitter for no functional gain.

---

## 8. Test obligations

- **Role matrix**: produces · `> context` guard · `> nul` · `use()` · opaque raw · `index()`-driven · `outs()`-driven; case normalization and spelling capture; multi-char `producedText`; `[SHIFT T_…]` modifier capture; opaque-fragment count; `K_`-id indexing.
- **Reachability**: an orphan `T_` excluded from reachable; a `K_` rule always reachable; **no touch layout ⇒ result deep-equals `buildProducedSet` and orphaned is empty**; a `T_` on an unreachable layer counted as orphaned.
- **Coverage regression locks**: a two-argument call is byte-identical to today's output; `T_0300` with a `◌̀` keycap credits U+0300 **only** when the index is passed; the U+25CC strip is additive; a bare `◌` keycap is not stripped to empty; multi-char and `sp:8` keys behave per the corrected enum.
- **Plain-view lock**: `buildProducedSet` still counts the orphan `T_` rule. Plus a byte-identical regeneration of `docs/keyboard-facet-index.json`.
- **Each lint check**: one test per exemption, individually.
- **Rule synthesis**: re-run adds nothing (idempotence — re-running synthesis over a keyboard already carrying an equivalent hand-written rule adds nothing); semantic dedupe against a hand-written Cameroon rule; guard-store reuse versus mint; guard-before-producing adjacency; insertion before an existing terminal rule; the CAPS triple gated on existing CAPS handling; rename and remove synchronization including the node-id map; and the emit → parse → re-emit round-trip with opaque fragments present.
- **Applier twin equivalence**, per §6.2 — reusing **the fixture** below (no second fixture): the same inline Cameroon-derived structure feeds both the role-matrix/reachability tests above and the applier-twin comparison.
- **Declared-writes containment** for the studio seam, verified by test rather than by reading the prose (see [research.md](../research.md) R9 on why the prefix rule is looser than it looks).
- **`TouchKeyIR.layer` codec round-trip**: a key carrying `layer: "shift"` (and, separately, a subkey carrying `default: true`) survives parse → emit unchanged. A duplicate-id fixture disambiguated only by a per-key `layer` override resolves as two distinct keys in `TouchLayoutIR`, not one collapsed key.
- **Corpus-wide aggregate figures are narrative only, never test-asserted.** The two named canaries below (QWERTY, AZERTY) are the only pinned fixtures; no test asserts a corpus-wide count.

### The fixture

A reduced, **deliberately defective** Cameroon-derived fixture, built **inline** rather than read from disk — contracts must stay I/O-free and browser-safe, and the fixture needs a defect the real QWERTY file does not have. It must carry: a mark key plus its guard rule; a SHIFT-doubled mark key; a multi-char output; a `> nul` key with a `nextlayer`; ruleless sentinel and frame keys; `U_` longpresses under a `T_` key; a guard store; a duplicate id pair and a `layer`-override-disambiguated pair; and **the injected AZERTY orphan** — a rule pair for an id the layout carries only in its `U_` form.

Plus real-corpus canaries using the established skip-if-absent pattern, asserting exact numbers so drift is caught: the QWERTY layout's distinct `T_` id count, **zero** dead-key findings for QWERTY, exactly **one** orphan finding for AZERTY, and all fourteen QWERTY mark keys covered once the index is threaded.
