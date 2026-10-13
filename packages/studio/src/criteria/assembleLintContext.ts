// assembleLintContext — build the LintContext for the criteria page's
// lint run (spec 084, plan §4, task T2.1; Batch 1 extension).
//
// Pure-ish: it reads only the VFS it is handed (no stores, no hooks) and
// parses the judged files through the engine codec (`parseKmn`, the
// baseIr pipeline's own route), so the IR the checks run against matches
// the judged source exactly. Shared by the authored host
// (useCriteriaFindings) and the foreign host (judgeForeignKeyboard), so
// both surfaces judge with the same assembly.
//
// What it deliberately does NOT set:
//   - `docLintInput` — the documentation codes arrive via the doc path
//     (useDocumentationFindings authored-side, runDocChecks in the
//     foreign judge). Passing them to the engine as well would report
//     every doc problem twice; the resolver dedupes by (code, message)
//     regardless, and a test pins that this field is never set here.
//   - `touchLayout` / `touchInventory` / `toleranceReport` — the §18.1–18.5
//     touch checks run inside the engine from the VFS itself when the
//     touch layout parses, and no criteria-mapped code needs the others.
//
// Batch 1 (the 22-row plumb + scan batch): the context also carries a
// CriteriaLintInput — the engine-parsed .kvks (parseKvks) and .kps
// (parseKps / parseKpsFiles / parseKpsFontRefs) facts the Batch 1
// checks in keyboard-lint consume. keyboard-lint may import contracts
// only, never the engine, so the parsing happens here and the facts
// cross as a contracts shape. Facts read back from files are CHECK-NOW
// inputs, not precertification (Matthew's precertification ruling,
// 2026-10-13): precertification is resolved separately, in the resolver,
// for authored mode only.
//
// Inventory: the caller may pass a structured LinguistInventory when one
// is genuinely available. §18.6 (KM_LINT_INVENTORY_UNCOVERED) needs BOTH
// the parsed IR and the inventory; when either is unavailable the check
// silently does not run inside the engine, so this function names the
// missing input in `contextMissing` (keyed by that code) for
// CriteriaInput.contextMissing — the resolver then resolves §18.6 to
// Not yet checkable with that reason, never Met. The same treatment
// applies to the Batch 1 IR-dependent codes when the .kmn does not
// parse (their checks cannot run without an IR) and to §7.16 when the
// package has no .kvks at all: a missing file is not a blank file, so
// absence is a named missing input, never a finding and never a pass.

import type {
  CriteriaLintInput,
  CriteriaPlacement,
  LinguistInventory,
  VirtualFS,
} from "@keyboard-studio/contracts";
import {
  parseKmn,
  parseKps,
  parseKpsFiles,
  parseKpsFontRefs,
  parseKvks,
} from "@keyboard-studio/engine";
import type { LintContext } from "@keymanapp/keyboard-lint";

import { findKmnPath } from "../lib/findKmnPath.ts";
import { readVfsText } from "../lib/vfsText.ts";

/** The one criteria-mapped code whose inputs this assembly can fail to supply. */
export const INVENTORY_UNCOVERED_CODE = "KM_LINT_INVENTORY_UNCOVERED";

/** §7.16's code: named here because its absent-file case is a missing input. */
export const KVKS_BLANK_CODE = "KM_LINT_KVKS_BLANK";

const MISSING_IR = "the parsed keyboard source for this keyboard";
const MISSING_INVENTORY = "the linguist inventory for this keyboard";
const MISSING_KVKS = "the .kvks visual keyboard file";

/**
 * Batch 1 codes whose checks read the parsed keyboard IR. When the .kmn
 * is missing or unparseable these cannot run, so each is named in
 * contextMissing with the missing-IR reason rather than passing
 * silently. (7.10 is not here: it scans the raw .kmn text and runs
 * precisely when parsing is in doubt. 7.16 is not here: its missing
 * input is the .kvks, named separately below.)
 */
