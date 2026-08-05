/**
 * touchKeyDiagnostics — three of the eventual eight edit-time touch-key
 * diagnostics (spec 058 Phase 8 / US4, T101-T103; FR-029c, FR-029d, FR-029e,
 * FR-029h; US4 AS8/AS9).
 *
 * ## The finding/fix shape — T113 formalizes it, does not replace it
 *
 * [keyGridViewModel.ts](../../../studio/src/editors/assignLoop/keyGrid/keyGridViewModel.ts)
 * already names this module and carries a LOCAL placeholder `TouchKeyFinding`
 * type shaped to match data-model.md §10: `code` / `severity` / `address` /
 * `fields` / `fixes`. This module establishes that shape for real. T113
 * ("consolidate this module and the Layer C siblings onto one shared
 * implementation") is expected to widen the `code` union to the full set of
 * eight and to move the placeholder import in `keyGridViewModel.ts` onto this
 * module's real export — NOT to change the four-field shape itself. The three
 * codes below (`TOUCH_KEY_HALF_DONE_SUPPRESSION`,
 * `TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH`, `TOUCH_KEY_MIXED_SUPPRESS_REMOVE`)
 * are three of the eight named in FR-040; the other five (the dead-`T_`-key,
 * missing-layer, unidentified-key, missing-required-keys, special-label-on-
 * normal-key, orphan-`T_`-rule, and key-id-case checks) are NOT invented here —
 * several already exist as Layer C findings in
 * `@keymanapp/keyboard-lint`'s `check-18-*` modules, and T113-T121 is where
 * that whole set gets reconciled onto one implementation both surfaces call.
 *
 * **No English prose crosses this boundary (FR-044/FR-051).** Every
 * `TouchKeyFinding.fields` value is structured data — a key id, a layer id, an
 * `sp` number, an address, a list of addresses — never a composed sentence.
 * The studio composes and localizes copy from these fields, following the
 * existing method-label pattern. A reviewer who finds a `message:` string
 * anywhere in this file should treat that as a defect, not a style nit.
 *
 * ## What each check reuses, and does NOT re-derive
 *
 * - {@link isSpacerKeyClass} / {@link isDeadkeyStyledKeyClass} (contracts,
 *   `touch-coverage.ts`) — the canonical non-interactive / deadkey-styled `sp`
 *   predicates. `isProducingKeyClass` below composes them the same way
 *   `check-18-6-touch-coverage.ts`'s own (private, unexported) helper of the
 *   same name does; the two will collapse into one under T113-T121, and this
 *   file deliberately does not fork the *set* those predicates encode.
 * - {@link hasAnyBinding} (contracts, `touch-key-rule-join.ts`) — "is this key
 *   id wired to any rule at all", the same predicate the dead-key check itself
 *   uses to distinguish "wired, not dead" from "genuinely dead".
 * - {@link RESERVED_SENTINEL_KEY_IDS} (`keyIdMinting.ts`) — the ONE canonical
 *   sentinel-id set (`T_BLANK`/`T_SPACER`/`T_NUL`). `keyboard-lint`'s
 *   `_shared.ts` keeps its own copy (`TOUCH_SENTINEL_IDS`) because Layer C
 *   cannot import engine (`lint-not-to-engine`); this module CAN import
 *   engine's own copy and does, rather than authoring a third list.
 * - `SuppressKeyOp` / `applySuppressSemantics` (`keyEditOps.ts`) — the compound
 *   suppress operation's own `(spClass, sentinelId)` pairing convention. The
 *   fix descriptors below deliberately mirror that pairing (`9` ↔ `T_BLANK`,
 *   `10` ↔ `T_SPACER`) rather than inventing a second one.
 *
 * ## T101 — half-done suppression (FR-029c, FR-029e)
 *
 * {@link findHalfDoneSuppressions} reports BOTH halves of the compound
 * suppress action (`sp` class, key id) being out of sync — see
 * {@link SuppressKeyOp}'s own doc for why a single action exists at all:
 *
 *   - **still live**: `sp` is a non-interactive class (9/10, blank/spacer) —
 *     the RENDERING half of suppression happened — but the id is NOT one of
 *     the reserved sentinels and still carries at least one `.kmn` binding of
 *     ANY role. The OUTPUT half never happened, so the id remains wired
 *     wherever it is reachable.
 *   - **invisible dead key**: `sp` is a producing class (absent, `0`, or `8`
 *     deadkey-styled) — the key LOOKS interactive — but its id has already
 *     been neutralized to a reserved sentinel. Striking it does nothing, and
 *     nothing on the keycap says so.
 *
 * **The negative case is the point (FR-029e).** A WELL-FORMED suppression —
 * non-interactive `sp` paired with a reserved sentinel id — triggers NEITHER
 * branch: the first requires the id NOT be a sentinel, the second requires
 * `sp` be a producing class. This is the idiom the contract's §5.1 dead-key
 * exemptions exist for (`T_BLANK`, 70 sites on the Cameroon QWERTY canary
 * alone), and it must read as silent, not as a finding.
 *
 * **Severity asymmetry, not a copy-paste of the dead-key downgrade.** The
 * "invisible dead key" branch rests on the SAME absence-of-rule assumption the
 * dead-key check itself downgrades to a hint under `opaqueFragmentCount > 0`
 * (an opaque `.kmn` fragment could hide a rule for this sentinel id, however
 * unlikely), so it downgrades identically. The "still live" branch rests on
 * the OPPOSITE fact — {@link hasAnyBinding} POSITIVELY found a binding — which
 * opaque fragments cannot invalidate; they could only hide a binding this
 * module has not yet been asked to report, never manufacture a false one. So
 * "still live" stays at `warning` regardless of `opaqueFragmentCount`.
 *
 * ## T102 — layer-switch active mismatch (FR-029d, US4 AS9)
 *
 * {@link findLayerSwitchActiveMismatches} implements research.md R3b's
 * computable rule directly: for a key carrying `nextlayer`, the expected `sp`
 * is `2` (active) when `nextlayer` names the key's OWN containing layer, and
 * `1` (frame/inactive) otherwise. `layerFamilies.ts` is deliberately NOT
 * involved — the comparison is a plain string equality between `nextlayer`
 * and the containing layer's own id, with no combo decomposition needed,
 * because `nextlayer` already names a real, already-canonical layer id.
 *
 * A key already suppressed (`isSpacerKeyClass`) is exempt: hiding a
 * layer-switch key entirely (so it cannot be struck at all) is a distinct,
 * deliberate authoring choice this check has nothing useful to say about —
 * conflating it with the active/inactive alternation would misreport an
 * intentional "hide this switch" as an "active/inactive got it backwards".
 *
 * ## T103 — mixed suppress/remove within a layer (FR-029h, US4 AS8)
 *
 * {@link findMixedSuppressRemove} is the one check in this file that reads the
 * {@link KeyEditOverlay} rather than a layout: `remove` deletes a key outright,
 * so a removed key leaves NO trace on the resulting layout for a
 * layout-only pass to notice — the only place "this key was removed" is
 * recorded at all is the committed operation log.
 *
 * **Granularity is the LAYER an operation's address names, not the row a
 * removed key used to occupy — a stated limitation, not an oversight.** A
 * `KeyEditOperation.address` (`touchKeyAddress` form) carries platform + layer
 * + key id; it carries no row index, and recovering "which row did this
 * REMOVED key sit in" would require replaying the overlay up to that
 * operation against the pre-edit layout (`replayKeyEditOverlay`'s own job, one
 * layer up the stack from this module, which stays free of layout replay).
 * FR-029h's own normative text asks for consistency "within a layer"; AS8's
 * "a row" is the illustrative worked case, which this layer-granularity check
 * still catches exactly whenever the layer in question has one row (the
 * common case for the symbol/alt-plane layers this idiom shows up on).
 * Widening to true row-level precision is exactly the kind of consolidation
 * T113-T121 is positioned to take on, once it already has the shared
 * replay-backed resolution these other checks would also benefit from.
 *
 * Only `suppress` and `remove` operations are counted; every other operation
 * kind (`set`, `rename`, `add`, `setSubKey`, `removeSubKey`) is silently
 * skipped — neither of the two outcomes FR-029h is about.
 */

