# DISCUS principles → programmable design heuristics

This document analyzes Marc Durdin's **DISCUS** keyboard-design framework (from [keyboard-design-principles.md](keyboard-design-principles.md)) and maps each principle onto the keyboard-studio pipeline: what is *already* operationalized at generation time, what becomes an **automated verification check** on the first-draft keyboard, and what is **inherently human** and can only be surfaced as a prompt or a checklist item.

The auto-checkable heuristics are wired into the existing validator/lint model — **no new validator layer**. They live as section-18 rows in the [criteria catalog](../packages/contracts/data/criteria.json) (`Criterion[]`, [criteria.ts](../packages/contracts/src/criteria.ts)) and surface through Layer B (style) / Layer C (hygiene) per [spec.md §10](../spec.md). Each row is tagged with its `principle` (`DiscusPrinciple`).

## The framework

| Letter | Principle | Core idea |
|--------|-----------|-----------|
| **D** | Discoverability | Make all characters easy to find, even rare ones; reduce experimentation |
| **I** | Intuition | Design so the keyboard feels natural without explanation |
| **S** | Simplicity | Keep it focused; don't overload keys; separate input from encoding |
| **C** | Consistency | Align with script structure and linguistic conventions |
| **U** | Usability | Test with real users; good on paper ≠ good in practice |
| **S** | Standards | Follow Unicode, accessibility laws, and locale conventions |

## Key finding: three buckets

DISCUS is **not** a fresh layer bolted onto the pipeline. Much of it is *already* encoded in the [§7.1 discovery axes](../spec.md) and the [kbgen](../utilities/kbgen/INTEGRATION.md) placement seeder. The genuinely new work is **verification feedback on the first draft** plus a few **human-judgement prompts**.

| Principle | Already encoded (generation time) | New auto-check (verification) | Inherently human |
|---|---|---|---|
| **D — Discoverability** | A3 (phonetic intuition) + A7 (spare-key availability) axes steer the strategy selector toward reachable layouts; kbgen `map.js` already proves every *base* character stays reachable | **Coverage**: every confirmed `LinguistInventory` character is produced by some reachable input sequence in the draft. **Reachability**: flag characters reachable only via deep long-press or >2 modifier hops | — |
| **I — Intuition** | Strategy galleries (Phase C/E) demo intuitive behaviors as live mini-keyboards (long-press, tone cycle) | **Convention-presence hint** (advisory): smart-backspace / atomic-cluster deletion (building block §7.4.A) present where composed clusters exist; long-press used for related characters | "You know it when you have it" — the felt quality is not mechanizable |
| **S — Simplicity** | A1 (scale) gates strategy complexity: tiny → S-01 simple swap; large → S-05/S-06 | **Long-press size** (warn > 8, hard cap 10); **key-overload** (variants per key). One-language scope is already a repo-hygiene criterion | "Carefully consider every extra character" — the editorial judgement of *what to include* |
| **C — Consistency** | A4/A5 axes; `LinguistInventory` + CLDR cross-check encodes "well-researched"; modifier-name consistency is already a Layer C criterion (7.x) | **Frequency-vs-placement** (advisory): high-frequency characters (`InventoryChar.count`) not buried on hard-to-reach positions | Depth of linguistic analysis; whether alphabetic vs. grouped-by-sound is the *right* call for the language |
| **U — Usability** | A6 (constraint enforcement) adds S-10 beep feedback; A7a (remap posture) gates full-remap rule 8 | **Mobile rules-of-thumb** (the flagship check set, all over the `.keyman-touch-layout` JSON): row count, keys-per-row, control-key stability across layers, layer-switch toggle-back, long-press depth | "Testing is the only way to be sure" — real-user testing |
| **S — Standards** | Layer A Unicode codepoint validation + NFC normalization; BCP47 routing (Phase A) | **Mandated characters**: the locale's CLDR currency symbol is reachable. Majority-layout consistency (e.g. INSCRIPT) is advisory | Legislated / societal / accessibility-law sign-off |

**Conclusions:**

1. The **Usability mobile rules-of-thumb** are the cleanest, highest-value programmatic win — concrete numeric/structural assertions over the touch-layout JSON. They are the flagship Layer C checks (18.2–18.5) plus the Simplicity long-press cap (18.1).
2. **Discoverability coverage/reachability** (18.6) is the second win — a draft-keyboard audit comparing the confirmed inventory against the set of characters the keyboard can actually output.
3. **Intuition** and **real-user Usability testing** are inherently human → `yellow-survey` / `red-checklist` bands, never auto-blocking.
4. Much of D / S / C / Standards is *already* implicit in the discovery axes and kbgen. The new criteria deliberately do **not** duplicate that generation-time work — they verify the *output*, which the axes never see.

## The section-18 criteria

All twelve rows live under section `"18. Design heuristics (DISCUS)"` in [criteria.json](../packages/contracts/data/criteria.json), each tagged with `principle`.

### Auto-checkable — band `layer-c-enforce`

These run as Layer C hygiene on **phase-exit (Phase E for touch checks) and at submit** (see [spec.md §8 step 12](../spec.md)); the long-press cap (18.1) can also run as a per-edit Layer B style hint. Each carries a `lintRuleId` → a studio `KM_*` code ([LintCode](../packages/contracts/src/lintFinding.ts)).

