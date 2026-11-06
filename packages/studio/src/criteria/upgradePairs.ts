// upgradePairs: the registry that pairs a failing criterion with the fixer that
// upgrades the keyboard's Keyman structure (spec 111 US6, FR-025).
//
// An upgrade is an offer, never an edit: `offerUpgrade` returns a SuggestedFix
// carrying the before/after `.kmn` text and applies nothing. The change is made
// on the IR and projected back onto the original text (`projectKmnText`), so
// only the touched constructs differ.
//
// Pure of timers and store reads (decision D3 is untouched). The caps engine
// (compile + simulate) is lazy-loaded by the caller and passed in.

import { parseKmn, projectKmnText } from "@keyboard-studio/engine";

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import type { CapsEngine } from "../lib/capsEngine.ts";
import { findingKeyOf } from "./openRatchet.ts";
import {
  TOUCH_CAPS_LAYER,
  TOUCH_MODIFIER_KEYS,
  TOUCH_SYMBOLS_LAYER,
  buildTouchCapsOffer,
  buildTouchModifierKeysOffer,
  buildTouchSymbolsOffer,
} from "./touchUpgradePairs.ts";

export const CASEDKEYS_MISSING = "KM_LINT_CASEDKEYS_MISSING";

/** What a fixer needs to build its offer. */
export interface UpgradeInput {
  /** Path of the `.kmn` in the working-copy VFS. */
  file: string;
  kmnText: string;
  keyboardId: string;
  /** Primary language tag, when known (casing rules such as Turkish i). */
  bcp47?: string;
  caps: Pick<CapsEngine, "upgradeToCasedKeys" | "compareCapsBehaviour">;
  /** Text of any working-copy file by VFS path; undefined when absent. */
  readText(path: string): string | undefined;
  /** Every path in the working copy. */
  paths: readonly string[];
}

export interface UpgradeOffer {
  fix: SuggestedFix;
  /** The working-copy path the upgrade rewrites. */
  file: string;
  /** The full text to write there when the author accepts. */
  afterText: string;
}

export interface UpgradePair {
  /** The criterion's lintRuleId this pair repairs. */
  lintRuleId: string;
  /** Null when the upgrade does not apply or is not safe to offer. */
  build(input: UpgradeInput): Promise<UpgradeOffer | null>;
}

async function buildCasedKeysOffer(input: UpgradeInput): Promise<UpgradeOffer | null> {
  const opts = input.bcp47 !== undefined ? { bcp47: input.bcp47 } : {};
  const startIr = parseKmn(input.kmnText, input.keyboardId).ir;
  const upgraded = input.caps.upgradeToCasedKeys(startIr, opts);
  // Nothing derived (no cased letters): there is nothing to store.
  if (upgraded.set.keys.length === 0) return null;
  const projected = projectKmnText(input.kmnText, startIr, upgraded.ir);
  if (!projected.ok) return null;
  const afterKmn = projected.text;
  if (afterKmn === input.kmnText) return null;
  // Offered only when the keys type the same characters with and without caps.
  const cmp = await input.caps.compareCapsBehaviour(input.kmnText, afterKmn, upgraded.set.keys, opts);
  if (cmp.verdict === "differs") return null;
  return {
    file: input.file,
    afterText: afterKmn,
    fix: {
      id: `upgrade:${CASEDKEYS_MISSING}:${input.file}`,
      kind: "upgrade",
      findingKey: findingKeyOf(CASEDKEYS_MISSING, input.file, undefined),
      preview: [{ file: input.file, before: input.kmnText, after: afterKmn }],
      status: "pending",
      title: "Use &CasedKeys instead of per-key caps rules",
    },
  };
}

/** The upgrade-pair registry, keyed by lintRuleId. */
export const UPGRADE_PAIRS: readonly UpgradePair[] = [
  { lintRuleId: CASEDKEYS_MISSING, build: buildCasedKeysOffer },
  { lintRuleId: TOUCH_CAPS_LAYER, build: buildTouchCapsOffer },
  { lintRuleId: TOUCH_MODIFIER_KEYS, build: buildTouchModifierKeysOffer },
  { lintRuleId: TOUCH_SYMBOLS_LAYER, build: buildTouchSymbolsOffer },
];

/** The fixer registered for a criterion's lint rule, if any. */
export function upgradePairFor(lintRuleId: string): UpgradePair | undefined {
  return UPGRADE_PAIRS.find((p) => p.lintRuleId === lintRuleId);
}

/** Offers for every failing rule that has a registered fixer. */
export async function offerUpgrades(
  failingRuleIds: Iterable<string>,
  input: UpgradeInput,
): Promise<UpgradeOffer[]> {
  const out: UpgradeOffer[] = [];
  for (const id of new Set(failingRuleIds)) {
    const offer = await upgradePairFor(id)?.build(input);
    if (offer) out.push(offer);
  }
  return out;
}