import {
  hasAnyBinding,
  isDeadkeyStyledKeyClass,
  isSpacerKeyClass,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";

import { RESERVED_SENTINEL_KEY_IDS } from "./keyIdMinting.js";
import { touchKeyAddress, parseTouchKeyAddress } from "./touchKeyAddress.js";
import type { KeyEditOperation, KeyEditOverlay } from "./keyEditOps.js";

// ---------------------------------------------------------------------------
// The finding/fix shape (T113 formalizes; see module doc)
// ---------------------------------------------------------------------------

/**
 * Every code stays warning-or-hint, matching the severity policy the Layer C
 * `check-18-*` siblings already hold to (contract touch-key-rule-join.md §5:
 * "every code in the table stays warning-or-hint" — `@keymanapp/keyboard-lint`
 * ships zero error-severity checks). These are edit-time findings, not Layer C
 * ones, but there is no reason for this module to be the first to introduce
 * `"error"` into a diagnostic surface that has never carried one.
 */
export type TouchKeyFindingSeverity = "warning" | "hint";

/**
 * The three codes this module contributes. T113 owns widening this union to
 * the full eight named in FR-040 — do not add a fourth code here speculatively.
 */
export type TouchKeyFindingCode =
  | "TOUCH_KEY_HALF_DONE_SUPPRESSION"
  | "TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH"
  | "TOUCH_KEY_MIXED_SUPPRESS_REMOVE";

/**
 * Complete a half-done {@link SuppressKeyOp}: sets BOTH `sp` and the id to the
 * paired sentinel in one op, exactly as `applySuppressSemantics` already
 * enforces for a fresh suppression. Shared by both T101 branches — "still
 * live" already has the correct `sp` and needs the paired sentinel id;
 * "invisible dead key" already has the correct sentinel id and needs the
 * paired `sp`. Either way the completing op is identical in shape.
 */
export interface CompleteSuppressionFix {
  readonly kind: "completeSuppression";
  readonly address: string;
  readonly spClass: 9 | 10;
  readonly sentinelId: string;
}

/** Set a key's `sp` to the value {@link findLayerSwitchActiveMismatches} computed. */
export interface SetLayerSwitchSpFix {
  readonly kind: "setSp";
  readonly address: string;
  readonly sp: 1 | 2;
}

/**
 * No single mutation resolves a mixed-approach row (FR-029f offers THREE
 * legitimate outcomes with real trade-offs, and this module does not get to
 * pick one on the author's behalf) — the fix is "look at this key", which is
 * a real, concrete action (FR-041 asks only that a fix be concrete, not that
 * it be a data mutation).
 */
export interface ReviewKeyFix {
  readonly kind: "reviewKey";
  readonly address: string;
}

export type TouchKeyFix = CompleteSuppressionFix | SetLayerSwitchSpFix | ReviewKeyFix;

/**
 * One diagnostic. `fields` is structured data ONLY (FR-044/FR-051) — see the
 * module doc's warning about English prose. `fixes` always has at least one
 * entry (FR-041); this module never returns an empty array from a push site.
 */
export interface TouchKeyFinding {
  readonly code: TouchKeyFindingCode;
  readonly severity: TouchKeyFindingSeverity;
  /** The key (or, for T103, one representative key) this finding anchors to, in `touchKeyAddress` form. */
  readonly address: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly fixes: readonly TouchKeyFix[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface MainKeyContext {
  readonly platformId: string;
  readonly layerId: string;
  readonly key: TouchKeyIR;
}

/**
 * Walk every MAIN key (never `sk`/`multitap`/`flick`) of a touch layout, in
 * `platform -> layer -> row -> key` order. Deliberately shallow: every check
 * in this file is about a main key's own `sp`/`id`/`nextlayer` — none of the
 * three operations these checks reason about (`suppress`, `remove`, the
 * active-`sp` alternation) can target a sub-key (see `keyEditOps.ts`'s own
 * `KeyEditOperation` doc: `suppress`/`remove` address a main key only).
 */
function* walkMainTouchKeys(layout: TouchLayoutIR): Iterable<MainKeyContext> {
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          yield { platformId: platform.id, layerId: layer.id, key };
        }
      }
    }
  }
}

