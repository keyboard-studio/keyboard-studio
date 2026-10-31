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
// KPJ pair (1.10b / 2.7, landed after Matthew's 2026-10-14 ruling
// re-pinned the current .kpj format to 2.0): the root .kpj's raw text
// joins the CriteriaLintInput (kpjText/kpjPath); the checks read its
// <Options><Version> in keyboard-lint. A judged VFS with no readable
// .kpj names both codes in contextMissing below.
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
//
// Batch 4: the authored host builds the inventory with
// buildCriteriaInventory (the author's confirmed decisions unioned with
// the per-target CLDR/SLDR exemplar baseline) and folds the outcome in
// via applyInventoryOutcome below. Two §18.6 states are named here
// rather than left to read as a pass, because in both the engine check
// runs (or not) without producing a finding:
//   - the build was skipped (a target has no CLDR/SLDR entry, or no
//     language target is recorded): the reason names the tag;
//   - the re-parsed IR carries raw fragments: since Batch 4 deleted
//     the check's origin guard, the fragment skip inside the check is
//     the one remaining silent exit, so the assembly names it — the
//     check must not resolve Met on a keyboard whose opaque content it
//     could not see through.

import type {
  CriteriaLintInput,
  CriteriaPlacement,
  LinguistInventory,
  ReviewContext,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { CLDR_TERRITORY_CURRENCY } from "@keyboard-studio/contracts";
import {
  parseKmn,
  parseKps,
  parseKpsFiles,
  parseKpsFontRefs,
  parseKpsPackageDetails,
  parseKvks,
} from "@keyboard-studio/engine";
import type { LintContext } from "@keymanapp/keyboard-lint";

import { findKmnPath } from "../lib/findKmnPath.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { fontFamilyName } from "./fontFamilyNames.ts";

/**
 * The region subtag of a BCP47 tag (mirrors the rule in
 * keyboard-lint's check-bcp47 regionSubtagOf — the assembly needs it
 * to name §18.7's missing CLDR data before any check runs).
 */
function regionSubtagOfTag(tag: string): string | undefined {
  const subtags = tag.split("-");
  for (const s of subtags.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(s) || /^[0-9]{3}$/.test(s)) return s;
    if (/^[A-Za-z]{4}$/.test(s)) continue;
    return undefined;
  }
  return undefined;
}

/** The one criteria-mapped code whose inputs this assembly can fail to supply. */
export const INVENTORY_UNCOVERED_CODE = "KM_LINT_INVENTORY_UNCOVERED";

/** §7.16's code: named here because its absent-file case is a missing input. */
export const KVKS_BLANK_CODE = "KM_LINT_KVKS_BLANK";

/** §1.10b's code: named here because its absent-.kpj case is a missing input. */
export const KPJ_FORMAT_OUTDATED_CODE = "KM_LINT_KPJ_FORMAT_OUTDATED";

/** §2.7's code: same missing input as 1.10b — the pair shares one reader. */
export const KPJ_VERSION_BUMPED_CODE = "KM_LINT_KPJ_VERSION_BUMPED";

const MISSING_IR = "the parsed keyboard source for this keyboard";
const MISSING_INVENTORY = "the linguist inventory for this keyboard";
const MISSING_KVKS = "the .kvks visual keyboard file";
const MISSING_KPJ = "the .kpj project file";
const MISSING_KPS = "the .kps package file";

/**
 * Group A2 .kps-listing twin codes (8.1b–8.6b / 8.8b–8.11b). All ten read
 * the .kps <File> names; with no .kps in the judged VFS every one is a
 * named missing input, never a verdict.
 */
const KPS_LISTING_TWIN_CODES = [
  "KM_LINT_KPS_KMX_ABSENT",
  "KM_LINT_KPS_KVK_ABSENT",
  "KM_LINT_KPS_JS_ABSENT",
  "KM_LINT_KPS_LICENSE_ABSENT",
  "KM_LINT_KPS_README_ABSENT",
  "KM_LINT_KPS_WELCOME_ABSENT",
  "KM_LINT_KPS_PHP_LISTED",
  "KM_LINT_KPS_HELP_LISTED",
  "KM_LINT_KPS_SOURCE_LISTED",
  "KM_LINT_KPS_JSON_LISTED",
];

/**
 * Group A2 .kps-metadata twin codes (10.1b/10.2b/10.7b/10.8b/10.9b). All
 * five read the .kps package-tab selections; with no .kps in the judged
 * VFS every one is a named missing input, never a verdict.
 */