| id | principle | `lintRuleId` | Severity | Inspects | Threshold |
|---|---|---|---|---|---|
| `18.1-longpress-within-limit` | simplicity | `KM_WARN_LONGPRESS_OVERSIZE` | warning (>8), error (>10) | `.keyman-touch-layout` `sk` arrays | ≤ 8 ideal, 10 hard cap |
| `18.2-touch-rows-within-range` | usability | `KM_WARN_TOUCH_ROW_COUNT` | warning | `.keyman-touch-layout` rows per platform | phone 4–5, tablet 5 |
| `18.3-keys-per-row-within-range` | usability | `KM_WARN_TOUCH_KEYS_PER_ROW` | warning | `.keyman-touch-layout` keys per row | phone ≤ 10, tablet ≤ 13 |
| `18.4-control-keys-stable-across-layers` | usability | `KM_WARN_CONTROL_KEY_DRIFT` | warning | Backspace/Enter geometry across layers | position + size constant |
| `18.5-layer-switch-toggles-back` | usability | `KM_WARN_LAYER_SWITCH_NO_RETURN` | warning | layer-switch key wiring | every switch has a return |
| `18.6-inventory-fully-covered` | discoverability | `KM_LINT_INVENTORY_UNCOVERED` | warning | compiled output set vs. `LinguistInventory` | every inventory char reachable |
| `18.7-mandated-currency-present` | standards | `KM_LINT_MANDATED_CHAR_MISSING` | info | output set vs. CLDR locale currency | currency symbol reachable |

Severities follow [lintFinding.ts](../packages/contracts/src/lintFinding.ts): `info` is Layer-C-only (notable, never blocking); design heuristics are advisory by default (`warning`), so they surface as yellow lint chips rather than hard Submit blocks unless a project opts to escalate.

### Judgement-dependent — band `yellow-survey`

Surfaced as plain-language survey questions (`surveyQuestionId`) at the relevant phase; the answer is recorded, not auto-derived.

| id | principle | Asks |
|---|---|---|
| `18.8-character-set-is-minimal` | simplicity | Did you resist adding extra characters; was each addition deliberate? |
| `18.9-rare-chars-discoverable` | discoverability | Are rare characters findable without experimentation? |
| `18.10-frequent-chars-reachable` | consistency | Do frequent characters sit on easy positions consistent with the script? |

### Inherently human — band `red-checklist`

Manual pre-submit attestations (`preSubmitChecklistText`).

| id | principle | Attests |
|---|---|---|
| `18.11-tested-with-real-users` | usability | The layout has been tested with target users |
| `18.12-meets-legal-accessibility-requirements` | standards | Applicable legal / accessibility requirements are met |

## Where each check runs

- **Layer B (style), per-edit 300 ms cycle** — the long-press cap (18.1) and the convention-presence hints fit here as advisory AST/JSON style findings.
- **Layer C (hygiene), phase-exit + submit** — 18.2–18.7 run when the relevant artifact is complete: the touch checks on Phase E exit, inventory coverage (18.6) once the desktop rules compile, currency (18.7) at submit.
- **Survey engine** — the `yellow-survey` rows render as questions in their phase (Simplicity/Discoverability at Phase B/C, Consistency at Phase C).
- **Pre-submit checklist** — the `red-checklist` rows appear in the final gate before PR/zip output.

## Prerequisite (implementation dependency, out of scope here)

The touch rules-of-thumb (18.1–18.5) require **parsing the `.keyman-touch-layout` JSON**. Today the contracts package has **no structural touch-layout type** — touch layout exists only as opaque JSON strings in `Pattern.touchLayoutFragment` ([pattern.ts](../packages/contracts/src/pattern.ts)), validated ad hoc against the Phase E JSON schema. Implementing these checks needs a minimal `TouchLayout` shape (platform → layers → rows → keys, with `sk` long-press arrays) or reuse of the Phase E schema. That type and the executable check logic belong to the not-yet-built `@keymanapp/keyboard-lint` engine; this change only **registers the criteria and their codes** so the engine has a contract to implement against.

## What this change does and does not do

**Does:** publishes the DISCUS → programmability analysis; adds the 12 section-18 criteria to the catalog; adds the `DiscusPrinciple` union and the optional `principle` tag to [criteria.ts](../packages/contracts/src/criteria.ts); keeps counts honest in [criteria-summary.md](../packages/contracts/data/criteria-summary.md) and [CLAUDE.md](../CLAUDE.md).

**Does not:** implement the lint check logic (no real lint engine exists yet — only the contract + mock); add a `TouchLayout` contract type; touch the locked `Pattern` schema. These are additive, non-breaking criteria-catalog changes, not a Pattern-schema revision, so no joint engine+content session is required ([spec.md §17](../spec.md)).

## References

- [keyboard-design-principles.md](keyboard-design-principles.md) — the DISCUS source (Durdin, EMDC Online 2023)
- [spec.md §7.1](../spec.md) — discovery axes A1–A7
- [spec.md §10](../spec.md) — validator/lint Layer A/B/C
- [spec.md §11 / §14 D4](../spec.md) — criteria four-band model
- [criteria.ts](../packages/contracts/src/criteria.ts) — `Criterion` union + `DiscusPrinciple`
- [criteria.json](../packages/contracts/data/criteria.json) — section-18 rows
- [utilities/kbgen/INTEGRATION.md](../utilities/kbgen/INTEGRATION.md) — placement seeder (already enforces base-char reachability)