/**
 * Exact-match against the canonical sentinel set (`keyIdMinting.ts`), never a
 * case-fold — mirrors `checkReservedKeyId`'s and `applySuppressSemantics`'s
 * own exact-match convention rather than inventing a looser one here.
 */
function isReservedSentinelId(id: string): boolean {
  return (RESERVED_SENTINEL_KEY_IDS as readonly string[]).includes(id);
}

/**
 * `sp` classes for which a missing/neutralized rule is a real defect: absent,
 * `0` (character), or `8` (deadkey-STYLED, interactive). Mirrors
 * `check-18-6-touch-coverage.ts`'s private helper of the same name and same
 * semantics (0x092 parity) — see the module doc's "what each check reuses"
 * section for why this is a deliberate, temporary duplication rather than a
 * fork of the underlying predicate set.
 */
function isProducingKeyClass(sp: number | undefined): boolean {
  return sp === undefined || sp === 0 || isDeadkeyStyledKeyClass(sp);
}

/** `9` (blank) pairs with `T_BLANK`; `10` (spacer) pairs with `T_SPACER` — the same pairing `proposeSuppressFields` encodes. */
function sentinelIdForSpClass(spClass: 9 | 10): "T_BLANK" | "T_SPACER" {
  return spClass === 9 ? "T_BLANK" : "T_SPACER";
}

