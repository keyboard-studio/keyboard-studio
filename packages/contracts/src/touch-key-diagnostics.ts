/**
 * touch-key-diagnostics — the `TouchKeyFinding` / `TouchKeyFix` shape for the
 * edit-time touch-key diagnostics (spec 063 T113; FR-040, FR-041, FR-044;
 * [data-model.md](../../../specs/063-touch-key-editor/data-model.md) §10).
 *
 * ## Why this lives in contracts and not in engine
 *
 * FR-040's operative clause is that "edit-time diagnostics and their Layer C
 * siblings MUST share **one underlying implementation** … so the two cannot
 * drift apart". There is exactly one package both surfaces can import:
 * `@keyboard-studio/contracts`. Layer C (`@keymanapp/keyboard-lint`) may not
 * import engine at all (`.dependency-cruiser.cjs`'s `lint-not-to-engine`
 * rule), and contracts may not import any workspace package
 * (`contracts-is-the-dependency-root`). So the shape — and, from T114, the
 * detectors themselves — belong here, exactly as the touch key ↔ rule join
 * (`touch-key-rule-join.ts`) already does and for the same reason.
 *
 * `packages/engine/src/pattern-apply/touchKeyDiagnostics.ts` — the module
 * tasks.md names for T113 — re-exports every symbol below, so the studio's
 * sanctioned entry point into engine is unchanged and no existing import site
 * moves. That module also keeps the one detector that genuinely cannot live
 * here: `findMixedSuppressRemove` reads a `KeyEditOverlay`, an engine-owned
 * type.
 *
 * ## No English prose crosses this boundary (FR-044 / FR-051)
 *
 * Every {@link TouchKeyFinding.fields} value is structured data — a key id, a
 * layer id, an `sp` number, an address, a list of ids — never a composed
 * sentence. The studio composes and localizes copy from these fields, following
 * the existing method-label pattern (`existingMethodLabels.ts`). A reviewer who
 * finds a `message:` string anywhere in this file should treat that as a defect,
 * not a style nit.
 *
 * Layer C's own `LintFinding` **does** carry English prose, and that is not a
 * contradiction: a lint finding is a terminal, developer-facing report, while an
 * edit-time finding is rendered inside a localized UI. Layer C is therefore a
 * *formatter* over these detectors (T114), not a second detector.
 *
 * ## Which codes exist, and where each one came from
 *
 * FR-040 names ten upstream/net-new checks. Nine of them are **findings** and
 * appear in {@link TouchKeyFindingCode}; the tenth — `0x05A`
 * (`ERROR_TouchLayoutInvalidIdentifier`) — is deliberately NOT a finding at
 * all. Per FR-040 it is a *validity* concern, routed to edit-time **rejection**
 * (FR-045, T118) for author input and to Layer A′ import-fidelity
 * (`layer-a-prime.ts`, T043) for imported content. Nothing below emits it.
 *
 * | Code | Upstream | Detector's original home |
 * |---|---|---|
 * | `TOUCH_KEY_NO_RULE` | `WARN_TouchLayoutCustomKeyNotDefined` 0x092 | Layer C `KM_LINT_TOUCH_KEY_NO_RULE` (T034) |
 * | `TOUCH_KEY_MISSING_LAYER` | `WARN_TouchLayoutMissingLayer` 0x091 | Layer C `KM_WARN_TOUCH_MISSING_LAYER` (T036) |
 * | `TOUCH_KEY_UNIDENTIFIED` | `WARN_TouchLayoutUnidentifiedKey` 0x099 | **net-new at T114** |
 * | `TOUCH_KEY_MISSING_REQUIRED_KEYS` | `WARN_TouchLayoutMissingRequiredKeys` 0x093 | Layer C `KM_WARN_TOUCH_MISSING_REQUIRED_KEY` (T039) |
 * | `TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL` | `WARN_TouchLayoutSpecialLabelOnNormalKey` 0x0A9 | **net-new at T114** |
 * | `TOUCH_KEY_DUPLICATE_ID` | — (Developer lacks it) | Layer C `KM_WARN_TOUCH_DUPLICATE_KEY_ID` (T035) |
 * | `TOUCH_KEY_RULE_ORPHAN` | — (Developer lacks it) | Layer C `KM_LINT_TOUCH_RULE_ORPHAN` (T037) |
 * | `TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH` | — (FR-029d) | engine `touchKeyDiagnostics.ts` (T102) |
 * | `TOUCH_KEY_HALF_DONE_SUPPRESSION` | — (FR-029c) | engine `touchKeyDiagnostics.ts` (T101) |
 *
 * Three further codes ride along. They are **not** part of FR-040's nine, and
 * SC-007's count should not be read as including them:
 *
 * - `TOUCH_KEY_ID_CASE` — the latent case asymmetry the spec's Edge Cases list
 *   requires be reported ("Join case-insensitively; report the mismatch as a
 *   hint"). Already implemented as Layer C's `KM_HINT_TOUCH_KEY_ID_CASE`
 *   (T038), so surfacing it edit-time costs one delegation and no new logic.
 * - `TOUCH_KEY_MIXED_SUPPRESS_REMOVE` — FR-029h / US4 AS8, shipped in Phase 8
 *   (T103). Retained verbatim; its detector stays in engine because it reads
 *   the overlay rather than a layout.
 * - `TOUCH_KEY_ROW_CROWDED` — spec 065 FR-014, the edit-time face of Layer C's
 *   check 18.3. Unlike every code above it, its Layer C sibling was already
 *   shipped and calibrated; what spec 065 adds is the edit-time report and,
 *   more importantly, a single shared threshold table ([row-metrics.ts](./row-metrics.ts))
 *   so the two surfaces cannot disagree about what "too many" means.
 *
 * ## Severity: three values, only two of them reachable
 *
 * {@link TouchKeyFindingSeverity} keeps all three values data-model.md §10
 * names, but **no detector emits `"error"`**, and that is a deliberate,
 * load-bearing gap rather than an omission:
 *
 * - Keyman Developer's touch-layout validator has exactly one error (0x05A),
 *   and FR-040 routes it away from the finding path entirely (see above).
 * - `@keymanapp/keyboard-lint` ships zero error-severity checks; the join
 *   contract's §5 states "every code in the table stays warning-or-hint", and a
 *   first error-severity row is a layering change nobody has signed off on.
 *
 * The value stays in the union because the *studio's* rendering already handles
 * it (`KeyInspector.tsx`'s `severityStyle`, `KeyGridCell.tsx`'s `worstSeverity`)
 * and because narrowing it would make that branch dead code for no gain. If a
 * future increment does need an error, it needs the sign-off, not a type change.
 */

import type { KeyboardIR, TouchKeyIR, TouchLayoutIR } from "./keyboard-ir";
import {
  bindingsForKeyId,
  hasAnyBinding,
  isCustomTouchKeyId,
  isJoinableKeyId,
  normalizeTouchKeyId,
  type TouchKeyRuleIndex,
} from "./touch-key-rule-join";
import {
  collectReachableTouchKeyIds,
  collectTouchRuleOrphans,
} from "./ir/reachableProducedSet";
import {
  decodeUnicodeKeyId,
  isDeadkeyStyledKeyClass,
  isSpacerKeyClass,
} from "./touch-coverage";
import { createKeyOccurrenceCounter, touchKeyAddress } from "./touch-key-address";
import { computeRowMetrics } from "./row-metrics";

// ---------------------------------------------------------------------------
// Severity and codes
// ---------------------------------------------------------------------------

/**
 * A finding's severity. See the module doc's "Severity" section for why
 * `"error"` is in the union but unreachable from every detector today.
 */
export type TouchKeyFindingSeverity = "error" | "warning" | "hint";

/**
 * Every edit-time touch-key diagnostic code. See the module doc's table for
 * the upstream `kmcmplib` warning each one mirrors and where its detector
 * originally lived.
 *
 * Adding a code here is a real commitment: T115/T116 require at least one fix
 * descriptor and a localized copy entry for every member, and `findingCopy.ts`
 * is exhaustive over this union (a `never`-checked switch), so an addition that
 * skips the copy fails the build rather than rendering a raw code string.
 */
