# Research — Spec 040: Desktop base-layout fall-through in the script facet

Phase 0 for [plan.md](plan.md). Resolves the three open questions the [spec](spec.md)
left for `/speckit-specify`, plus the design unknowns the codebase raised. Each entry is
**Decision / Rationale / Alternatives considered**.

## Context established by codebase reading

- The `script` classifier ([utilities/facet-index/script-classifier.ts](../../utilities/facet-index/script-classifier.ts))
  derives its histogram purely from `buildProducedSet(ir)`
  ([packages/contracts/src/ir/producedSet.ts](../../packages/contracts/src/ir/producedSet.ts)),
  which walks only rule outputs (RHS) + opaque `producedOutput` sketches. It never models
  physical-key fall-through — the gap this spec closes.
- `buildProducedSet` is a **shared** utility consumed by both the §8 inventory diff (engine)
  and the §18.6 coverage check (keyboard-lint). Its contract is deliberately "glyphs the rules
  statically produce" — base-layout fall-through is a desktop-*classification* concern, not a
  produced-set concern, so it must **not** be folded into `buildProducedSet`.
- The IR (`packages/contracts/src/keyboard-ir.ts`) models `baselayout(...)` **only as a
  per-rule `ContextElement`** (`{ kind: "baselayout"; value: string }`), emitted by
  [parse.ts:400](../../packages/engine/src/codec/parse.ts). There is **no typed `&baselayout`
  system store** on the IR. The spec's phrase "&baselayout store" is loose; the real IR signal
  is the context element.
- **Upstream reality (verified in `../keyman`).** `baselayout('...')` is a **synonym for
  `if(&baselayout)`** — a context *test* (`Compiler.cpp:2157`), and `&baselayout` is a runtime
  **environment** system store (`TSS_BASELAYOUT`, `kmx_processevent.cpp:659`) whose value the
  **host OS supplies**, defaulting to `DEFAULT_BASELAYOUT = "kbdus.dll"` / `en-US`
  (`core/src/kmx/kmx_environment.cpp:16`). **A keyboard cannot declare which base layout its
  un-blocked keys fall through to** — the host decides; the keyboard can only *branch on* the
  active value. This corrects the spec's "read the base layout from the keyboard's own
  `&baselayout` store" assumption: there is no such settable store.
- The engine already has a US-QWERTY letter map (`US_UNSHIFTED` in
  [packages/engine/src/placement/filters.ts](../../packages/engine/src/placement/filters.ts)),
  but the facet-index tool is a standalone utility that imports only
  `@keyboard-studio/contracts` (plus the engine codec in *tests*) — it **cannot** import engine
  internals. A base-layout table must be tool-owned pinned data.
- `> nul` parses to a typed rule with **no producible output** (confirmed by
  [parse-produced-output.test.ts:87](../../packages/engine/src/codec/parse-produced-output.test.ts)):
  the rule's context still names the vkey, but the output contributes nothing.
- Classifiers register in `DEFAULT_CLASSIFIERS`
  ([utilities/facet-index/build-index.ts:109](../../utilities/facet-index/build-index.ts)) as
  `{ classify, fallback }` pairs. The `script` facet def
  ([content/keyboard-facets/script.yaml](../../content/keyboard-facets/script.yaml)) is at
  `schemaVersion: 1`, `classifierId: script-classifier`.

## Q1 — Where does the pinned base-layout character table come from?

**Decision.** Ship a tool-owned, checked-in JSON table under
`utilities/facet-index/data/base-layouts.json`, keyed by base-layout family name (the value a
`baselayout('...')` context carries, normalized case-insensitively). v1 ships exactly the **US
default (`kbdus`)** family: the unshifted physical-key → BMP character map for the alphabetic
keys (`K_A`…`K_Z`), sourced from Keyman's `kbdus` base layout. The table is pinned by content
hash and recorded in the index manifest's `referencePins` alongside the UCD pins.

**Rationale.** The default resolution target (unset `&baselayout`) *is* `kbdus`, and the spec's
fixture is "a non-Latin desktop keyboard with an un-blocked base-layout key" — the un-blocked
keys leak the US Latin letters. Shipping only `kbdus` in v1 covers the default path and the
fixture; additional families (AZERTY/QWERTZ) are additive rows behind the same schema when a
declared `baselayout('...')` names them. Determinism holds because resolution is a pure function
of `(the IR's baselayout context value, the pinned table)` — no OS/environment lookup.

**Alternatives considered.**
- *Import `US_UNSHIFTED` from engine placement filters* — rejected: the leak-source table must be
  a checked-in, sha256-pinnable reference-data file for deterministic freshness auditing, and a TS
  constant imported from the engine cannot serve as pinned reference data; that map is also an
  engine detail with its own lifecycle.
- *Derive from a CLDR/OS mapping at scan time* — rejected: violates the determinism requirement
  (no environment lookups) and adds an unpinned dependency.

## Q2 — How is "un-blocked" detected precisely?

**Decision.** A base-layout physical key `K_X` (a key present in the resolved base-layout table)
is classified against the parsed rules:
- **Handled/remapped** — some rule's `context` contains a base-layer `{ kind: "vkey"; name: "K_X" }`
  (base layer = no modifier other than `NCAPS`, mirroring `isBaseLayer` in filters.ts). Its output
  is already counted by `buildProducedSet`; it does **not** fall through.
- **Blocked** — the key is handled by a rule whose output produces no character (the `> nul`
  idiom, i.e. an empty/producible-less RHS). Counted as handled, contributes nothing.
