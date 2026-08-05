// Shared helpers for check-18-* (touch-layout / DISCUS) checks — internal to
// the checks directory.

import type { KeyboardIR, LintFinding, TouchLayoutIR } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import type { TouchKeyRuleIndex } from "@keyboard-studio/contracts";

/**
 * Build the `location` every check-18-* finding uses today: touch-layout
 * checks operate on the parsed IR, not on `.keyman-touch-layout` source text,
 * so there is no real line number to report — `line: 1` is the established
 * placeholder.
 *
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function makeLocation(touchLayoutPath: string): NonNullable<LintFinding["location"]> {
  return { file: touchLayoutPath, line: 1 };
}

// The two layout walks and the exemption vocabulary below moved to
// `@keyboard-studio/contracts`'s `touch-key-diagnostics.ts` at spec 058 T114,
// where the shared detectors that use them live (FR-040's one-implementation
// rule). Re-exported from here so every check module's import line is
// unchanged — and, for `TOUCH_SENTINEL_IDS`, so the copy this file used to keep
// "because Layer C cannot import engine" is gone: contracts can be imported by
// both, so there is one list again.
export {
  walkTouchKeys,
  walkTouchKeysDeep,
  isRulelessByConvention,
  isFrameKeyLabel,
  isProducingKeyClass,
  TOUCH_RULELESS_ID_PREFIXES,
  TOUCH_SENTINEL_KEY_IDS as TOUCH_SENTINEL_IDS,
} from "@keyboard-studio/contracts";
export type { TouchKeyContext } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// The joined-check input resolver (spec 058 T033 / contract §5.4)
// ---------------------------------------------------------------------------

/**
 * Everything a JOINED check needs: rules and layout together.
 *
 * The joined checks (dead `T_` key, orphan rule, duplicate id, missing layer,
 * missing required keys) all need both halves, and each resolving its own inputs
 * is how two of them end up disagreeing about which layout they are checking.
 */
export interface JoinedCheckInputs {
  readonly ir: KeyboardIR;
  readonly layout: TouchLayoutIR;
  readonly ruleIndex: TouchKeyRuleIndex;
}

/**
 * Resolve the joined checks' inputs, stating the layout PRECEDENCE once.
 *
 * Precedence, highest first:
 *   1. `ir.touchLayout` — spec-014 made the IR the canonical mutable home for the
 *      touch layout, so when it is populated it is the layout the author is
 *      actually editing and anything else is stale.
 *   2. `contextLayout` — the lint context's derived/edited layout, which the
 *      touch gallery passes at its own gate before the IR carries it.
 *   3. `vfsLayout` — a parse of the file on disk, the fallback for a plain lint
 *      run with no session state.
 *
 * Returns `undefined` when there is no keyboard IR, or no layout from any source.
 * Gating on the IR being present mirrors how the desktop inventory check is
 * gated: without rules there is no join to make, and a "check" that silently
 * degrades to layout-only would report dead keys for every rule-bearing keyboard.
 *
 * No new `LintContext` field is required — that is deliberate. Every input here
 * already reaches the lint layer.
 */
export function resolveJoinedCheckInputs(
  keyboardIR: KeyboardIR | undefined,
  contextLayout: TouchLayoutIR | undefined,
  vfsLayout: TouchLayoutIR | undefined,
): JoinedCheckInputs | undefined {
  if (keyboardIR === undefined) return undefined;
  const layout = keyboardIR.touchLayout ?? contextLayout ?? vfsLayout;
  if (layout === undefined) return undefined;
  return { ir: keyboardIR, layout, ruleIndex: buildTouchKeyRuleIndex(keyboardIR) };
}

// The exemption vocabulary (`TOUCH_SENTINEL_IDS`, `TOUCH_RULELESS_ID_PREFIXES`,
// `isRulelessByConvention`, `isFrameKeyLabel`) is re-exported at the top of this
// file from `@keyboard-studio/contracts`. It moved there at T114 together with
// the detectors that apply it.