export type TouchKeyFindingCode =
  // --- The nine FR-040 findings ---------------------------------------------
  /** 0x092: a custom (`T_`) key with no rule of any role — pressing it does nothing. */
  | "TOUCH_KEY_NO_RULE"
  /** 0x091: a `nextlayer` naming a layer the platform does not declare. */
  | "TOUCH_KEY_MISSING_LAYER"
  /** 0x099: a key id the compiler cannot resolve — empty, or outside `K_`/`T_`/`U_`. */
  | "TOUCH_KEY_UNIDENTIFIED"
  /** 0x093: a layer missing one of upstream's `CRequiredKeys`. */
  | "TOUCH_KEY_MISSING_REQUIRED_KEYS"
  /** 0x0A9: a `*…*` frame label on a key that is not a frame key. */
  | "TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL"
  /** Two keys sharing an id within one layer — a rule keyed on it is ambiguous. */
  | "TOUCH_KEY_DUPLICATE_ID"
  /** A rule keyed on a touch key id nothing reachable carries. */
  | "TOUCH_KEY_RULE_ORPHAN"
  /** FR-029d: a layer-switch key whose `sp` disagrees with the active/inactive rule. */
  | "TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH"
  /** FR-029c: the compound suppress action applied to only one of its two halves. */
  | "TOUCH_KEY_HALF_DONE_SUPPRESSION"
  // --- Two riders, not part of FR-040's nine --------------------------------
  /** Edge Cases: layout and rule spell one id with different case. A hint — nothing is broken here. */
  | "TOUCH_KEY_ID_CASE"
  /** FR-029h / US4 AS8: one layer's committed edits mix `suppress` and `remove`. */
  | "TOUCH_KEY_MIXED_SUPPRESS_REMOVE"
  /**
   * Spec 065 FR-014: a row carrying more interactive keys than its platform's
   * maximum. A third rider, and the first code here whose Layer C sibling
   * (`KM_WARN_TOUCH_KEYS_PER_ROW`, check 18.3) predates it — the two now read
   * their thresholds from one table (`row-metrics.ts`).
   *
   * Non-blocking by construction: `warning` severity, and nothing in the edit
   * path consults it before committing. FR-014's operative clause is that
   * exceeding the maximum "MUST NOT be prevented" — the author is told, and the
   * edit succeeds.
   */
  | "TOUCH_KEY_ROW_CROWDED"
  /**
   * Spec 065 FR-036: a key's keycap is not recognisably related to what the key
   * types — most often a label left over from whatever the key produced before.
   *
   * `hint` severity and never blocking, because a keycap that "does not match"
   * is a judgement, not a defect: plenty of real keyboards label a key with
   * something deliberately unlike its output. The five gating conditions
   * (FR-036, contract §3.1) exist to keep this quiet, and an author who set the
   * keycap themselves (`keycapAuthored`) is never asked about it at all.
   */
  | "TOUCH_KEY_KEYCAP_MISMATCH";

/**
 * What a finding's {@link TouchKeyFinding.address} names. Absent means
 * `"key"` — the overwhelmingly common case, and the one every Phase 8 finding
 * already assumed.
 *
 * This exists because three of the eleven codes genuinely do not anchor to a
 * key that exists:
 *
 * - `"layer"` — `TOUCH_KEY_MISSING_REQUIRED_KEYS` is about a key that is
 *   *absent*. Its address is the address that key WOULD have (so the fix knows
 *   exactly where to add it), which is well-formed and parses correctly, but
 *   resolves against no cell in the grid.
 * - `"rule"` — `TOUCH_KEY_RULE_ORPHAN`'s subject is a `.kmn` rule, and for the
 *   `absent` reason there is no platform or layer to name at all.
 * - `"key"` — everything else.
 *
 * The studio uses this to decide *where* a finding renders: `"key"` findings
 * ride their cell, the other two surface in the grid's layer-level strip
 * (T117). Without the discriminator a layer-scoped finding would look like a
 * key finding whose cell had silently vanished.
 */
export type TouchKeyFindingScope = "key" | "layer" | "rule";

// ---------------------------------------------------------------------------
// Fix descriptors
// ---------------------------------------------------------------------------

/**
 * Add a `.kmn` rule for a key that has none — US5 AS1's first offer for a dead
 * `T_` key. A descriptor, not the rule: synthesizing the rule text is
 * `touchRuleSynthesis.ts`'s job (Phase 6), and which character the rule should
 * output is a question only the author can answer, so acting on this fix opens
 * the assign panel rather than committing a mutation.
 */
export interface AddRuleFix {
  readonly kind: "addRule";
  readonly address: string;
  readonly keyId: string;
}

/**
 * Rename a ruleless `T_*` key to a self-outputting `U_<HEX>` id — US5 AS1's
 * second offer. `toId` is present only when the current id already encodes a
 * codepoint recoverable without asking the author (e.g. `T_0301` → `U_0301`);
 * otherwise the studio must prompt, exactly as {@link AddRuleFix} does.
 */
export interface ConvertToUnicodeIdFix {
  readonly kind: "convertToUnicodeId";
  readonly address: string;
  readonly keyId: string;
  readonly toId?: string;
}

/**
 * Rename a key. `toId` present means the detector found one unambiguous target
 * (the rule's own spelling for a case mismatch; the orphaned rule's key id for
 * a near-miss); absent means the author must choose, and the fix is still
 * concrete in FR-041's sense — it names the key and the reason.
 */
export interface RenameKeyFix {
  readonly kind: "renameKey";
  readonly address: string;
  readonly toId?: string;
}

/**
 * Repoint a dangling `nextlayer` at a layer that exists — US5 AS2's first
 * offer. `candidates` is the platform's declared layer ids, so the studio can
 * offer a picker without re-walking the layout.
 */
export interface RepointNextlayerFix {
  readonly kind: "repointNextlayer";
  readonly address: string;
  readonly from: string;
  readonly candidates: readonly string[];
}

/** Remove the layer switch entirely — US5 AS2's second offer. */
export interface RemoveNextlayerFix {
  readonly kind: "removeNextlayer";
  readonly address: string;
}

/**
 * Add the required keys a layer is missing (0x093). Layer-scoped: `address`
 * is where the FIRST missing key would go; `keyIds` is all of them, because
 * upstream's own check accumulates per layer and adding one of three is not a
 * fix.
 */
export interface AddRequiredKeysFix {
  readonly kind: "addRequiredKeys";
  readonly address: string;
  readonly platform: string;
  readonly layerId: string;
  readonly keyIds: readonly string[];
}

/**
 * Clear a `*…*` special label from a key that is not a frame key (0x0A9), so
 * the keycap shows literal text again. The sibling fix —
 * {@link MarkAsFrameKeyFix} — takes the opposite reading of the same defect.
 */
export interface ClearSpecialLabelFix {
  readonly kind: "clearSpecialLabel";
  readonly address: string;
  readonly text: string;
}

/**
 * Accept the `*…*` label as intended and make the key an actual frame key
 * (`sp: 1`). Deliberately separate from {@link SetLayerSwitchSpFix}, whose
 * `sp: 1 | 2` encodes the layer-switch active/inactive alternation and would
 * lose that meaning if it doubled as a generic "set sp" fix.
 */
export interface MarkAsFrameKeyFix {
  readonly kind: "markAsFrameKey";
  readonly address: string;
}

/**
 * Complete a half-done suppression: sets BOTH `sp` and the id to the paired
 * sentinel in one op, exactly as `applySuppressSemantics` already enforces for
 * a fresh suppression. Shared by both `TOUCH_KEY_HALF_DONE_SUPPRESSION`
 * branches — "still live" already has the correct `sp` and needs the paired
 * sentinel id; "invisible dead key" already has the correct sentinel id and
 * needs the paired `sp`. Either way the completing op is identical in shape.
 */
export interface CompleteSuppressionFix {
  readonly kind: "completeSuppression";
  readonly address: string;
  readonly spClass: 9 | 10;
  readonly sentinelId: string;
}

/** Set a layer-switch key's `sp` to the active/inactive value the detector computed. */
export interface SetLayerSwitchSpFix {
  readonly kind: "setSp";
  readonly address: string;
  readonly sp: 1 | 2;
}

/**
 * "Look at this key." The fix of last resort, for defects where no single
 * mutation is the right answer — a mixed suppress/remove layer (FR-029f offers
 * three legitimate outcomes with real trade-offs, and no detector gets to pick
 * one on the author's behalf) or a duplicate id whose disambiguation depends on
 * intent this layer cannot see. FR-041 asks only that a fix be *concrete*, not
 * that it be a data mutation.
 */
