/**
 * touchKeyDiagnostics — the engine-side face of the edit-time touch-key
 * diagnostics (spec 063 Phase 8 / US4, T101-T103; Phase 9 / US5, T113-T114;
 * FR-029c, FR-029d, FR-029e, FR-029h, FR-040, FR-041, FR-044).
 *
 * ## The shape and the detectors moved to contracts at T113/T114
 *
 * Every type this module used to declare — `TouchKeyFinding`, `TouchKeyFix`,
 * `TouchKeyFindingCode`, `TouchKeyFindingSeverity`, and the individual fix
 * descriptors — and every detector except {@link findMixedSuppressRemove} now
 * live in
 * [touch-key-diagnostics.ts](../../../contracts/src/touch-key-diagnostics.ts),
 * and are re-exported below. Every existing import site (engine's
 * `pattern-apply/index.ts`, the studio's `keyGridViewModel.ts`, this module's
 * own test file) is therefore unchanged.
 *
 * The move was forced, not stylistic. FR-040 requires that edit-time
 * diagnostics and their Layer C siblings share **one underlying
 * implementation** "so the two cannot drift apart", and Layer C
 * (`@keymanapp/keyboard-lint`) may not import engine at all
 * (`.dependency-cruiser.cjs`'s `lint-not-to-engine` rule). Contracts is the
 * only package both surfaces can reach — the same forced placement the touch
 * key <-> rule join already has, for the same reason. The Layer C `check-18-*`
 * modules are now thin PROSE FORMATTERS over those detectors; that contracts
 * module's doc carries the full code table, the severity policy, and why
 * `"error"` is in the union but unreachable.
 *
 * ## What stays here, and why
 *
 * {@link findMixedSuppressRemove} reads a {@link KeyEditOverlay} — an
 * engine-owned type — so it cannot move to contracts, and does not need to: it
 * is the one code in the combined FR-029h/FR-040 set with no Layer C sibling to
 * drift from. {@link computeAllTouchKeyDiagnostics} composes it with the
 * contracts aggregator, so a caller with an overlay in hand gets one list.
 *
 * **No English prose crosses this boundary (FR-044/FR-051).** Every
 * `TouchKeyFinding.fields` value is structured data — a key id, a layer id, an
 * `sp` number, an address, a list of addresses — never a composed sentence. The
 * studio composes and localizes copy from these fields, following the existing
 * method-label pattern. A reviewer who finds a `message:` string anywhere in
 * this file should treat that as a defect, not a style nit.
 *
 * ## T103 — mixed suppress/remove within a layer (FR-029h, US4 AS8)
 *
 * {@link findMixedSuppressRemove} reads the {@link KeyEditOverlay} rather than a
 * layout because `remove` deletes a key outright: a removed key leaves NO trace
 * on the resulting layout for a layout-only pass to notice, so the only place
 * "this key was removed" is recorded at all is the committed operation log.
 *
 * **Granularity is the LAYER an operation's address names, not the row a
 * removed key used to occupy — a stated limitation, not an oversight.** A
 * `KeyEditOperation.address` (`touchKeyAddress` form) carries platform + layer +
 * key id; it carries no row index, and recovering "which row did this REMOVED
 * key sit in" would require replaying the overlay up to that operation against
 * the pre-edit layout (`replayKeyEditOverlay`'s own job, one layer up the stack
 * from this module, which stays free of layout replay). FR-029h's own normative
 * text asks for consistency "within a layer"; AS8's "a row" is the illustrative
 * worked case, which this layer-granularity check still catches exactly whenever
 * the layer in question has one row (the common case for the symbol/alt-plane
 * layers this idiom shows up on).
 *
 * Only `suppress` and `remove` operations are counted; every other operation
 * kind (`set`, `rename`, `add`, `setSubKey`, `removeSubKey`) is silently
 * skipped — neither of the two outcomes FR-029h is about.
 */

import {
  computeTouchKeyDiagnostics,
  createKeyOccurrenceCounter,
  parseTouchKeyAddress,
  producedByKeyId,
  touchKeyAddress,
  type TouchKeyDiagnosticInputs,
  type TouchKeyFinding,
} from "@keyboard-studio/contracts";
import { isKeycapRelated, proposeKeycap } from "./keycapRelatedness.js";

import type { KeyEditOperation, KeyEditOverlay } from "./keyEditOps.js";

// ---------------------------------------------------------------------------
// Re-exports — the shape and every layout/rule detector (see the module doc)
// ---------------------------------------------------------------------------

export {
  computeTouchKeyDiagnostics,
  groupTouchKeyFindingsByAddress,
  touchKeyFindingScope,
  findCrowdedTouchRows,
  findDeadTouchKeys,
  findDuplicateTouchKeyIds,
  findHalfDoneSuppressions,
  findLayerSwitchActiveMismatches,
  findMissingRequiredTouchKeys,
  findMissingTouchLayers,
  findSpecialLabelOnNormalKeys,
  findTouchKeyIdCaseMismatches,
  findTouchRuleOrphans,
  findUnidentifiedTouchKeys,
  isProducingKeyClass,
  isRulelessByConvention,
  isFrameKeyLabel,
  REQUIRED_TOUCH_KEY_IDS,
  SPECIAL_LABEL_PATTERN,
  TOUCH_RULELESS_ID_PREFIXES,
  TOUCH_SENTINEL_KEY_IDS,
  walkTouchKeys,
  walkTouchKeysDeep,
} from "@keyboard-studio/contracts";
export type {
  AddRequiredKeysFix,
  AddRuleFix,
  ClearSpecialLabelFix,
  CompleteSuppressionFix,
  ConvertToUnicodeIdFix,
  MarkAsFrameKeyFix,
  RemoveNextlayerFix,
  RenameKeyFix,
  RepointNextlayerFix,
  ReviewKeyFix,
  SetLayerSwitchSpFix,
  TouchKeyDiagnosticInputs,
  TrimRowFix,
  TouchKeyFinding,
  TouchKeyFindingCode,
  TouchKeyFindingScope,
  TouchKeyFindingSeverity,
  TouchKeyFix,
} from "@keyboard-studio/contracts";

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
 * see the module doc's "T103" section for why this reads the overlay rather than
 * the layout, and why the granularity is the layer an operation's address names
 * rather than the row a removed key used to occupy.
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