- **Un-blocked (leaks)** — **no** base-layer rule context names `K_X` at all. The key falls
  through to the OS base layout → the classifier adds the table's character for `K_X` as leaked
  evidence.

So the rule is simple and defensible: *un-blocked = the keyboard's rules never name the base-layer
vkey*. "Blocked" and "remapped" are the same detection (the vkey appears in some base-layer
context); the difference is only whether that rule already contributed output, which
`buildProducedSet` handles. v1 scopes fall-through to the **unshifted/base layer only** — shifted
fall-through is deferred and noted, since the leaked Latin sliver is fully demonstrated by the
base layer.

**Rationale.** This reads the exact IR signal that exists (vkey context elements) without
extending the codec or IR (Constitution II — IR is the spine, no unnecessary schema churn). It
handles every suppression form uniformly: a `> nul`, a context-guarded remap, and a group-routing
rule all *name the vkey*, so none of them leak — matching the intent that only genuinely
un-touched keys fall through.

**Alternatives considered.**
- *Distinguish `nul` output specifically and treat guard/group-routed suppression differently* —
  rejected as over-engineering: any rule that names the vkey removes it from fall-through, so the
  output-side distinction is unnecessary for the leak decision.
- *Extend the IR/codec to surface a resolved "un-blocked key set"* — rejected: touches the locked
  IR spine for a tool-local classification need.

## Q3 — Does the leaked sliver participate in the confident/mixed threshold?

**Decision.** **Evidence-only for the dominant value; visible in the distribution.** Leaked
base-layout characters are added to the histogram and `evidenceSize` (so they surface as a minor
`distribution` entry and are auditable), but the **dominant value is selected from the
rule-produced (non-leaked) histogram only**. The `confidenceClass` threshold is computed on the
rule-produced dominant share, so a handful of leaked Latin letters can never flip a non-Latin
keyboard's dominant script or degrade its `confident` reading.

**Rationale.** The spec is explicit: the leak "appears as a small off-script sliver in the
`distribution` … not as a dominant-value flip." Making leaked evidence contribute to the
distribution but not to dominant selection is the minimal mechanism that satisfies both halves and
stays deterministic. Because un-blocked keys are typically few, the sliver is naturally small; the
evidence-only rule makes "never flips the dominant" a guarantee rather than a probabilistic hope.

**Alternatives considered.**
- *Count leaked chars as full evidence everywhere* — rejected: a mostly-passthrough non-Latin
  keyboard could then flip to `Latn` or drop from `confident` to `mixed`, violating the success
  criterion.
- *Record the sliver only in `notes`, not in `distribution`* — rejected: the success criterion
  requires it as a real minor `distribution` entry, not just prose.

## Q-extra — How is the declared-vs-default base layout recorded? (corrected)

**Decision.** The leak source is **always the environment default `kbdus`** — the deterministic,
host-independent baseline (upstream `DEFAULT_BASELAYOUT = kbdus.dll`). Since a keyboard cannot
*declare* its base layout (Q-context above), there is no per-keyboard override to read for the leak
characters. What the IR *can* tell us is whether the keyboard **branches on** the base layout: if
any rule carries a non-empty `{ kind: "baselayout"; value }` context guard, record that as an audit
hint in `Categorization.notes` — e.g. `base-layout: kbdus (default); branches-on: azerty` — versus
the plain `base-layout: kbdus (default)` when no guard is present. `provenanceTier` stays
`content-derived`.

This satisfies the spec's intent ("record the declared-vs-default distinction … so the inference is
auditable") with the honest available signal: *default always applies to the leak; the notes flag
when the author wrote base-layout-aware branches.* The spec's success criterion "provenance noting
declared-vs-default base layout" is met by the `notes` string; the underlying reality (no settable
declaration) is documented so the audit is not misleading.

**Rationale.** Determinism requires a fixed leak source, and the only deterministic value is the
environment default. Recording branch-awareness in `notes` preserves auditability without inventing
a declaration mechanism that upstream does not have.

**Alternatives considered.**
- *Treat a `baselayout('azerty')` guard as "the keyboard declares AZERTY" and leak AZERTY chars* —
  rejected: factually wrong (the guard is a conditional test, not a declaration) and
  non-deterministic w.r.t. the host, and it would need AZERTY/QWERTZ tables not in v1 scope.
- *Add a typed `&baselayout` field to the IR* — rejected: a locked-contract change (Constitution
  II + spec §18) for a signal that does not carry the meaning the spec assumed.

**Flag for the spec author.** The spec's Scope-in bullet 2 ("Read the base layout from the
keyboard's own `&baselayout` store; use the platform default only when `&baselayout` is unset")
rests on a store that does not exist. This plan implements the deterministic-default behavior and
records branch-awareness in `notes`; the spec text should be reconciled to match (a `refs`-level
follow-up, not a blocker for this plan).

## Determinism & freshness impact

Changing the produced-evidence derivation shifts committed records for affected desktop keyboards,
so it forces a **`script` classifier-version bump** (facet `schemaVersion 1 → 2` in `script.yaml`,
and the `scannerVersion`/`classifierId` freshness surface) and a **full recompute** of
`docs/keyboard-facet-index.json` + a re-lint (`facet-index-lint`). The new `base-layouts.json` is
added to the manifest `referencePins`. This mirrors any classifier change (036 freshness contract)
and is captured as an explicit task.