export interface ReviewKeyFix {
  readonly kind: "reviewKey";
  readonly address: string;
}

/**
 * Bring a crowded row back under its platform maximum (spec 065 FR-014).
 *
 * A descriptor, not a mutation: WHICH `overBy` keys to drop is a question only
 * the author can answer — the same reasoning {@link ReviewKeyFix} rests on —
 * so acting on this opens the row for editing rather than deleting anything.
 * `rowIndex` is carried because this fix's subject is a row, and a
 * `touchKeyAddress` names only platform + layer + key.
 */
export interface TrimRowFix {
  readonly kind: "trimRow";
  readonly address: string;
  readonly rowIndex: number;
  readonly overBy: number;
}

/**
 * Relabel a key with the proposed keycap (spec 065 FR-036, FR-037).
 *
 * Unlike {@link TrimRowFix} and {@link ReviewKeyFix}, this one IS a concrete
 * mutation: `proposeKeycap` already computed the right label, so there is a
 * single unambiguous answer to apply. Applying it does not set
 * `keycapAuthored` — the author accepted a proposal rather than writing one.
 */
export interface SetKeycapFix {
  readonly kind: "setKeycap";
  readonly address: string;
  readonly proposed: string;
}

/**
 * One offered remedy. Every member carries `address` so the studio can act on a
 * fix without re-deriving where it applies.
 */
export type TouchKeyFix =
  | SetKeycapFix
  | AddRuleFix
  | ConvertToUnicodeIdFix
  | RenameKeyFix
  | RepointNextlayerFix
  | RemoveNextlayerFix
  | AddRequiredKeysFix
  | ClearSpecialLabelFix
  | MarkAsFrameKeyFix
  | CompleteSuppressionFix
  | SetLayerSwitchSpFix
  | TrimRowFix
  | ReviewKeyFix;

// ---------------------------------------------------------------------------
// The finding
// ---------------------------------------------------------------------------

/**
 * One diagnostic.
 *
 * `fields` is structured data ONLY (FR-044/FR-051) — see the module doc's
 * warning about English prose. `fixes` always has at least one entry (FR-041);
 * no detector returns an empty array from a push site, and `findingCopy.ts`
 * (T116) has a localized label for every {@link TouchKeyFix} kind.
 */
export interface TouchKeyFinding {
  readonly code: TouchKeyFindingCode;
  readonly severity: TouchKeyFindingSeverity;
  /**
   * `touchKeyAddress(platform, layerId, keyId)` form. For `scope: "layer"` it
   * is the address the missing key WOULD have; for `scope: "rule"` it is the
   * rule's own struck-key id, which by definition matches no key. See
   * {@link TouchKeyFindingScope}.
   */
  readonly address: string;
  /** Absent means `"key"`. See {@link TouchKeyFindingScope}. */
  readonly scope?: TouchKeyFindingScope;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly fixes: readonly TouchKeyFix[];
}

/**
 * `finding.scope ?? "key"` — stated once so no consumer has to remember the
 * default. The absent-means-`"key"` encoding (rather than a required field)
 * is what keeps every Phase 8 finding literal valid unchanged.
 */
export function touchKeyFindingScope(
  finding: TouchKeyFinding,
): TouchKeyFindingScope {
  return finding.scope ?? "key";
}

// ===========================================================================
// The detectors (spec 063 T114)
//
// One implementation per code, called by BOTH surfaces:
//
//   - edit-time — `useValidatorFindings.ts` via engine's `touchKeyDiagnostics`
//     re-export, rendered by the key grid and its inspector (T115-T117);
//   - Layer C   — `keyboard-lint`'s `check-18-*` modules, which are now thin
//     PROSE FORMATTERS over these functions. A Layer C check composes the
//     English `message`/`hint` from a finding's `fields`; it does not re-derive
//     which keys are defective.
//
// Every detector is a pure join over already-parsed inputs: no I/O, no timer,
// no throw (FR-042 / Decision D3). Behaviour — including the exemptions, the
// per-code dedup granularity, and the opaque-fragment severity downgrade — is
// carried over verbatim from the Phase 4 Layer C checks and the Phase 8 engine
// checks, because those are the implementations calibrated against the corpus
// (T041/T042) and a "tidier" rewrite here would silently re-calibrate them.
// ===========================================================================

/**
 * Ruleless sentinel ids the studio and the corpus both use for a deliberately
 * inert key. A sentinel is not a dead key — it is a key whose whole purpose is
 * to produce nothing (join contract §5.1).
 *
 * The canonical list. `keyboard-lint`'s `_shared.ts` re-exports it as
 * `TOUCH_SENTINEL_IDS` and engine's `keyIdMinting.ts` as
 * `RESERVED_SENTINEL_KEY_IDS`; before T114 those were two hand-maintained
 * copies, kept apart only because Layer C cannot import engine. Contracts can
 * be imported by both, so the copies are gone.
 */
export const TOUCH_SENTINEL_KEY_IDS = ["T_BLANK", "T_SPACER", "T_NUL"] as const;

/**
 * Id prefixes that are auto-minted or reserved for neutralization, and
 * therefore never expected to carry a rule.
 *
 * `T_NEW_` is Keyman Developer's own auto-mint. The other three are OUR reserved
 * neutralization prefixes, written by the carve cascade, the touch-deletion
 * overlay, and key removal — a key we deliberately emptied must not then be
 * reported as a defect we introduced.
 *
 * Upper-cased, and compared against an upper-cased id: this is the *exemption*
 * vocabulary. Engine's `keyIdMinting.ts` keeps a separate, deliberately
 * case-SENSITIVE `RESERVED_KEY_ID_PREFIXES` for the different job of *rejecting*
 * author input, where matching `t_new_foo` would be wrong.
 */
export const TOUCH_RULELESS_ID_PREFIXES = [
  "T_NEW_",
  "T_REMOVED_",
  "T_CARVED_",
  "T_TOUCHDEL_",
] as const;

/** True for a sentinel or auto-minted/reserved id (case-insensitive). */
export function isRulelessByConvention(keyId: string): boolean {
  const upper = keyId.toUpperCase();
  if ((TOUCH_SENTINEL_KEY_IDS as readonly string[]).includes(upper))
    return true;
  return TOUCH_RULELESS_ID_PREFIXES.some((p) => upper.startsWith(p));
}

/**
 * True for a `*`-prefixed frame-key label (`*Shift*`, `*abc*`, …).
 *
 * These are Keyman's own convention for a key whose caption is drawn from a
 * built-in string table rather than being literal output, so the label is never
 * a producer and the key is never expected to carry a rule. Deliberately looser
 * than {@link SPECIAL_LABEL_PATTERN} — an *exemption* should over-match rather
 * than risk reporting a frame key as dead.
 */
export function isFrameKeyLabel(text: string | undefined): boolean {
  return text !== undefined && text.startsWith("*");
}

/**
 * Keyman's special-label form, restated from `ActiveRow.SPECIAL_LABEL` in the
 * vendored KeymanWeb source (`engine/keyboard/keyboards/activeLayout.ts`), which
 * contracts cannot import (it is engine-local vendored code).
 *
 * Unanchored, exactly as upstream is: `*Shift*` and `*abc*` match, and so does a
 * label that merely *contains* one, which is what upstream's own renderer keys
 * on when it decides not to draw the text literally.
 */
export const SPECIAL_LABEL_PATTERN = /\*\w+\*/;

// ---------------------------------------------------------------------------
// Layout traversal
// ---------------------------------------------------------------------------

type TouchPlatform = TouchLayoutIR["platforms"][number];
type TouchLayer = TouchPlatform["layers"][number];
type TouchRow = TouchLayer["rows"][number];

/** Per-key context yielded by {@link walkTouchKeys}. */
export interface TouchKeyContext {
  platform: TouchPlatform;
  layer: TouchLayer;
  row: TouchRow;
  rowIndex: number;
  key: TouchKeyIR;
  keyIndex: number;
  /**
   * Which key with this id, counted row-major within the layer from 0
   * ({@link createKeyOccurrenceCounter}) — the fourth argument
   * {@link touchKeyAddress} wants.
   *
   * **Every detector below passes this.** Duplicate ids inside one layer are
   * routine, not rare (`T_BLANK` alone is spelled dozens of times in a single
   * corpus layer), and a bare address for a repeated id resolves to the FIRST
   * key with that id anywhere in the layer. Most fixes MUTATE the key at their
   * address — `setSp`, `renameKey`, `repointNextlayer`, `completeSuppression`,
   * `clearSpecialLabel`, `markAsFrameKey` — so an address off by an occurrence
   * does not merely mis-navigate: it edits a key the author never selected.
   *
   * In {@link walkTouchKeysDeep} this stays the occurrence of the MAIN key,
   * which is the key an address anchors to ({@link mainKeyOf}); a sub-entry is
   * addressed by its own `sk`/`multitap`/`flick` id, not by an occurrence.
   */
  occurrence: number;
}

