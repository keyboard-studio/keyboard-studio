// Touch-layout upgrade builders for the upgrade-pair registry (spec 111 T059a-c):
// the full Capsifesto touch caps layer (18.16), consistent Ctrl/RAlt keys
// (18.17) and the symbols layer (18.18). Each reads the working copy's
// `.keyman-touch-layout`, runs the engine's raw-JSON fixer and offers the
// result with a before/after preview; nothing is applied here.
//
// The fixers rewrite only what their upgrade concerns and return the layout
// text untouched when there is nothing to do, in which case no offer is made.

import {
  addTouchSymbolsLayerRaw,
  fixTouchModifierKeysRaw,
  syncTouchCapsLayerRaw,
} from "@keyboard-studio/engine";

import { findingKeyOf } from "./openRatchet.ts";
import type { SuggestedFix } from "../lib/consistencySuggestions.ts";

// Structural stand-ins for upgradePairs.ts's UpgradeInput and UpgradeOffer (that
// module imports this one, so it cannot be imported back without a cycle).
interface TouchUpgradeInput {
  /** Primary language tag, when known (casing rules such as Turkish i). */
  bcp47?: string;
  /** Text of any working-copy file by VFS path; undefined when absent. */
  readText(path: string): string | undefined;
  /** Every path in the working copy. */
  paths: readonly string[];
}
interface TouchUpgradeOffer {
  fix: SuggestedFix;
  file: string;
  afterText: string;
}

export const TOUCH_CAPS_LAYER = "KM_LINT_TOUCH_CAPS_LAYER";
export const TOUCH_MODIFIER_KEYS = "KM_LINT_TOUCH_MODIFIER_KEYS";
export const TOUCH_SYMBOLS_LAYER = "KM_LINT_TOUCH_SYMBOLS_LAYER";

/** The working copy's primary touch layout (tests/ fixtures excluded). */
function touchLayoutPathOf(paths: readonly string[]): string | undefined {
  return paths.find((p) => p.endsWith(".keyman-touch-layout") && !p.startsWith("tests/"));
}

function touchOffer(
  ruleId: string,
  title: string,
  input: TouchUpgradeInput,
  fixer: (text: string) => { json: string; changed: boolean },
): TouchUpgradeOffer | null {
  const file = touchLayoutPathOf(input.paths);
  if (file === undefined) return null;
  const before = input.readText(file);
  if (before === undefined) return null;
  const res = fixer(before);
  if (!res.changed || res.json === before) return null;
  return {
    file,
    afterText: res.json,
    fix: {
      id: `upgrade:${ruleId}:${file}`,
      kind: "upgrade",
      findingKey: findingKeyOf(ruleId, file, undefined),
      preview: [{ file, before, after: res.json }],
      status: "pending",
      title,
    },
  };
}

export async function buildTouchCapsOffer(input: TouchUpgradeInput): Promise<TouchUpgradeOffer | null> {
  const opts = input.bcp47 !== undefined ? { bcp47: input.bcp47 } : {};
  return touchOffer(
    TOUCH_CAPS_LAYER,
    "Complete the touch caps layers (double-tap Shift, one-shot Shift)",
    input,
    (text) => syncTouchCapsLayerRaw(text, opts),
  );
}

export async function buildTouchModifierKeysOffer(input: TouchUpgradeInput): Promise<TouchUpgradeOffer | null> {
  return touchOffer(
    TOUCH_MODIFIER_KEYS,
    "Make the touch Ctrl and RAlt keys consistent",
    input,
    fixTouchModifierKeysRaw,
  );
}

export async function buildTouchSymbolsOffer(input: TouchUpgradeInput): Promise<TouchUpgradeOffer | null> {
  return touchOffer(
    TOUCH_SYMBOLS_LAYER,
    "Add the touch symbols layer and its link key",
    input,
    addTouchSymbolsLayerRaw,
  );
}