const KPS_METADATA_TWIN_CODES = [
  "KM_LINT_KPS_FONT_UNSELECTED",
  "KM_LINT_KPS_LANGUAGES_UNSELECTED",
  "KM_LINT_KPS_DETAILS_UNSELECTED",
  "KM_LINT_KPS_FOLLOW_VERSION_UNSET",
  "KM_LINT_KPS_DESCRIPTION_EMPTY",
];

/**
 * Group A2 Batch 5 repo-context codes (1.2b/1.3b/1.4b) + the Group C
 * extraneous-files code (1.1) + 1.5 (the base-commit ID lookup). All
 * five need the reviewContext (repo path + tree/PR file list); without
 * it each is a named missing input. (19.1b/19.2b are gated by the
 * adaptation signal instead — see applicability.ts.)
 */
const REPO_CONTEXT_CODES = [
  "KM_LINT_REPO_PLACEMENT_BAD",
  "KM_LINT_REPO_NO_ORGANIZING_FOLDER",
  "KM_LINT_REPO_ROOT_SOURCE",
  "KM_LINT_FILES_OUTSIDE_FOLDER",
  "KM_LINT_DUPLICATE_KEYBOARD_ID",
];

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
  // Batch 2: modifier consistency, .kps target agreement, and the two
  // produced-set PUA checks all read the parsed IR.
  "KM_LINT_MODIFIER_NAME_INCONSISTENT",
  "KM_LINT_KPS_TARGETS_MISMATCH",
  "KM_LINT_PUA_NOT_IN_EXPERIMENTAL",
  "KM_LINT_PUA_FONT_NO_DISPLAYMAP",
  // Batch 3 (+ the 10.6 catch-up, whose IR dependence was under-named
  // when it landed): the BCP47 tag checks, the package-font check, and
  // the mandated-currency check all read the parsed IR.
  "KM_LINT_KPS_NUMERIC_REGION_TAG",
  "KM_LINT_ISO_639_5_LANG_CODE",
  "KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE",
  "KM_LINT_KPS_FONT_MISSING",
  "KM_LINT_MANDATED_CHAR_MISSING",
];

/** §18.7's code: named here because a region without CLDR data is a missing input. */
export const MANDATED_CHAR_CODE = "KM_LINT_MANDATED_CHAR_MISSING";

/** §8.13's code: named here because an undeclared .kps target list is a missing input. */
export const KPS_TARGETS_MISMATCH_CODE = "KM_LINT_KPS_TARGETS_MISMATCH";

const MISSING_KPS_TARGETS =
  "a <Targets> list in the .kps (the package does not declare targets)";

export interface AssembleLintContextInput {
  vfs: VirtualFS;
  keyboardId: string;
  /**
   * Repository context for the /review-only checks (Batch 5 + Group C).
   * The /review host sets this; the authored and Compare hosts never do
   * (they never see the repo). Absent means the four repo-context codes
   * are named missing, never judged.
   */
  reviewContext?: ReviewContext;
  /**
   * A structured linguist inventory, when the caller already has one.
   * The authored host does NOT pass it here: it builds the inventory
   * from the author's confirmed decisions plus the CLDR/SLDR baseline
   * (buildCriteriaInventory) once the artifact is assembled, and folds
   * it in via applyInventoryOutcome — exemplar resolution is async and
   * this assembly is sync. Direct callers (tests, tooling) may pass one.
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
  /**
   * The author has attested the numeric region subtag is explicitly
   * contrastive (§12.3's exception, Batch 3). Authored host only, from
   * criteriaRecordStore; default false (the foreign host never sets
   * it — no attestation exists there).
   */
  contrastiveRegionAttested?: boolean;
}

export interface AssembledLintContext {
  ctx: LintContext;
  /** Keyed by lintRuleId; consumable directly as CriteriaInput.contextMissing. */
  contextMissing: Record<string, string>;
  /**
   * The judged package's script (ISO 15924 code from its .kps, the
   * parser's "Latn" default when undeclared). The inventory builder
   * uses it as the record's script label when the survey recorded no
   * script family.
   */
  script: string;
}

/** §18.6 named-missing text when the re-parsed IR carries raw fragments. */
function rawFragmentsMissing(fragmentCount: number): string {
  return `a fragment-free parse of the keyboard source (${fragmentCount} raw fragment${fragmentCount === 1 ? "" : "s"} present — opaque content the coverage analysis cannot see through)`;
}

/** §18.6 named-missing text when the exemplar baseline cannot be formed. */
function exemplarBaselineMissing(missingTag: string | null): string {
  return missingTag === null
    ? "an exemplar baseline (no language target is recorded, so no CLDR/SLDR entry can be selected)"
    : `an exemplar baseline (no CLDR/SLDR entry for ${missingTag})`;
}

