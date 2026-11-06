// upgradeTypes: the input and offer shapes shared by the upgrade pairs and their
// fixers. Kept apart so a fixer module can name them without importing the
// registry that imports it.

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import type { CapsEngine } from "../lib/capsEngine.ts";

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
  /**
   * Characters the upgrade leaves with no key, for the accept path to add to
   * the working copy's inventory as unplaced (same record as the Letters
   * step's Add), so they survive the starting-point replay and the Mechanisms
   * step can give each a new key.
   */
  inventoryAdditions?: string[];
}