export const IR_DEPENDENT_CRITERIA_CODES: readonly string[] = [
  "KM_LINT_VERSION_FORMAT",
  "KM_LINT_VERSION_LEADING_ZERO",
  "KM_LINT_VERSION_V_PREFIX",
  "KM_LINT_ID_CONTAINS_KEYBOARD",
  "KM_LINT_DISPLAY_NAME_UNDERSCORE",
  "KM_LINT_TARGETS_ANY_NOT_ALONE",
  "KM_LINT_TARGETS_MOBILE_WITHOUT_TOUCH",
  "KM_LINT_RALT_MISSING_USEALTGR",
  "KM_LINT_BITMAP_PLACEHOLDER",
  "KM_LINT_REGION_001_TAG",
  "KM_LINT_PUA_KEYBOARD_PLACEMENT",
  "KM_LINT_MATH_LATIN_LOOKALIKE",
];

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
  /**
   * Repository placement of the judged keyboard (§13.1). Default
   * "release": correct for the authored host (the generator only ever
   * places output under release/) and the conservative default for a
   * foreign keyboard whose repo path is unknown.
   */
  placement?: CriteriaPlacement;
  /**
   * Run the foreign stray-scratch-file scan (§1.13 CHECK-NOW arm).
   * Foreign host only — authored mode precertifies 1.13 and never
   * scans. Default false.
   */
  scratchScan?: boolean;
  /**
   * A deprecation is in play for the judged keyboard (§15.3's gate).
   * Default false (the authored package fact); the foreign host passes
   * true, mirroring its resolver facts (§§15–16 applicable by default).
   */
  deprecationInPlay?: boolean;
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

  // Batch 1 facts: parse the .kvks and .kps of THIS VFS with the engine
  // parsers. A .kvks that exists but fails to parse still counts as
  // present (kvksPath set, kvks undefined): §7.16 then judges it on the
  // file's presence via the check's blank arm, and §7.5 stays silent
  // without a parsed flag to judge — it never invents either verdict.
  const paths = vfs.list();
  const kvksPath = paths.find((p) => p.toLowerCase().endsWith(".kvks"));
  let kvks: CriteriaLintInput["kvks"];
  const kvksText =
    kvksPath !== undefined ? readVfsText(vfs, kvksPath) : undefined;
  if (kvksText !== undefined) {
    try {
      kvks = parseKvks(kvksText);
    } catch {
      kvks = undefined;
    }
  }

  const kpsPath = paths.find((p) => p.toLowerCase().endsWith(".kps"));
  const kpsText = kpsPath !== undefined ? readVfsText(vfs, kpsPath) : undefined;
  let kpsFileNames: string[] = [];
  let kpsFontRefs: string[] = [];
  let kpsLanguages: string[] = [];
  let kpsDisplayName: string | undefined;
  if (kpsText !== undefined) {
    try {
      const meta = parseKps(kpsText);
      kpsLanguages = meta.languages;
      kpsDisplayName = meta.displayName;
      kpsFileNames = parseKpsFiles(kpsText).map((f) => f.name);
      const refs = parseKpsFontRefs(kpsText);
      kpsFontRefs = [...refs.oskFonts, ...refs.fileFonts];
    } catch {
      kpsFileNames = [];
      kpsFontRefs = [];
      kpsLanguages = [];
      kpsDisplayName = undefined;
    }
  }

  const criteriaInput: CriteriaLintInput = {
    ...(kvks !== undefined ? { kvks } : {}),
    ...(kvksPath !== undefined ? { kvksPath } : {}),
    ...(kpsText !== undefined ? { kpsText } : {}),
    kpsFileNames,
    kpsFontRefs,
    kpsLanguages,
    ...(kpsDisplayName !== undefined ? { kpsDisplayName } : {}),
    placement: input.placement ?? "release",
    deprecationInPlay: input.deprecationInPlay ?? false,
    scratchScan: input.scratchScan ?? false,
  };

  const ctx: LintContext = {
    ...(keyboardIR !== undefined ? { keyboardIR } : {}),
    ...(inventory !== undefined ? { inventory } : {}),
    criteriaInput,
  };

  const contextMissing: Record<string, string> = {};
  if (keyboardIR === undefined || inventory === undefined) {
    const missing = [
      ...(keyboardIR === undefined ? [MISSING_IR] : []),
      ...(inventory === undefined ? [MISSING_INVENTORY] : []),
    ];
    contextMissing[INVENTORY_UNCOVERED_CODE] = missing.join(" and ");
  }
  if (keyboardIR === undefined) {
    for (const code of IR_DEPENDENT_CRITERIA_CODES) {
      contextMissing[code] = MISSING_IR;
    }
  }
  if (kvksPath === undefined) {
    contextMissing[KVKS_BLANK_CODE] = MISSING_KVKS;
  }

  return { ctx, contextMissing };
}