// ---------------------------------------------------------------------------
// TOUCH_KEY_KEYCAP_MISMATCH — spec 065 FR-036: the label does not match the key
// ---------------------------------------------------------------------------

/**
 * A key labelled as one thing that types another — usually a keycap left behind
 * when the key's output changed.
 *
 * **This detector's design is its five gates, not its comparison.** A keycap
 * that "does not match" is a judgement, not a defect: real keyboards label keys
 * with things deliberately unlike their output, and a hint that fires on those
 * is noise that trains authors to ignore the whole diagnostics pane. So the
 * gates are checked IN ORDER with a bail on the first failure (contract §3.1),
 * and each one removes a class of legitimate mismatch:
 *
 *   1. `sp === 0` — character keys only. A frame key (`1`/`2`), a deadkey-styled
 *      key (`8`) or a spacer is SUPPOSED to be labelled unlike its output;
 *      `*Shift*` is the point, not a mistake.
 *   2. A resolvable output — with nothing to compare against there is no
 *      judgement to make. A key whose rules produce several different characters
 *      is deliberately unresolvable: no single one of them is "the" output.
 *   3. A non-empty keycap — a blank key has no label to be wrong.
 *   4. `keycapAuthored` unset (FR-035) — an author who typed this label has
 *      already answered the question this hint would ask.
 *   5. `isKeycapRelated` false — the actual comparison, and the last thing tried
 *      because it is the most expensive and the most forgiving.
 *
 * Pure and synchronous like every other detector here: it rides the existing
 * `useMemo` inside the 300 ms cycle and starts no second timer (D3, FR-039).
 */
export function findKeycapMismatches(
  inputs: TouchKeyDiagnosticInputs,
  opts?: { readonly bcp47?: string },
): readonly TouchKeyFinding[] {
  const { layout, ruleIndex } = inputs;
  const findings: TouchKeyFinding[] = [];

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      // One counter per layer, tallying EVERY key row-major — the same walk
      // order `resolveKeyAddress` uses. The `setKeycap` fix below mutates the
      // key at its address, and a bare address for an id that repeats in the
      // layer resolves to the first such key, not this one.
      const nextOccurrence = createKeyOccurrenceCounter();
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const occurrence = nextOccurrence(key.id ?? "");
          // Gate 1 — character keys only. An ABSENT `sp` is a character key.
          if (key.sp !== undefined && key.sp !== 0) continue;

          // Gate 2 — a resolvable output. `output` wins; otherwise the rule
          // join, and only when it names exactly one character.
          let output = key.output;
          if (output === undefined || output.length === 0) {
            if (key.id === undefined || key.id.length === 0) continue;
            const produced = producedByKeyId(ruleIndex, key.id);
            if (produced.length !== 1) continue;
            output = produced[0];
          }
          if (output === undefined || output.length === 0) continue;

          // Gate 3 — a non-empty keycap.
          const keycap = key.text;
          if (keycap === undefined || keycap.length === 0) continue;

          // Gate 4 — the author's own label is never second-guessed.
          if (key.keycapAuthored === true) continue;

          // Gate 5 — the comparison.
          if (isKeycapRelated(keycap, output, opts?.bcp47 === undefined ? {} : { bcp47: opts.bcp47 })) {
            continue;
          }

          const proposed = proposeKeycap(output).keycap;
          findings.push({
            code: "TOUCH_KEY_KEYCAP_MISMATCH",
            severity: "hint",
            address: touchKeyAddress(platform.id, layer.id, key.id ?? "", occurrence),
            scope: "key",
            fields: { keycap, output },
            fixes: [
              {
                kind: "setKeycap",
                address: touchKeyAddress(platform.id, layer.id, key.id ?? "", occurrence),
                proposed,
              },
            ],
          } as TouchKeyFinding);
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// The combined aggregator
// ---------------------------------------------------------------------------

/**
 * Every edit-time touch-key diagnostic: the contracts aggregator's ten
 * layout/rule-derived codes plus {@link findMixedSuppressRemove}'s
 * overlay-derived one.
 *
 * The overlay is optional so a caller that has no committed edits yet (a freshly
 * imported keyboard, the Layer C path) gets the layout/rule set without having
 * to synthesize an empty overlay.
 *
 * Pure and synchronous (FR-042 / Decision D3): a join over its arguments, safe
 * to wrap in a `useMemo` inside the existing 300 ms cycle. It starts no timer
 * and reads no store.
 */
export function computeAllTouchKeyDiagnostics(
  inputs: TouchKeyDiagnosticInputs,
  overlay?: KeyEditOverlay,
): readonly TouchKeyFinding[] {
  const layoutFindings = [...computeTouchKeyDiagnostics(inputs), ...findKeycapMismatches(inputs)];
  if (overlay === undefined || overlay.ops.length === 0) return layoutFindings;
  return [...layoutFindings, ...findMixedSuppressRemove(overlay)];
}
