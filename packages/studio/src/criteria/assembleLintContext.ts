// assembleLintContext — build the LintContext for the criteria page's
// authored lint run (spec 084, plan §4, task T2.1).
//
// Pure-ish: it reads only the VFS it is handed (no stores, no hooks) and
// parses the .kmn in that VFS through the engine codec (`parseKmn`, the
// baseIr pipeline's own route), so the IR the inventory check runs against
// matches the judged source exactly.
//
// What it deliberately does NOT set:
//   - `docLintInput` — the 13 documentation codes arrive via the existing
//     useDocumentationFindings() path (plan §4). Passing them to the engine
//     as well would report every doc problem twice; the resolver dedupes
//     by (code, message) regardless, and a test pins that this field is
//     never set here.
//   - `touchLayout` / `touchInventory` / `toleranceReport` — the §18.1–18.5
//     touch checks run inside the engine from the VFS itself when the
//     touch layout parses, and no criteria-mapped code needs the others.
//
// Inventory: the caller may pass a structured LinguistInventory when one
// is genuinely available. §18.6 (KM_LINT_INVENTORY_UNCOVERED) needs BOTH
// the parsed IR and the inventory; when either is unavailable the check
// silently does not run inside the engine, so this function names the
// missing input in `contextMissing` (keyed by that code) for
// CriteriaInput.contextMissing — the resolver then resolves §18.6 to
// Not yet checkable with that reason, never Met.

import type {
  LinguistInventory,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import type { LintContext } from "@keymanapp/keyboard-lint";

import { findKmnPath } from "../lib/findKmnPath.ts";
import { readVfsText } from "../lib/vfsText.ts";

/** The one criteria-mapped code whose inputs this assembly can fail to supply. */
export const INVENTORY_UNCOVERED_CODE = "KM_LINT_INVENTORY_UNCOVERED";

const MISSING_IR = "the parsed keyboard source for this keyboard";
const MISSING_INVENTORY = "the linguist inventory for this keyboard";

export interface AssembleLintContextInput {
  vfs: VirtualFS;
  keyboardId: string;
  /**
   * The author's confirmed structured linguist inventory, when one exists.
   * Optional: no production code in the studio builds a LinguistInventory
   * from the author's (flat) alphabet decisions today — the working copy
   * holds only a flat confirmed character list, and synthesising the
   * structured shape (language / script / cased core alphabet) from it
   * would invent facts. Callers therefore normally omit this, and §18.6
   * degrades visibly via `contextMissing` instead.
   */
  inventory?: LinguistInventory;
}

export interface AssembledLintContext {
  ctx: LintContext;
  /** Keyed by lintRuleId; consumable directly as CriteriaInput.contextMissing. */
  contextMissing: Record<string, string>;
}

export function assembleLintContext(
  input: AssembleLintContextInput,
): AssembledLintContext {
  const { vfs, keyboardId, inventory } = input;

  // Parse the .kmn from THIS VFS (the artifact under judgment), not from
  // any store snapshot. A missing or unparseable .kmn is not an error
  // here: it degrades §18.6 via contextMissing, exactly like a missing
  // inventory, while the VFS-driven touch checks still run in the engine.
  let keyboardIR: LintContext["keyboardIR"];
  const kmnPath = findKmnPath(vfs);
  const kmnText = kmnPath !== undefined ? readVfsText(vfs, kmnPath) : undefined;
  if (kmnText !== undefined) {
    try {
      keyboardIR = parseKmn(kmnText, keyboardId).ir;
    } catch {
      keyboardIR = undefined;
    }
  }

  const ctx: LintContext = {
    ...(keyboardIR !== undefined ? { keyboardIR } : {}),
    ...(inventory !== undefined ? { inventory } : {}),
  };

  const contextMissing: Record<string, string> = {};
  if (keyboardIR === undefined || inventory === undefined) {
    const missing = [
      ...(keyboardIR === undefined ? [MISSING_IR] : []),
      ...(inventory === undefined ? [MISSING_INVENTORY] : []),
    ];
    contextMissing[INVENTORY_UNCOVERED_CODE] = missing.join(" and ");
  }

  return { ctx, contextMissing };
}