/**
 * The outcome of the authored host's inventory build
 * (buildCriteriaInventory), folded into an assembled context.
 */
export type InventoryOutcome =
  | { kind: "built"; inventory: LinguistInventory }
  | { kind: "skipped"; missingTag: string | null };

/**
 * Fold an inventory-build outcome into an assembled lint context
 * (Batch 4). The §18.6 row's honesty lives here:
 *   - No parsed IR: the assembly's existing missing reason already
 *     names the missing source; the inventory cannot change that, so
 *     the assembly is returned untouched.
 *   - Built + fragment-free IR: the inventory joins the context and
 *     §18.6's missing entry is cleared — the check will really run.
 *   - Built + raw fragments: the inventory joins the context (the
 *     check itself skips fragment-bearing IRs), but §18.6 stays named
 *     missing with the fragment reason — never a silent Met.
 *   - Skipped: §18.6 is named missing with the baseline reason (the
 *     tag with no CLDR/SLDR entry, or no recorded target).
 */
export function applyInventoryOutcome(
  assembled: AssembledLintContext,
  outcome: InventoryOutcome,
): AssembledLintContext {
  const ir = assembled.ctx.keyboardIR;
  if (ir === undefined) return assembled;

  const contextMissing: Record<string, string> = {
    ...assembled.contextMissing,
  };
  if (outcome.kind === "skipped") {
    contextMissing[INVENTORY_UNCOVERED_CODE] = exemplarBaselineMissing(
      outcome.missingTag,
    );
    return { ...assembled, contextMissing };
  }

  const ctx: LintContext = { ...assembled.ctx, inventory: outcome.inventory };
  if (ir.raw.length > 0) {
    contextMissing[INVENTORY_UNCOVERED_CODE] = rawFragmentsMissing(
      ir.raw.length,
    );
  } else {
    delete contextMissing[INVENTORY_UNCOVERED_CODE];
  }
  return { ...assembled, ctx, contextMissing };
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
  let kpsTargets: string[] = [];
  let kpsDisplayName: string | undefined;
  let script = "Latn";
  // Group A2 .kps-metadata twins (10.1b/10.2b/10.7b/10.8b/10.9b): the
  // package-tab selections, defaulting to unselected when the .kps is
  // absent (the absent case is named in contextMissing below).
  let kpsFontSelected = "";
  let kpsDetailsReadme = "";
  let kpsDetailsWelcome = "";
  let kpsDetailsLicense = "";
  let kpsFollowKeyboardVersion = false;
  let kpsDescription = "";
  if (kpsText !== undefined) {
    try {
      const meta = parseKps(kpsText);
      kpsLanguages = meta.languages;
      kpsDisplayName = meta.displayName;
      script = meta.script;
      const details = parseKpsPackageDetails(kpsText);
      kpsFontSelected = details.fontSelected;
      kpsDetailsReadme = details.readmeFile;
      kpsDetailsWelcome = details.welcomeFile;
      kpsDetailsLicense = details.licenseFile;
      kpsFollowKeyboardVersion = details.followKeyboardVersion;
      kpsDescription = details.description;
      // §8.13 compares DECLARED targets. parseKps defaults an absent
      // <Targets> element to ["windows"]; passing that default through
      // would manufacture a disagreement the package never declared,
      // so only a present <Targets> element contributes its list (the
      // absent case is named in contextMissing below).
      kpsTargets = /<Targets[\s>]/i.test(kpsText) ? [...meta.targets] : [];
      kpsFileNames = parseKpsFiles(kpsText).map((f) => f.name);
      const refs = parseKpsFontRefs(kpsText);
      kpsFontRefs = [...refs.oskFonts, ...refs.fileFonts];
    } catch {
      kpsFileNames = [];
      kpsFontRefs = [];
      kpsLanguages = [];
      kpsTargets = [];
      kpsDisplayName = undefined;
    }
  }

  // Batch 3 §8.7: family names of the .kps-listed font files that are
  // actually present in this VFS (a listed-but-absent font contributes
  // no family — its absence is the finding's substance).
  const kpsFontFamilies: string[] = [];
  if (kpsFontRefs.length > 0) {
    const wanted = new Set(
      kpsFontRefs.map((r) => (r.split(/[\\/]/).pop() ?? "").toLowerCase()),
    );
    for (const entry of vfs.entries()) {
      const base = (entry.path.split(/[\\/]/).pop() ?? "").toLowerCase();
      if (!wanted.has(base)) continue;
      if (typeof entry.content === "string") continue;
      const family = fontFamilyName(entry.content);
      if (family !== undefined && !kpsFontFamilies.includes(family)) {
        kpsFontFamilies.push(family);
      }
    }
  }

  // KPJ pair facts (1.10b / 2.7): the root .kpj's raw text, handed to
  // keyboard-lint like the .kps text for 15.3. The file lives at the
  // VFS root as <keyboardId>.kpj (the scaffolder's rename keeps it
  // there); a VFS with no .kpj at all is the named-missing case below.
  const kpjPath = paths.find((p) => p.toLowerCase().endsWith(".kpj"));
  const kpjText = kpjPath !== undefined ? readVfsText(vfs, kpjPath) : undefined;

  const criteriaInput: CriteriaLintInput = {
    ...(kvks !== undefined ? { kvks } : {}),
    ...(kvksPath !== undefined ? { kvksPath } : {}),
    ...(kpsText !== undefined ? { kpsText } : {}),
    ...(kpjPath !== undefined ? { kpjPath } : {}),
    ...(kpjText !== undefined ? { kpjText } : {}),
    kpsFileNames,
    kpsFontRefs,
    kpsLanguages,
    kpsTargets,
    kpsFontFamilies,
    kpsFontSelected,
    kpsDetailsReadme,
    kpsDetailsWelcome,
    kpsDetailsLicense,
    kpsFollowKeyboardVersion,
    kpsDescription,
    ...(input.reviewContext !== undefined
      ? { reviewContext: input.reviewContext }
      : {}),
    contrastiveRegionAttested: input.contrastiveRegionAttested ?? false,
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
  if (
    keyboardIR !== undefined &&
    inventory !== undefined &&
    keyboardIR.raw.length > 0
  ) {
    // Both inputs are present, but the check skips fragment-bearing IRs
    // (its one surviving skip): name it, or §18.6 would read as Met on a
    // keyboard whose opaque content was never analysed.
    contextMissing[INVENTORY_UNCOVERED_CODE] = rawFragmentsMissing(
      keyboardIR.raw.length,
    );
  }
  if (keyboardIR === undefined) {
    for (const code of IR_DEPENDENT_CRITERIA_CODES) {
      contextMissing[code] = MISSING_IR;
    }
  }
  if (kvksPath === undefined) {
    contextMissing[KVKS_BLANK_CODE] = MISSING_KVKS;
  }
  if (kpjPath === undefined || kpjText === undefined) {
    // No .kpj in the judged VFS (or none readable as text): neither
    // KPJ-pair row can be judged — name the missing file for both
    // rather than letting either pass on an unread file.
    contextMissing[KPJ_FORMAT_OUTDATED_CODE] = MISSING_KPJ;
    contextMissing[KPJ_VERSION_BUMPED_CODE] = MISSING_KPJ;
  }
  if (kpsPath === undefined || kpsText === undefined) {
    // No .kps in the judged VFS (or none readable as text): none of the
    // .kps-listing twin rows (8.1b–8.6b / 8.8b–8.11b) or the .kps-metadata
    // twin rows (10.1b/10.2b/10.7b/10.8b/10.9b) can be judged — name the
    // missing file for all fifteen rather than letting any pass on an
    // unread package.
    for (const code of [...KPS_LISTING_TWIN_CODES, ...KPS_METADATA_TWIN_CODES]) {
      contextMissing[code] = MISSING_KPS;
    }
  }

  // Group A2 text-content twins (Batch 4): name the missing doc inputs.
  // 11.1b is excluded — the help .php's existence is the criterion, so
  // its absence is a finding, never a missing input.
  const loweredPaths = new Set(paths.map((p) => p.toLowerCase()));
  const hasLicense = loweredPaths.has("license.md");
  const hasReadmeMd = loweredPaths.has("readme.md");
  const hasReadmeHtm = loweredPaths.has("source/readme.htm");
  const hasWelcomeHtm =
    loweredPaths.has("source/welcome.htm") ||
    loweredPaths.has("source/welcome/welcome.htm");
  const hasPhp = [...loweredPaths].some((p) => p.endsWith(".php"));
  const hasKmn = [...loweredPaths].some((p) => p.endsWith(".kmn"));
  if (!hasLicense) {
    contextMissing["KM_LINT_COPYRIGHT_ABSENT"] = "LICENSE.md";
    contextMissing["KM_LINT_COPYRIGHT_SYNTAX"] = "LICENSE.md";
  }
  if (!hasKmn && (kpsPath === undefined || kpsText === undefined)) {
    contextMissing["KM_LINT_COPYRIGHT_YEAR_EMBEDDED"] =
      "the .kmn source and the .kps package file";
  }
  if (!hasReadmeMd && !hasReadmeHtm && !hasWelcomeHtm && !hasPhp) {
    contextMissing["KM_LINT_VERSION_IN_DOCS"] = "the documentation files";
  }
  if (!hasReadmeMd && !hasReadmeHtm && !hasWelcomeHtm) {
    contextMissing["KM_LINT_COPYRIGHT_IN_DOCS"] = "the documentation files";
  }
  if (!hasReadmeMd) {
    contextMissing["KM_LINT_README_KEYMAN_LINK_ABSENT"] = "README.md";
    contextMissing["KM_LINT_README_HELP_LINK_ABSENT"] = "README.md";
  }
  if (!hasWelcomeHtm) {
    contextMissing["KM_LINT_WELCOME_LANG_MISMATCH"] = "source/welcome.htm";
  }
  if (!hasKmn) {
    contextMissing["KM_LINT_AUTHOR_IN_KMN"] = "the .kmn source";
  }
  if (!hasPhp) {
    contextMissing["KM_LINT_PHP_STYLE_OUTSIDE"] = "the help .php";
    contextMissing["KM_LINT_PHP_CLOSING_TAGS"] = "the help .php";
  }

  // Group A2 Batch 5 + Group C: without a reviewContext the repo-context
  // checks cannot run — name the missing context for the five repo codes.
  // (19.1b/19.2b are gated by the adaptation signal instead.)
  if (input.reviewContext === undefined) {
    for (const code of REPO_CONTEXT_CODES) {
      contextMissing[code] = "the repository context (repo path and file list)";
    }
  }
  // 1.5: a PR target whose base-commit ID lookup failed (API error) —
  // name the missing lookup rather than letting the row pass or fail
  // undecided. Non-PR targets need no lookup (met-moot in the check).
  if (
    input.reviewContext !== undefined &&
    input.reviewContext.isPr &&
    input.reviewContext.idConflictAtBase === undefined
  ) {
    contextMissing["KM_LINT_DUPLICATE_KEYBOARD_ID"] =
      "the PR base-commit keyboard-ID lookup";
  }
  // 2.6: the PR base .kmn version for the "strictly greater"
  // comparison. Without a reviewContext (Compare) the lookup cannot
  // run; a PR target whose lookup failed (API error) names the missing
  // lookup. Non-PR targets need no lookup (met-moot in the check).
  // Authored mode never reaches here: its assembly verdict resolves
  // 2.6 before the contextMissing gate.
  if (input.reviewContext === undefined) {
    contextMissing["KM_LINT_VERSION_NOT_INCREMENTED"] =
      "the repository context (repo path and file list)";
  } else if (
    input.reviewContext.isPr &&
    input.reviewContext.baseKmnVersion === undefined
  ) {
    contextMissing["KM_LINT_VERSION_NOT_INCREMENTED"] =
      "the PR base-commit .kmn version";
  }
  // 19.2b needs HISTORY.md text; without the file the row cannot be
  // judged (its absence is not the 19.2 violation — that's 3.1b's).
  if (
    input.reviewContext !== undefined &&
    input.reviewContext.historyMd === undefined
  ) {
    contextMissing["KM_LINT_HISTORY_ATTRIBUTION_BAD"] = "HISTORY.md";
  }
  if (keyboardIR !== undefined && kpsTargets.length === 0) {
    // §8.13 has nothing to compare without a declared .kps target list
    // (no .kps, or a .kps with no <Targets> element): name the missing
    // input rather than letting the row pass on an empty comparison.
    contextMissing[KPS_TARGETS_MISMATCH_CODE] = MISSING_KPS_TARGETS;
  }
  if (keyboardIR !== undefined) {
    // §18.7 degrades honestly: a tag whose region has no CLDR currency
    // entry cannot be judged — name the missing data rather than
    // letting the row pass on an unchecked mandate.
    const noDataRegions = new Set<string>();
    for (const tag of [...keyboardIR.header.bcp47, ...kpsLanguages]) {
      const region = regionSubtagOfTag(tag);
      if (
        region !== undefined &&
        CLDR_TERRITORY_CURRENCY[region.toUpperCase()] === undefined
      ) {
        noDataRegions.add(region.toUpperCase());
      }
    }
    if (noDataRegions.size > 0) {
      contextMissing[MANDATED_CHAR_CODE] =
        `CLDR currency data for region ${[...noDataRegions].sort().join(", ")}`;
    }
  }

  return { ctx, contextMissing, script };
}