/**
 * Walk every main key in a touch layout, in `platform → layer → row → key`
 * order, invoking `cb` once per key with its full positional context.
 *
 * Does not descend into a key's own `sk`/`multitap`/`flick` sub-keys — those
 * are a different traversal shape (recursive, not row/column positioned). Use
 * {@link walkTouchKeysDeep} when every id in the file must be seen.
 *
 * Counts occurrences as it goes, with one counter per (platform, layer) and in
 * the row-major order `resolveKeyAddress` walks — this walker is why no detector
 * has to keep its own tally, and why none of them can drift from that order.
 */
export function walkTouchKeys(
  layout: TouchLayoutIR,
  cb: (ctx: TouchKeyContext) => void,
): void {
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const nextOccurrence = createKeyOccurrenceCounter();
      layer.rows.forEach((row, rowIndex) => {
        row.keys.forEach((key, keyIndex) => {
          cb({
            platform,
            layer,
            row,
            rowIndex,
            key,
            keyIndex,
            occurrence: nextOccurrence(key.id),
          });
        });
      });
    }
  }
}

/**
 * Walk every key INCLUDING its `sk` / `multitap` / `flick` sub-keys.
 *
 * Separate from {@link walkTouchKeys} rather than an option on it, because the
 * positional context a sub-key sits in is genuinely different: a sub-key has no
 * row/column position of its own, so `rowIndex`/`keyIndex` describe its PARENT.
 *
 * `path` is the chain of ancestor keys, outermost first, empty for a main key.
 * {@link mainKeyOf} turns it back into the addressable main key.
 */
export function walkTouchKeysDeep(
  layout: TouchLayoutIR,
  cb: (ctx: TouchKeyContext & { path: readonly TouchKeyIR[] }) => void,
): void {
  walkTouchKeys(layout, (ctx) => {
    const visit = (key: TouchKeyIR, path: readonly TouchKeyIR[]): void => {
      cb({ ...ctx, key, path });
      const nextPath = [...path, key];
      for (const sub of key.sk ?? []) visit(sub, nextPath);
      for (const sub of key.multitap ?? []) visit(sub, nextPath);
      if (key.flick) {
        for (const sub of Object.values(key.flick)) {
          if (sub) visit(sub, nextPath);
        }
      }
    };
    visit(ctx.key, []);
  });
}

/**
 * The addressable MAIN key for a (possibly sub-)key yielded by
 * {@link walkTouchKeysDeep}: `path[0]` when the walk is inside a sub-entry,
 * otherwise the key itself.
 *
 * **Why every finding anchors to a main key.** A sub-key has no cell of its own
 * in the grid — `keyGridViewModel.ts` summarizes `sk`/`multitap`/`flick` as
 * annotation *counts* on the parent cell — so a finding addressed to a sub-key
 * would render nowhere. Anchoring to the parent puts it on the cell the author
 * can actually select and act on, and the offending sub-key id is preserved in
 * `fields.keyId` (with `fields.subKeyOf` naming the parent) so the composed copy
 * can still say which longpress entry is at fault.
 */
export function mainKeyOf(
  key: TouchKeyIR,
  path: readonly TouchKeyIR[],
): TouchKeyIR {
  return path.length > 0 ? (path[0] as TouchKeyIR) : key;
}

/**
 * `sp` classes for which a missing/neutralized rule is a real defect: absent,
 * `0` (character), or `8` (deadkey-STYLED, interactive).
 *
 * 0x092 parity, and the reason the corrected `sp` enum mattered: `sp:8` is
 * deadkey-styled and INTERACTIVE, so a dead `sp:8` key is exactly as broken as a
 * dead `sp:0` one. Under the old `{8,10}` spacer reading, `sp:8` keys were
 * treated as inert and skipped. Previously a private helper duplicated in
 * `check-18-6-touch-coverage.ts` and engine's `touchKeyDiagnostics.ts`; one
 * exported definition now, per FR-040.
 */
export function isProducingKeyClass(sp: number | undefined): boolean {
  return sp === undefined || sp === 0 || isDeadkeyStyledKeyClass(sp);
}

/** Exact-match against {@link TOUCH_SENTINEL_KEY_IDS}, never a case-fold — mirrors `checkReservedKeyId`'s and `applySuppressSemantics`'s own exact-match convention. */
function isReservedSentinelId(id: string): boolean {
  return (TOUCH_SENTINEL_KEY_IDS as readonly string[]).includes(id);
}

/** `9` (blank) pairs with `T_BLANK`; `10` (spacer) with `T_SPACER` — the same pairing `proposeSuppressFields` encodes. */
function sentinelIdForSpClass(spClass: 9 | 10): "T_BLANK" | "T_SPACER" {
  return spClass === 9 ? "T_BLANK" : "T_SPACER";
}

/**
 * The `spClass` a sentinel id pairs with, completing the other direction of the
 * same table. `T_NUL` has no dedicated `sp` pairing in the minting policy
 * (key-id-policy.md §2's "Gap or blank" row names only `T_SPACER`/`T_BLANK`), so
 * it resolves to the more conservative `9` (blank, a keycap-shaped hole) rather
 * than `10` (spacer, no keycap at all) — the safer of the two when the author's
 * original intent is unknown.
 */
function spClassForSentinelId(sentinelId: string): 9 | 10 {
  return sentinelId.toUpperCase() === "T_SPACER" ? 10 : 9;
}