/**
 * The `spClass` a sentinel id pairs with, completing the other direction of
 * the same table. `T_NUL` has no dedicated `sp` pairing in the minting policy
 * (key-id-policy.md §2's "Gap or blank" row only names `T_SPACER`/`T_BLANK`),
 * so it resolves to the more conservative `9` (blank, a keycap-shaped hole)
 * rather than `10` (spacer, no keycap at all) — the safer of the two when the
 * author's original intent is unknown.
 */
function spClassForSentinelId(sentinelId: string): 9 | 10 {
  return sentinelId.toUpperCase() === "T_SPACER" ? 10 : 9;
}

// ---------------------------------------------------------------------------
// T101 — half-done suppression (FR-029c, FR-029e)
// ---------------------------------------------------------------------------

/**
 * Detect a key whose compound suppress action (contract §3, FR-029b) is only
 * half applied — see the module doc's "T101" section for the two branches and
 * why a well-formed suppression triggers neither.
 *
 * @param layout - The effective (overlay-folded) touch layout.
 * @param ruleIndex - The touch key <-> rule join for the same keyboard.
 */
export function findHalfDoneSuppressions(
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  for (const { platformId, layerId, key } of walkMainTouchKeys(layout)) {
    const address = touchKeyAddress(platformId, layerId, key.id);

    if (isSpacerKeyClass(key.sp)) {
      // Branch A: rendering says "hidden", but the id was never neutralized.
      if (isReservedSentinelId(key.id)) continue;
      if (!hasAnyBinding(ruleIndex, key.id)) continue;

      const spClass: 9 | 10 = key.sp === 9 ? 9 : 10;
      findings.push({
        code: "TOUCH_KEY_HALF_DONE_SUPPRESSION",
        severity: "warning",
        address,
        fields: { kind: "stillLive", keyId: key.id, sp: key.sp },
        fixes: [
          {
            kind: "completeSuppression",
            address,
            spClass,
            sentinelId: sentinelIdForSpClass(spClass),
          },
        ],
      });
      continue;
    }

    // Branch B: the id was neutralized, but rendering never caught up.
    if (!isProducingKeyClass(key.sp)) continue;
    if (!isReservedSentinelId(key.id)) continue;

    const spClass = spClassForSentinelId(key.id);
    // Downgrade per the module doc's severity-asymmetry note: this branch
    // rests on "no rule exists for this sentinel id", which an opaque
    // fragment could in principle hide.
    const severity: TouchKeyFindingSeverity = ruleIndex.opaqueFragmentCount > 0 ? "hint" : "warning";

    findings.push({
      code: "TOUCH_KEY_HALF_DONE_SUPPRESSION",
      severity,
      address,
      fields: { kind: "invisibleDead", keyId: key.id, sp: key.sp },
      fixes: [
        {
          kind: "completeSuppression",
          address,
          spClass,
          sentinelId: key.id,
        },
      ],
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// T102 — layer-switch active mismatch (FR-029d, US4 AS9)
// ---------------------------------------------------------------------------

/**
 * Detect a layer-switching key (one carrying `nextlayer`) whose `sp` disagrees
 * with research.md R3b's computable rule: `sp:2` (active) on the layer it
 * switches TO, `sp:1` (frame/inactive) everywhere else. See the module doc's
 * "T102" section for the suppressed-key exemption.
 *
 * @param layout - The effective (overlay-folded) touch layout.
 */
export function findLayerSwitchActiveMismatches(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  for (const { platformId, layerId, key } of walkMainTouchKeys(layout)) {
    if (key.nextlayer === undefined || key.nextlayer.length === 0) continue;
    // A suppressed layer-switch key is a deliberate, different choice — see
    // the module doc; this check has nothing to say about it.
    if (isSpacerKeyClass(key.sp)) continue;

    const expectedSp: 1 | 2 = key.nextlayer === layerId ? 2 : 1;
    const effectiveSp = key.sp ?? 0;
    if (effectiveSp === expectedSp) continue;

    const address = touchKeyAddress(platformId, layerId, key.id);
    findings.push({
      code: "TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH",
      severity: "warning",
      address,
      fields: {
        keyId: key.id,
        layerId,
        nextlayer: key.nextlayer,
        currentSp: key.sp,
        expectedSp,
      },
      fixes: [{ kind: "setSp", address, sp: expectedSp }],
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// T103 — mixed suppress/remove within a layer (FR-029h, US4 AS8)
// ---------------------------------------------------------------------------

interface MixedApproachBucket {
  readonly platform: string;
  readonly layerId: string;
  readonly suppressAddresses: string[];
  readonly removeAddresses: string[];
}

/**
 * Detect a layer whose committed edits mix `suppress` and `remove` outcomes —
 * see the module doc's "T103" section for why this reads the overlay rather
 * than the layout, and why the granularity is the layer an operation's
 * address names rather than the row a removed key used to occupy.
 *
 * @param overlay - The committed key-edit operation log (contract §2).
 */
export function findMixedSuppressRemove(
  overlay: KeyEditOverlay,
): readonly TouchKeyFinding[] {
  const buckets = new Map<string, MixedApproachBucket>();

  for (const op of overlay.ops) {
    if (op.kind !== "suppress" && op.kind !== "remove") continue;
    bucketOp(op, buckets);
  }

  const findings: TouchKeyFinding[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.suppressAddresses.length === 0 || bucket.removeAddresses.length === 0) continue;

    // Anchor on the first suppressed key — an arbitrary but stable choice
    // (commit order); a row has no `touchKeyAddress` of its own to anchor to.
    const address = bucket.suppressAddresses[0]!;
    findings.push({
      code: "TOUCH_KEY_MIXED_SUPPRESS_REMOVE",
      severity: "hint",
      address,
      fields: {
        platform: bucket.platform,
        layerId: bucket.layerId,
        suppressedAddresses: bucket.suppressAddresses,
        removedAddresses: bucket.removeAddresses,
      },
      fixes: [{ kind: "reviewKey", address }],
    });
  }

  return findings;
}

/** Parse `op.address` and file it into its `platform:layerId` bucket, creating the bucket on first sight. Unresolvable addresses are silently skipped — never-throw, matching `parseTouchKeyAddress`'s own convention. */
function bucketOp(
  op: KeyEditOperation & { readonly kind: "suppress" | "remove" },
  buckets: Map<string, MixedApproachBucket>,
): void {
  const parts = parseTouchKeyAddress(op.address);
  if (parts === undefined) return;

  const bucketKey = `${parts.platform}:${parts.layerId}`;
  let bucket = buckets.get(bucketKey);
  if (bucket === undefined) {
    bucket = { platform: parts.platform, layerId: parts.layerId, suppressAddresses: [], removeAddresses: [] };
    buckets.set(bucketKey, bucket);
  }
  if (op.kind === "suppress") bucket.suppressAddresses.push(op.address);
  else bucket.removeAddresses.push(op.address);
}
