// Shared helpers for check-18-* (touch-layout / DISCUS) checks — internal to
// the checks directory.

import type {
  KeyboardIR,
  LintFinding,
  TouchKeyIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
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
}

/**
 * Walk every leaf key in a touch layout, in `platform → layer → row → key`
 * order (matching the checks' original nested-loop order exactly), invoking
 * `cb` once per key with its full positional context.
 *
 * Does not descend into a key's own `sk`/`multitap`/`flick` sub-keys — those
 * are a different traversal shape (recursive, not row/column positioned) and
 * are out of scope for this iterator.
 *
 * @param ir - Parsed touch layout.
 * @param cb - Invoked once per key with platform/layer/row/key context.
 */
export function walkTouchKeys(ir: TouchLayoutIR, cb: (ctx: TouchKeyContext) => void): void {
  for (const platform of ir.platforms) {
    for (const layer of platform.layers) {
      layer.rows.forEach((row, rowIndex) => {
        row.keys.forEach((key, keyIndex) => {
          cb({ platform, layer, row, rowIndex, key, keyIndex });
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
 * Checks that report a position must keep using the flat walk; checks that must
 * see every id in the file (the dead-key check, which Keyman Developer's own
 * 0x092 descends for) use this one.
 *
 * `path` is the chain of ancestor keys, outermost first, empty for a main key —
 * so a message can say which longpress menu an entry came from.
 */
export function walkTouchKeysDeep(
  ir: TouchLayoutIR,
  cb: (ctx: TouchKeyContext & { path: readonly TouchKeyIR[] }) => void,
): void {
  walkTouchKeys(ir, (ctx) => {
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

// ---------------------------------------------------------------------------
// Exemption vocabulary shared by the joined checks
// ---------------------------------------------------------------------------

/**
 * Ruleless sentinel ids the studio and the corpus both use for a deliberately
 * inert key. A sentinel is not a dead key — it is a key whose whole purpose is
 * to produce nothing (contract §5.1).
 */
export const TOUCH_SENTINEL_IDS: readonly string[] = ["T_BLANK", "T_SPACER", "T_NUL"];

/**
 * Id prefixes that are auto-minted or reserved for neutralization, and therefore
 * never expected to carry a rule.
 *
 * `T_new_` is Keyman Developer's own auto-mint. The other three are OUR reserved
 * neutralization prefixes, written by the carve cascade, the touch-deletion
 * overlay, and key removal — a key we deliberately emptied must not then be
 * reported as a defect we introduced.
 */
export const TOUCH_RULELESS_ID_PREFIXES: readonly string[] = [
  "T_NEW_",
  "T_REMOVED_",
  "T_CARVED_",
  "T_TOUCHDEL_",
];

/** True for a sentinel or auto-minted/reserved id (case-insensitive). */
export function isRulelessByConvention(keyId: string): boolean {
  const upper = keyId.toUpperCase();
  if (TOUCH_SENTINEL_IDS.includes(upper)) return true;
  return TOUCH_RULELESS_ID_PREFIXES.some((p) => upper.startsWith(p));
}

/**
 * True for a `*`-prefixed frame-key label (`*Shift*`, `*abc*`, …).
 *
 * These are Keyman's own convention for a key whose caption is drawn from a
 * built-in string table rather than being literal output, so the label is never
 * a producer and the key is never expected to carry a rule.
 */
export function isFrameKeyLabel(text: string | undefined): boolean {
  return text !== undefined && text.startsWith("*");
}
