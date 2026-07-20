# Contract: Value-Transition Matrix + Migration Rules

The central owned artifact of spec 039 (design brief split-C). Defines, per transformable
facet/sub-profile, the supported `from → to` pairs, their loss profiles, and their migration rules —
and the honestly-bounded v1 subset with every other pair **declined-with-reason** (FR-004).

> **Independence (D5).** Modeled on the §7.2 ordered-decision-table *pattern*; does **not** reuse
> `StrategyId` / `PrimaryRuleNumber` / the locked §7.2 tree.

## Matrix invariants

1. **Every requestable pair has a row.** Supported pairs carry a `migrationRuleId`; unsupported pairs carry
   a `declineReason`. A pair with neither is a build error — the decline path is never "silently absent"
   (FR-004).
2. **`lossless` ⇒ behavior-preserving.** A build-time check asserts `lossProfile === 'lossless'` only on rows
   whose `transformImpactClass === 'behavior-preserving'`.
3. **Impact-class drift guard.** Each row's denormalized `transformImpactClass` must equal the
   facet/sub-profile's declared class.
4. **Gate facets produce no rows.** `source.mnemonic-vs-positional`, `source.casing` are refused upstream
   (never transformed); requesting them yields a gate-refusal explanation, not a matrix lookup.
5. **`mixed` is a valid `fromValue`.** `mixed → <pole>` (normalize toward one value) is a first-class row,
   not an edge case — it is US1's common request.

## v1 supported rows

| facetId (sub-profile) | from → to | class | lossProfile | migrationRuleId |
|---|---|---|---|---|
| `source.encoding.output-spelling` | `quoted-literal ↔ u-notation`, `mixed → house-style` | behavior-preserving | lossless | `encoding-spelling` |
| `source.encoding.input-within-kind` | `bare-vk`/`named-modifier`/`split-modifier` folds; char-ref `quoted-literal ↔ u-notation` | behavior-preserving | lossless* | `encoding-spelling` |
| `source.touch-combo-mechanism` | `longpress → flick` | ux-changing | lossy-with-named-loss | `longpress-to-flick` |
| `source.normalization-posture` | `nfd → nfc` | output-changing | lossy-with-named-loss | `nfd-to-nfc` |

`*` modifier folds are lossless only when the per-site precondition holds (see `encoding-spelling` below);
sites failing it are refused per-site, not silently collapsed.

## v1 declined-with-reason rows

| facetId | pair | kind | declineReason (verbatim to user) |
|---|---|---|---|
| `source.encoding.input-match-kind` | `key-ref ↔ char-ref` | **permanent** | "Match-kind changes *what the input matches* (a keystroke vs a produced character that may be unreachable), not just its spelling — not a safe automatic transform." |
| `source.desktop-combo-mechanism` | any `↔ os-compose` | **permanent** | "os-compose relies on OS-level behavior Keyman cannot represent or verify — no compiler check surface." |
| `source.mnemonic-vs-positional` | any | **permanent (gate)** | "Mnemonic-vs-positional is a portability gate (mnemonic is Windows-only), not a switchable mechanism." |
| `source.casing` | any | **permanent (gate)** | "Casing is a fact about the target script, not a construction choice that can be switched." |
| `source.normalization-posture` | `nfc → nfd` | **deferred (v2)** | "Composing → decomposing needs Unicode decomposition data, newly-synthesized backspace rules, and a keyboard-wide context-offset re-audit — deferred." |
| `source.fallback-posture` | `relies-on ↔ blocks-comprehensively` | **deferred (v2)** | "Requires a full base-layout key-map (per the keyboard's own `&baselayout`) and changes the produced-character set — deferred to a dedicated hardening pass." |
| `source.desktop-combo-mechanism` | `deadkey ↔ context-match`, `modifier-key → deadkey` | **deferred (v2)** | "Desktop mechanism switching reads distinct KMN-rule evidence and needs its own fixtures — deferred." |
| `source.touch-combo-mechanism` | `layer ↔ {longpress,flick,multitap}` | **deferred (v2)** | "Converting a whole-keyset layer to per-key alternates is underdetermined (no principled host-key mapping) — deferred." |
| `source.reordering-rules` | any | **deferred (v2)** | "Reordering is a structural convention (group + use), not a keyword; no fixture basis yet — deferred." |

## Migration-rule contracts (v1)

### `encoding-spelling` (behavior-preserving)

- **Scope**: output base/combining spelling `'a' ↔ U+0061`; within-kind input spelling (char-ref
  `'e' ↔ U+0065`; modifier `named ↔ split`). **Never** touches the match-kind axis.
- **Precondition (modifier fold)**: `named-modifier → split-modifier` is lossless only by emitting the
  `LSHIFT`+`RSHIFT` pair (a `SHIFT` match covers either key); `split → named` folds only when existing
  `LSHIFT`/`RSHIFT` outputs are identical. Sites failing this are refused per-site.
- **verify**: `buildProducedSet` equality (pre-check) + compile+`simulate` over `generateCorpus` finalOutput
  equality (D6); invertibility via `assertSemanticEquivalence(before, inverse(after))` (D7).
- **companionRewrites**: none.

### `longpress-to-flick` (ux-changing)

- **Scope**: `TouchLayoutIR` only. Rewrites `TouchKeyIR.sk` → `TouchKeyIR.flick`; sets `TouchKeyProvenance`
  explicitly on each rewritten key (never clobbers hand-set).
- **derivesParameters**: true — derives a compass direction per subkey (position-order → nearest available
  direction), surfaced for user review; the derivation is not authoritative.
- **Bound**: keys with subkey count > flick-direction budget are **refused per-site with a reason**
  (character-coverage loss), never truncated silently.
- **namedLosses**: discoverability (browsable menu → memorized blind gesture).
- **verify**: produced-output unchanged (the *output* is identical; only input UX changes) via compile+
  `simulate`; UX description in the preview.

### `nfd-to-nfc` (output-changing)

- **Scope**: composes base+combining RHS → precomposed codepoints.
- **companionRewrites**: the backspace-rule rewrite — **remove the now-unreachable** two-codepoint backspace
  override (`'a' U+0301 + [K_BKSP] > nul`) so single-backspace deletes the composed codepoint. Detected as a
  Check #11-adjacent unreachable rule, not synthesized.
- **verify**: an **output-level diff** (what emitted bytes change) presented before commit (FR-008/AC2);
  requires explicit confirmation. Not parity-checked (output is *meant* to change) but must not break compile.

## Common gate (all migration rules)

Before commit, on the candidate IR (transient, discarded on failure — research D8):
1. `MigrationRule.verify` per class (above).
2. Opaque integrity: diff `ir.raw` before/after; any disappeared/altered `RawKmnFragment` not explicitly
   confirmed ⇒ FR-009 violation, report and do not commit (D12).
3. `validateWithOracle` / `compile` once, undebounced — compile failure ⇒ `commit-failed`, working copy
   unchanged, failure attributed to the proposal (FR-010/SC-006).
4. On commit: write via `setWorkingIR`; if the produced-character set changed, re-seed discovery axes so
   strategy/gallery re-derive (FR-013/D11).