/** Everything a joined detector needs: rules and layout together. */
export interface TouchKeyDiagnosticInputs {
  readonly ir: KeyboardIR;
  /** The EFFECTIVE (overlay-folded) touch layout. */
  readonly layout: TouchLayoutIR;
  readonly ruleIndex: TouchKeyRuleIndex;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_NO_RULE — 0x092: the dead custom touch key
// ---------------------------------------------------------------------------

/**
 * A `T_XXXX` key has no intrinsic output; it produces only via a `.kmn` rule
 * keyed on it. A key with NO rule at all is a key the author can press to no
 * effect — invisible in Developer until compile time.
 *
 * **The exemptions are the design.** Each one corresponds to a real, attested
 * idiom for a key that legitimately carries no rule; without them this detector
 * fires thousands of times on the corpus. They are applied in the same order,
 * with the same predicates, as `checkTouchKeyNoRule` shipped at T034 — each has
 * its own individual test (T041), deliberately, so one cannot silently rot.
 *
 * Severity downgrades to `"hint"` whenever `ir.raw.length > 0`: an opaque
 * fragment can hold a rule for any key and the join cannot prove otherwise. The
 * scope is the WHOLE IR, not the group — a fragment's group attribution is
 * precisely the information the codec failed to recover when it fell back to
 * `RawKmnFragment`.
 *
 * One finding per distinct (normalized) id, not per occurrence: a `T_` id
 * legitimately appears on several layers and platforms.
 */
export function findDeadTouchKeys(
  inputs: TouchKeyDiagnosticInputs,
): readonly TouchKeyFinding[] {
  const { ir, layout, ruleIndex } = inputs;
  const hasOpaque = ir.raw.length > 0;
  const severity: TouchKeyFindingSeverity = hasOpaque ? "hint" : "warning";

  const findings: TouchKeyFinding[] = [];
  const reported = new Set<string>();

  walkTouchKeysDeep(layout, ({ platform, layer, key, path, occurrence }) => {
    // Scope: custom ids only. A `K_` key resolves against the compiled-in
    // keyword table and has a physical position whether or not a rule mentions it.
    if (!isCustomTouchKeyId(key.id)) return;
    // A layer-switch key does its job via `nextlayer`, not a rule.
    if (key.nextlayer !== undefined && key.nextlayer.length > 0) return;
    // Only a producing key class can be dead.
    if (!isProducingKeyClass(key.sp)) return;
    if (isSpacerKeyClass(key.sp)) return;
    // A `*`-prefixed frame label draws its caption from Keyman's string table.
    if (isFrameKeyLabel(key.text)) return;
    // Sentinel ids and auto-minted/reserved prefixes.
    if (isRulelessByConvention(key.id)) return;
    // A `U_` id SELF-OUTPUTS (forUnicodeKeynames), so it needs no rule.
    if (normalizeTouchKeyId(key.id).startsWith("U_")) return;
    // THE ACTUAL TEST: zero bindings of ANY role. A key whose only bindings are
    // guard / suppresses / transitions / opaque is WIRED, not dead.
    if (bindingsForKeyId(ruleIndex, key.id).length > 0) return;

    const normalized = normalizeTouchKeyId(key.id);
    if (reported.has(normalized)) return;
    reported.add(normalized);

    const anchor = mainKeyOf(key, path);
    const address = touchKeyAddress(platform.id, layer.id, anchor.id, occurrence);
    findings.push({
      code: "TOUCH_KEY_NO_RULE",
      severity,
      address,
      fields: {
        keyId: key.id,
        platform: platform.id,
        layerId: layer.id,
        hasOpaque,
        ...(path.length > 0 ? { subKeyOf: anchor.id } : {}),
      },
      fixes: [
        { kind: "addRule", address, keyId: key.id },
        {
          kind: "convertToUnicodeId",
          address,
          keyId: key.id,
          ...(unicodeIdFor(key.id) !== undefined
            ? { toId: unicodeIdFor(key.id) as string }
            : {}),
        },
      ],
    });
  });

  return findings;
}

/**
 * `T_0301` → `U_0301`: the one id shape whose `U_` equivalent is recoverable
 * without asking the author, because the `T_` body is already the hex codepoint
 * the `U_` form would encode.
 *
 * Returns `undefined` for every other body (`T_CAM`, `T_alpha`), where inventing
 * a codepoint would be a guess — the fix descriptor then carries no `toId` and
 * the studio prompts instead. Verified through {@link decodeUnicodeKeyId} rather
 * than a bare hex regex, so "is this a valid `U_` id" is answered in exactly one
 * place.
 */
function unicodeIdFor(keyId: string): string | undefined {
  const upper = normalizeTouchKeyId(keyId);
  if (!upper.startsWith("T_")) return undefined;
  const candidate = `U_${upper.slice(2)}`;
  return decodeUnicodeKeyId(candidate) !== undefined ? candidate : undefined;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_RULE_ORPHAN — the inverse defect. Developer has no such check.
// ---------------------------------------------------------------------------

/**
 * A rule keyed on a touch key id that no reachable key carries. The author wrote
 * the rule, believes the character works, and nothing anywhere says otherwise.
 * `sil_cameroon_azerty` ships exactly this: a `T_03B1` guard+producing pair
 * whose layout carries only `U_03B1`.
 *
 * Fires only when a touch layout exists — that guard lives in
 * `collectTouchRuleOrphans`. One finding per orphaned id, not per binding: the
 * guard and the producing rule of a pair are ONE defect with ONE fix.
 *
 * `scope: "rule"`, because the subject is a rule and (for the `absent` reason)
 * there is no platform or layer to name. Where a near-miss layout key exists the
 * `renameKey` fix carries that key's REAL address, so the fix is actionable even
 * though the finding itself is not key-anchored.
 */
export function findTouchRuleOrphans(
  inputs: TouchKeyDiagnosticInputs,
): readonly TouchKeyFinding[] {
  const { ir, layout, ruleIndex } = inputs;
  const orphans = collectTouchRuleOrphans(ir, ruleIndex);
  if (orphans.length === 0) return [];

  const { allIds } = collectReachableTouchKeyIds(layout);
  const findings: TouchKeyFinding[] = [];
  const reported = new Set<string>();

  for (const { binding, reason } of orphans) {
    const normalized = normalizeTouchKeyId(binding.keyIdAsWritten);
    if (reported.has(normalized)) continue;
    reported.add(normalized);

    if (reason === "unreachable-layer") {
      findings.push({
        code: "TOUCH_KEY_RULE_ORPHAN",
        severity: "warning",
        address: binding.keyIdAsWritten,
        scope: "rule",
        fields: { keyIdAsWritten: binding.keyIdAsWritten, reason },
        fixes: [{ kind: "reviewKey", address: binding.keyIdAsWritten }],
      });
      continue;
    }

    // ABSENT — and this is where the finding earns its keep. Name the near-miss.
    // A `U_` id self-outputs BEFORE any rule can run against it, so the layout's
    // `U_03B1` types its character directly and the author's
    // `any(diablock) + [T_03B1] > context` guard never fires: the keyboard
    // "works" and its guard is silently bypassed.
    const nearMiss = findNearMissId(normalized, allIds);
    const nearMissAt =
      nearMiss !== undefined ? locateKeyById(layout, nearMiss) : undefined;
    findings.push({
      code: "TOUCH_KEY_RULE_ORPHAN",
      severity: "warning",
      address: binding.keyIdAsWritten,
      scope: "rule",
      fields: {
        keyIdAsWritten: binding.keyIdAsWritten,
        reason,
        ...(nearMiss !== undefined ? { nearMissId: nearMiss } : {}),
        ...(nearMiss !== undefined
          ? { nearMissSelfOutputs: nearMiss.startsWith("U_") }
          : {}),
      },
      fixes:
        nearMissAt !== undefined
          ? [
              {
                kind: "renameKey",
                address: nearMissAt,
                toId: binding.keyIdAsWritten,
              },
            ]
          : [{ kind: "reviewKey", address: binding.keyIdAsWritten }],
    });
  }

  return findings;
}

/**
 * The layout id that differs from `normalizedRuleId` only in its prefix — e.g.
 * `U_03B1` for a rule keyed on `T_03B1`.
 *
 * Prefix-swap only, deliberately: a looser edit-distance search would produce
 * confident-sounding but wrong suggestions, and the prefix swap is the one
 * near-miss shape with a real, explainable cause (`U_` self-outputs).
 */
function findNearMissId(
  normalizedRuleId: string,
  allIds: ReadonlySet<string>,
): string | undefined {
  const body = normalizedRuleId.slice(2);
  for (const prefix of ["U_", "T_", "K_"]) {
    if (normalizedRuleId.startsWith(prefix)) continue;
    const candidate = `${prefix}${body}`;
    if (allIds.has(candidate)) return candidate;
  }
  return undefined;
}

/** Address of the first main key whose normalized id matches, or `undefined`. Main keys only — a fix must address something the appliers can resolve. Occurrence 0 by construction, and deliberately: "the first" is the whole contract of this helper. */
function locateKeyById(
  layout: TouchLayoutIR,
  normalizedId: string,
): string | undefined {
  let found: string | undefined;
  walkTouchKeys(layout, ({ platform, layer, key }) => {
    if (found !== undefined) return;
    if (normalizeTouchKeyId(key.id) === normalizedId) {
      found = touchKeyAddress(platform.id, layer.id, key.id);
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_ID_CASE — the latent case asymmetry. A HINT, not a warning.
// ---------------------------------------------------------------------------

/**
 * `kmcmplib` interns key names case-insensitively, so a layout key
 * `T_CaseTest` and a rule keyed on `T_CASETEST` compile and work — on OUR
 * build. Keyman Developer's validator compares case-sensitively and warns. The
 * file is therefore correct here and reportable there, and an author who never
 * runs Developer would never learn why their keyboard warns in someone else's
 * toolchain.
 *
 * Hint severity, because nothing is broken. It is latent, not wrong.
 */
export function findTouchKeyIdCaseMismatches(inputs: {
  readonly layout: TouchLayoutIR;
  readonly ruleIndex: TouchKeyRuleIndex;
}): readonly TouchKeyFinding[] {
  const { layout, ruleIndex } = inputs;
  const findings: TouchKeyFinding[] = [];
  const reported = new Set<string>();

  walkTouchKeysDeep(layout, ({ platform, layer, key, path, occurrence }) => {
    if (key.id.length === 0) return;
    const normalized = normalizeTouchKeyId(key.id);
    if (reported.has(normalized)) return;

    const spellings = ruleIndex.spellings.get(normalized);
    if (spellings === undefined) return;

    // Comparing against EVERY spelling (rather than the first) means a file with
    // three inconsistent spellings still reports once, naming them all.
    const differing = spellings.filter((s) => s !== key.id);
    if (differing.length === 0) return;

    reported.add(normalized);
    const address = touchKeyAddress(
      platform.id,
      layer.id,
      mainKeyOf(key, path).id,
      occurrence,
    );
    findings.push({
      code: "TOUCH_KEY_ID_CASE",
      severity: "hint",
      address,
      fields: { keyId: key.id, ruleSpellings: differing },
      // Renaming the RULE to match the layout is the other direction and the one
      // the Layer C hint suggests in prose; only the layout side is a key edit
      // this overlay can express, so that is the fix offered here.
      fixes: [{ kind: "renameKey", address, toId: differing[0] as string }],
    });
  });

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_DUPLICATE_ID — two keys with the same id on one layer
// ---------------------------------------------------------------------------

/**
 * A duplicate id means the compiler's key lookup is ambiguous: whichever rule
 * matches fires for both keys, so one of them behaves as the other.
 *
 * Scope is per (platform, layer) deliberately: the same id appearing on
 * `default` and on `shift` is the normal case, not a defect. Reported on the
 * SECOND occurrence only, so N copies yield N-1 findings — and the address
 * names THAT key, occurrence and all, so the offered `renameKey` renames the
 * copy the finding is about rather than the original it collides with.
 *
 * **The third exemption is what makes this shippable.** A per-key `layer`
 * override disambiguates two same-id keys — they emit under different modifier
 * states and are genuinely two keys. Without it the check produces ~13,900
 * corpus findings; with it, ~1,170. It was also unimplementable before the §18
 * contract change added `TouchKeyIR.layer`, since the parser dropped the field.
 */
export function findDuplicateTouchKeyIds(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      // Keyed by id AND by the `layer` override, so two keys that differ only
      // in their override land in different buckets and never collide.
      const seen = new Map<string, number>();
      // A SEPARATE tally from `seen`, and necessarily so: `seen` is bucketed by
      // normalized id + `layer` override and skips every exempt key, whereas an
      // address's occurrence counts raw ids over every key in the layer. This
      // detector is the one whose finding is ALWAYS about a repeated id, so it
      // is also the one whose address was always off by at least one.
      const nextOccurrence = createKeyOccurrenceCounter();

      for (const row of layer.rows) {
        for (const key of row.keys) {
          const occurrence = nextOccurrence(key.id);
          if (key.id.length === 0) continue;
          // EXEMPTION 1: sentinel and auto-minted/reserved ids. Several
          // `T_BLANK` keys in one layer is the idiom, not a collision.
          if (isRulelessByConvention(key.id)) continue;
          // EXEMPTION 2: blank and spacer classes. A non-interactive key's id
          // is never looked up, so two of them cannot be ambiguous.
          if (isSpacerKeyClass(key.sp)) continue;
          // EXEMPTION 3: the per-key `layer` override — see the doc above.
          // NUL separator, the composite-key idiom this codebase already uses
          // (`assignmentMap.ts`, `carve-needed-set.ts`, and the Layer C check
          // this detector replaced): a `layer` override may contain a space, so
          // a space-separated bucket key could collide across buckets.
          //
          // Written as the `\u0000` ESCAPE, never a raw NUL byte. A raw NUL makes
          // git classify this whole file as binary, so every future diff of a
          // dependency-root module renders as `Bin` and cannot be reviewed — not
          // hypothetical: the two Layer C checks these detectors were extracted
          // from each carry a raw NUL in their COMMITTED version, and their
          // substantial refactor diffs are unreadable for exactly that reason.
          // An earlier revision of this comment claimed the escape "does not
          // survive this repo's formatter"; that was wrong — `pnpm format`
          // leaves it intact.
          const bucket = `${normalizeTouchKeyId(key.id)}\u0000${key.layer ?? ""}`;

          const count = (seen.get(bucket) ?? 0) + 1;
          seen.set(bucket, count);
          if (count !== 2) continue;

          const address = touchKeyAddress(platform.id, layer.id, key.id, occurrence);
          findings.push({
            code: "TOUCH_KEY_DUPLICATE_ID",
            severity: "warning",
            address,
            fields: {
              keyId: key.id,
              platform: platform.id,
              layerId: layer.id,
              ...(key.layer !== undefined ? { layerOverride: key.layer } : {}),
            },
            // A rename is the one mutation this overlay can express — `layer` is
            // deliberately absent from `EditableKeyFields` (keyEditOps.ts), so
            // "set a layer override instead" cannot be offered as a one-click
            // fix and is left to the review path.
            fixes: [
              { kind: "renameKey", address },
              { kind: "reviewKey", address },
            ],
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_MISSING_REQUIRED_KEYS — 0x093
// ---------------------------------------------------------------------------

/**
 * Upstream `CRequiredKeys` — required of every layer of every platform.
 *
 * Citation, because the set is easy to guess wrong: `CRequiredKeys` in
 * `keyman/developer/src/kmc-kmn/src/kmw-compiler/constants.ts`, checked by
 * `ValidateLayoutFile` against a single `FRequiredKeys` accumulator per layer.
 * **The set does not vary by platform or layer** — writing a per-platform
 * variation here would be inventing a rule upstream does not have.
 */
export const REQUIRED_TOUCH_KEY_IDS = ["K_LOPT", "K_BKSP", "K_ENTER"] as const;

/**
 * Check that every layer of every platform carries the three required keys.
 *
 * Descends into sub-keys, matching how upstream accumulates `FRequiredKeys` over
 * every key it visits: a required key provided as a longpress still satisfies
 * the requirement as far as the compiler is concerned.
 *
 * One finding per layer listing all its missing keys, not one per key: they
 * share a cause and a fix. `scope: "layer"` — the subject is a key that is
 * ABSENT, so `address` is the address that key WOULD have (well-formed, and
 * exactly what the fix needs), and it resolves against no cell in the grid.
 */
export function findMissingRequiredTouchKeys(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const present = new Set<string>();
      const visit = (key: TouchKeyIR): void => {
        if (key.id.length > 0) present.add(normalizeTouchKeyId(key.id));
        for (const sub of key.sk ?? []) visit(sub);
        for (const sub of key.multitap ?? []) visit(sub);
        if (key.flick) {
          for (const sub of Object.values(key.flick)) {
            if (sub) visit(sub);
          }
        }
      };
      for (const row of layer.rows) {
        for (const key of row.keys) visit(key);
      }

      const missing = REQUIRED_TOUCH_KEY_IDS.filter((id) => !present.has(id));
      if (missing.length === 0) continue;

      const address = touchKeyAddress(
        platform.id,
        layer.id,
        missing[0] as string,
      );
      findings.push({
        code: "TOUCH_KEY_MISSING_REQUIRED_KEYS",
        severity: "warning",
        address,
        scope: "layer",
        fields: {
          platform: platform.id,
          layerId: layer.id,
          missingKeyIds: missing,
          requiredKeyIds: REQUIRED_TOUCH_KEY_IDS,
        },
        fixes: [
          {
            kind: "addRequiredKeys",
            address,
            platform: platform.id,
            layerId: layer.id,
            keyIds: missing,
          },
        ],
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_MISSING_LAYER — 0x091: a dangling `nextlayer`
// ---------------------------------------------------------------------------

/**
 * A `nextlayer` pointing at a layer the platform does not declare. The key
 * renders and is pressable, and nothing happens — or worse, the runtime lands
 * somewhere unintended.
 *
 * Declared-layer resolution is per platform, not per file: a layer present on
 * tablet does not make a phone `nextlayer` valid. One finding per (layer,
 * missing target) — the same dangling target referenced by three keys in one
 * layer is one mistake — anchored on the FIRST key carrying it, in walk order.
 *
 * Stays a `"warning"` even though a dangling `nextlayer` makes our own
 * reachability BFS under-credit (the BFS only enqueues targets that exist, so
 * every key on the intended layer reads as unreachable and its rules read as
 * orphaned). Upstream warns, and hundreds of corpus keyboards contain
 * instances. Escalation belongs in edit-time rejection (T118), which refuses a
 * MUTATION rather than emitting a finding.
 */
export function findMissingTouchLayers(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  for (const platform of layout.platforms) {
    const declared = platform.layers.map((l) => l.id);
    const declaredSet = new Set(declared);
    const reported = new Set<string>();

    for (const layer of platform.layers) {
      const nextOccurrence = createKeyOccurrenceCounter();
      // Same traversal order as `collectNextlayerKeys`: each main key, then its
      // own sub-entries, before the next main key.
      const visit = (
        key: TouchKeyIR,
        anchor: TouchKeyIR,
        anchorOccurrence: number,
      ): void => {
        const target = key.nextlayer;
        if (
          target !== undefined &&
          target.length > 0 &&
          !declaredSet.has(target)
        ) {
          const bucket = `${layer.id}\u0000${target}`;
          if (!reported.has(bucket)) {
            reported.add(bucket);
            const address = touchKeyAddress(
              platform.id,
              layer.id,
              anchor.id,
              anchorOccurrence,
            );
            findings.push({
              code: "TOUCH_KEY_MISSING_LAYER",
              severity: "warning",
              address,
              fields: {
                platform: platform.id,
                layerId: layer.id,
                target,
                declaredLayerIds: declared,
              },
              fixes: [
                {
                  kind: "repointNextlayer",
                  address,
                  from: target,
                  candidates: declared,
                },
                { kind: "removeNextlayer", address },
              ],
            });
          }
        }
        for (const sub of key.sk ?? []) visit(sub, anchor, anchorOccurrence);
        for (const sub of key.multitap ?? []) visit(sub, anchor, anchorOccurrence);
        if (key.flick) {
          for (const sub of Object.values(key.flick)) {
            if (sub) visit(sub, anchor, anchorOccurrence);
          }
        }
      };
      for (const row of layer.rows) {
        for (const key of row.keys) visit(key, key, nextOccurrence(key.id));
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_UNIDENTIFIED — 0x099 (net-new at T114)
// ---------------------------------------------------------------------------

/**
 * A key id the compiler cannot resolve at all: empty, or outside the three
 * prefixes `kmcmplib` knows how to look up (`K_` virtual key, `T_` custom, `U_`
 * self-outputting).
 *
 * **Deliberately narrower than upstream's 0x099, and stated rather than
 * quietly capped.** Upstream additionally validates a `K_` id against its
 * compiled-in virtual-key name table, so it catches a typo like `K_ENTRE`. This
 * detector does not: contracts has no virtual-key name table (`keyBudget.ts`'s
 * `STOCK_BASE_LAYOUTS` is a per-layout key map, not the vkey vocabulary), and
 * baking a partial one here would produce false positives on every legitimate
 * key it happened to omit — strictly worse than the honest gap. What remains is
 * the prefix test, which is sound in both directions: an id outside `K_`/`T_`/
 * `U_` cannot be resolved by any code path, typo table or not.
 *
 * Non-interactive keys (`sp` 9/10) are exempt for the reason
 * {@link findDuplicateTouchKeyIds}'s own exemption 2 states: a blank or spacer
 * key's id is never looked up, and an empty id on a spacer is the corpus idiom,
 * not a defect.
 */
export function findUnidentifiedTouchKeys(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];
  const reported = new Set<string>();

  walkTouchKeysDeep(layout, ({ platform, layer, key, path, occurrence }) => {
    if (isSpacerKeyClass(key.sp)) return;
    if (key.id.length > 0 && isJoinableKeyId(key.id)) return;

    // Keyed per (platform, layer, id) rather than per id alone: unlike a dead
    // `T_` key — one id, one shared rule gap — an unresolvable id is a property
    // of the key occurrence, and an empty id gives nothing to dedup on anyway.
    const anchor = mainKeyOf(key, path);
    const bucket = `${platform.id}\u0000${layer.id}\u0000${anchor.id}\u0000${key.id}`;
    if (reported.has(bucket)) return;
    reported.add(bucket);

    const address = touchKeyAddress(platform.id, layer.id, anchor.id, occurrence);
    findings.push({
      code: "TOUCH_KEY_UNIDENTIFIED",
      severity: "warning",
      address,
      fields: {
        keyId: key.id,
        platform: platform.id,
        layerId: layer.id,
        empty: key.id.length === 0,
        ...(path.length > 0 ? { subKeyOf: anchor.id } : {}),
      },
      fixes: [{ kind: "renameKey", address }],
    });
  });

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL — 0x0A9 (net-new at T114)
// ---------------------------------------------------------------------------

/**
 * A `*…*` special label on a key that is not a frame key. Keyman draws such a
 * label from its own string table (or as an icon) rather than as literal text,
 * so on a `sp: 0` key the author sees neither their intended glyph nor the
 * frame-key rendering they were reaching for.
 *
 * Frame classes (`sp` 1 and 2) are the legitimate home for the label and are
 * exempt. Non-interactive classes (9/10) are exempt too — the key draws no
 * caption to be wrong about — consistent with every other detector here.
 */
export function findSpecialLabelOnNormalKeys(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  walkTouchKeysDeep(layout, ({ platform, layer, key, path, occurrence }) => {
    const text = key.text;
    if (text === undefined || !SPECIAL_LABEL_PATTERN.test(text)) return;
    if (key.sp === 1 || key.sp === 2) return;
    if (isSpacerKeyClass(key.sp)) return;

    const anchor = mainKeyOf(key, path);
    const address = touchKeyAddress(platform.id, layer.id, anchor.id, occurrence);
    findings.push({
      code: "TOUCH_KEY_SPECIAL_LABEL_ON_NORMAL",
      severity: "warning",
      address,
      fields: {
        keyId: key.id,
        platform: platform.id,
        layerId: layer.id,
        text,
        sp: key.sp,
        ...(path.length > 0 ? { subKeyOf: anchor.id } : {}),
      },
      fixes: [
        { kind: "clearSpecialLabel", address, text },
        { kind: "markAsFrameKey", address },
      ],
    });
  });

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_HALF_DONE_SUPPRESSION — FR-029c / FR-029e (moved from engine, T101)
// ---------------------------------------------------------------------------

/**
 * Detect a key whose compound suppress action (join contract §3, FR-029b) is
 * only half applied:
 *
 * - **still live**: `sp` is a non-interactive class (9/10) — the RENDERING half
 *   happened — but the id is NOT one of the reserved sentinels and still carries
 *   at least one `.kmn` binding of ANY role. The OUTPUT half never happened, so
 *   the id remains wired wherever it is reachable.
 * - **invisible dead key**: `sp` is a producing class (absent, `0`, or `8`
 *   deadkey-styled) — the key LOOKS interactive — but its id has already been
 *   neutralized to a reserved sentinel. Striking it does nothing, and nothing on
 *   the keycap says so.
 *
 * **The negative case is the point (FR-029e).** A WELL-FORMED suppression —
 * non-interactive `sp` paired with a reserved sentinel id — triggers NEITHER
 * branch: the first requires the id NOT be a sentinel, the second requires `sp`
 * be a producing class. This is the idiom the join contract's §5.1 dead-key
 * exemptions exist for (`T_BLANK`, 70 sites on the Cameroon QWERTY canary
 * alone), and it must read as silent, not as a finding.
 *
 * **Severity asymmetry, not a copy-paste of the dead-key downgrade.** The
 * "invisible dead key" branch rests on the SAME absence-of-rule assumption
 * {@link findDeadTouchKeys} downgrades under `opaqueFragmentCount > 0`, so it
 * downgrades identically. The "still live" branch rests on the OPPOSITE fact —
 * {@link hasAnyBinding} POSITIVELY found a binding — which opaque fragments
 * cannot invalidate; they could only hide a binding not yet reported, never
 * manufacture a false one. So "still live" stays at `warning` regardless.
 *
 * Main keys only: none of the three operations these branches reason about
 * (`suppress`, `remove`, the active-`sp` alternation) can target a sub-key —
 * see `keyEditOps.ts`'s `KeyEditOperation` doc.
 */
export function findHalfDoneSuppressions(
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  walkTouchKeys(layout, ({ platform, layer, key, occurrence }) => {
    const address = touchKeyAddress(platform.id, layer.id, key.id, occurrence);

    if (isSpacerKeyClass(key.sp)) {
      // Branch A: rendering says "hidden", but the id was never neutralized.
      if (isReservedSentinelId(key.id)) return;
      if (!hasAnyBinding(ruleIndex, key.id)) return;

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
      return;
    }

    // Branch B: the id was neutralized, but rendering never caught up.
    if (!isProducingKeyClass(key.sp)) return;
    if (!isReservedSentinelId(key.id)) return;

    const spClass = spClassForSentinelId(key.id);
    const severity: TouchKeyFindingSeverity =
      ruleIndex.opaqueFragmentCount > 0 ? "hint" : "warning";

    findings.push({
      code: "TOUCH_KEY_HALF_DONE_SUPPRESSION",
      severity,
      address,
      fields: { kind: "invisibleDead", keyId: key.id, sp: key.sp },
      fixes: [
        { kind: "completeSuppression", address, spClass, sentinelId: key.id },
      ],
    });
  });

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH — FR-029d (moved from engine, T102)
// ---------------------------------------------------------------------------

/**
 * Detect a layer-switching key (one carrying `nextlayer`) whose `sp` disagrees
 * with research.md R3b's computable rule: `sp:2` (active) on the layer it
 * switches TO, `sp:1` (frame/inactive) everywhere else.
 *
 * `layerFamilies.ts` is deliberately NOT involved — the comparison is a plain
 * string equality between `nextlayer` and the containing layer's own id, with no
 * combo decomposition needed, because `nextlayer` already names a real,
 * already-canonical layer id.
 *
 * A key already suppressed (`isSpacerKeyClass`) is exempt: hiding a
 * layer-switch key entirely (so it cannot be struck at all) is a distinct,
 * deliberate authoring choice this detector has nothing useful to say about —
 * conflating it with the active/inactive alternation would misreport an
 * intentional "hide this switch" as an "active/inactive got it backwards".
 */
export function findLayerSwitchActiveMismatches(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  walkTouchKeys(layout, ({ platform, layer, key, occurrence }) => {
    if (key.nextlayer === undefined || key.nextlayer.length === 0) return;
    if (isSpacerKeyClass(key.sp)) return;

    const expectedSp: 1 | 2 = key.nextlayer === layer.id ? 2 : 1;
    const effectiveSp = key.sp ?? 0;
    if (effectiveSp === expectedSp) return;

    // Occurrence-bearing: `K_SHIFT` twice in one layer is attested corpus
    // shape, and the `setSp` fix MUTATES the key at this address.
    const address = touchKeyAddress(platform.id, layer.id, key.id, occurrence);
    findings.push({
      code: "TOUCH_KEY_LAYER_SWITCH_ACTIVE_MISMATCH",
      severity: "warning",
      address,
      fields: {
        keyId: key.id,
        layerId: layer.id,
        nextlayer: key.nextlayer,
        currentSp: key.sp,
        expectedSp,
      },
      fixes: [{ kind: "setSp", address, sp: expectedSp }],
    });
  });

  return findings;
}

// ---------------------------------------------------------------------------
// TOUCH_KEY_ROW_CROWDED — spec 065 FR-014. Layer C sibling: check 18.3.
// ---------------------------------------------------------------------------

/**
 * A row carrying more interactive keys than its platform allows.
 *
 * **This detector owns no thresholds.** The maximum, the interactive-key
 * predicate and the geometry totals all come from
 * [row-metrics.ts](./row-metrics.ts), which is also what
 * `keyboard-lint`'s `check-18-3-keys-per-row.ts` and the studio's remove-key
 * proposal now read. That is the whole point of research D6: before spec 065 the
 * phone-10 / tablet-13 pair was written out in two places with a comment asking
 * a future reader to keep them in sync, and this would have been the third.
 *
 * `scope: "layer"` because a row is not a key: the finding is about a
 * *quantity* of keys, and no single cell is at fault. Its `address` anchors to
 * the row's first key so the studio can still resolve the finding to a place on
 * the grid, and `fields.rowIndex` is what the row-level readout actually keys
 * on. A row with no keys at all cannot be crowded, so the anchor always exists
 * wherever this fires.
 *
 * **The anchor address carries its occurrence** ({@link createKeyOccurrenceCounter}),
 * so the layer is walked row-major even for the rows this detector will not
 * report. A crowded row's first key is very often one whose id repeats in the
 * layer — `T_BLANK` and `T_SPACER` are spelled dozens of times inside a single
 * corpus layer — and a bare address for a repeated id resolves to the FIRST key
 * with that id anywhere in the layer. `TouchGallery`'s `trimRow` handler
 * navigates purely off this address, so without the occurrence, acting on the
 * fix could select an unrelated key in an uncrowded row.
 *
 * Severity is `warning` and nothing gates on it — FR-014 requires that going
 * over the maximum be *reported*, never *prevented*. An author deliberately
 * building a dense row on a large phone gets told once and is left alone.
 *
 * Unruled platforms (`desktop`) produce nothing, because
 * {@link computeRowMetrics} omits `overMaximumBy` for them — the emptiness is a
 * property of the shared table, not a second exemption stated here.
 */
export function findCrowdedTouchRows(
  layout: TouchLayoutIR,
): readonly TouchKeyFinding[] {
  const findings: TouchKeyFinding[] = [];

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const nextOccurrence = createKeyOccurrenceCounter();
      layer.rows.forEach((row, rowIndex) => {
        // Tally EVERY key in the layer, row-major, BEFORE deciding whether this
        // row fires: an occurrence counts from the layer's start, so skipping
        // the uncrowded rows would hand out addresses `resolveKeyAddress` walks
        // past.
        const occurrences = row.keys.map((key) => nextOccurrence(key.id));

        const metrics = computeRowMetrics(row.keys, platform.id);
        if (metrics.overMaximumBy === undefined) return;

        const anchor = row.keys[0];
        if (anchor === undefined) return;
        const address = touchKeyAddress(platform.id, layer.id, anchor.id, occurrences[0]);

        findings.push({
          code: "TOUCH_KEY_ROW_CROWDED",
          severity: "warning",
          address,
          scope: "layer",
          fields: {
            platform: platform.id,
            layerId: layer.id,
            rowIndex,
            interactiveKeyCount: metrics.interactiveKeyCount,
            platformMaxKeys: metrics.platformMaxKeys,
          },
          fixes: [
            {
              kind: "trimRow",
              address,
              rowIndex,
              overBy: metrics.overMaximumBy,
            },
          ],
        });
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The aggregator
// ---------------------------------------------------------------------------

/**
 * Every layout/rule-derived diagnostic, in a fixed code order so a consumer's
 * rendering is stable across cycles.
 *
 * Excludes `TOUCH_KEY_MIXED_SUPPRESS_REMOVE`, the one code that reads the
 * `KeyEditOverlay` rather than a layout — engine's `touchKeyDiagnostics.ts`
 * composes that in (`computeAllTouchKeyDiagnostics`), because the overlay type
 * is engine-owned.
 *
 * Pure and synchronous by construction (FR-042): the whole function is a join
 * over `inputs`, so a caller can wrap it in a `useMemo` inside the existing
 * 300 ms cycle without introducing a second timer.
 */
export function computeTouchKeyDiagnostics(
  inputs: TouchKeyDiagnosticInputs,
): readonly TouchKeyFinding[] {
  const { layout, ruleIndex } = inputs;
  return [
    ...findDeadTouchKeys(inputs),
    ...findMissingTouchLayers(layout),
    ...findUnidentifiedTouchKeys(layout),
    ...findMissingRequiredTouchKeys(layout),
    ...findSpecialLabelOnNormalKeys(layout),
    ...findDuplicateTouchKeyIds(layout),
    ...findTouchRuleOrphans(inputs),
    ...findLayerSwitchActiveMismatches(layout),
    ...findHalfDoneSuppressions(layout, ruleIndex),
    ...findTouchKeyIdCaseMismatches({ layout, ruleIndex }),
    ...findCrowdedTouchRows(layout),
  ];
}

/**
 * Group findings by `address` for the key grid's per-cell lookup
 * (`buildKeyGridViewModel`'s `findingsByAddress`).
 *
 * Every finding is included, including `scope: "layer"`/`"rule"` ones whose
 * address matches no cell — they simply never get looked up by a cell, and the
 * grid's layer-level strip reads them from the flat list instead. Filtering them
 * out here would just move the same decision to two call sites.
 */
export function groupTouchKeyFindingsByAddress(
  findings: readonly TouchKeyFinding[],
): ReadonlyMap<string, readonly TouchKeyFinding[]> {
  const byAddress = new Map<string, TouchKeyFinding[]>();
  for (const finding of findings) {
    const bucket = byAddress.get(finding.address);
    if (bucket === undefined) byAddress.set(finding.address, [finding]);
    else bucket.push(finding);
  }
  return byAddress;
}
