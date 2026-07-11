// kmcmplib diagnostic codes → studio LintCode translation.
//
// The CODE_MAP table holds stable aliases for the 5 WASM-only Layer A
// checks (#10–#14, spec.md §10) plus any other upstream codes the studio
// has chosen to surface under a curated name. Codes not in the table
// fall through to translatePassthrough() — they retain their semantics
// (severity preserved via upstream prefix) but are tagged group:
// "passthrough" so consumers asking for only group:"behavior" don't see
// unlabelled compiler noise.
//
// Growth policy: when kmcmplib emits a code we want to expose under a
// stable studio alias, add it to CODE_MAP under a chore(engine) PR and
// bump the engine patch version. Exhaustive enumeration of all 178
// kmcmplib codes is deliberately deferred — passthrough handles the rest.
//
// See spec.md §10 and the Issue #16 design (cycles 1-5).

import type {
  LintCode,
  LintFinding,
  LintSeverity,
} from "@keyboard-studio/contracts";
import type { GroupName } from "./types.js";
import type { RawWasmFinding } from "./wasmLoader.js";

export interface CodeMapEntry {
  code: LintCode;
  severity: LintSeverity;
  group: GroupName;
}

/**
 * Named aliases for selected kmcmplib codes. Keys are the kmcmplib
 * symbol name as a string. Cycle-2 reconnaissance confirmed each numeric
 * value against `developer/src/common/include/kmn_compiler_errors.h`.
 */
export const CODE_MAP: Readonly<Record<string, CodeMapEntry>> = {
  // Check #10 — CAPS/NCAPS consistency (0x0AD; severity Warn)
  WARN_KeyShouldIncludeNCaps: {
    code: "KM_WARN_NCAPS_CONSISTENCY",
    severity: "warning",
    group: "behavior",
  },
  // Check #11 — Unreachable rules (0x0AE; severity Hint)
  HINT_UnreachableRule: {
    code: "KM_HINT_UNREACHABLE_RULE",
    severity: "hint",
    group: "behavior",
  },
  // Check #11 — Unreachable key code (0x09A; severity Hint; related family)
  HINT_UnreachableKeyCode: {
    code: "KM_HINT_UNREACHABLE_RULE",
    severity: "hint",
    group: "behavior",
  },
  // Check #12 — platform() argument parsing (0x049; severity Error)
  ERROR_InvalidIf: {
    code: "KM_ERROR_INVALID_PLATFORM_STRING",
    severity: "error",
    group: "behavior",
  },
  // Check #13 — context(N) offset validity (0x05F; severity Error)
  ERROR_ContextExHasInvalidOffset: {
    code: "KM_ERROR_INVALID_CONTEXT_OFFSET",
    severity: "error",
    group: "reference",
  },
  // Check #14 — Named virtual-key code constants (0x03F; severity Error)
  ERROR_InvalidNamedCode: {
    code: "KM_ERROR_INVALID_NAMED_CODE_CONSTANT",
    severity: "error",
    group: "reference",
  },
};

// ---------------------------------------------------------------------------
// Oracle-inapplicable diagnostics.
//
// The oracle feeds kmcmplib a single in-memory source; its loadFile() /
// existsSync() callbacks deny every other path (wasmLoader.ts). File-existence
// diagnostics therefore fire for EVERY keyboard whose header names a packaging
// asset (nearly all real bases reference a &BITMAP .ico) and carry zero signal
// in the text-only lint context. Asset presence is the artifact pipeline's
// concern — the preview compile strips dangling references against a real VFS
// (compiler/stripDanglingAssetStores.ts) and the output path packages the
// fetched files.
//
// Wire format: kmc-kmn reports message.code as the full NUMERIC value
// (severity | namespace | base), e.g. ERROR_CannotReadBitmapFile =
// Error(0x500000) | KmnCompiler(0x2000) | 0x031 = 0x502031. Matching strips
// the severity bits so an upstream severity re-tag cannot resurrect the noise;
// the symbolic form is also matched in case a future WASM side resolves names.
// ---------------------------------------------------------------------------

/** Strips CompilerErrorSeverity (bits >= 0x100000), keeping namespace | base. */
const KMCMP_BASECODE_MASK = 0xfffff;

// namespace|base values of file-read diagnostics meaningless in the oracle.
// Every sibling-asset store the header can name (BITMAP, VISUALKEYBOARD,
// LAYOUTFILE, KMW_EMBEDJS, KMW_HELPFILE, INCLUDECODES, …) triggers a
// file-open/exists diagnostic the oracle's loadFile/existsSync callbacks
// structurally deny for EVERY keyboard — so the whole class is noise here,
// regardless of upstream severity (some are Error, KMW_EMBEDJS/HELPFILE are
// Warn). Values are namespace|base (severity bits masked off): note the
// namespace is NOT uniformly KmnCompiler(0x2000) — the touch-layout check
// lives in KmwCompiler(0x7000). Verified against the keymanapp/keyman source
// (kmn_compiler_errors.h, kmc-kmn kmw-compiler / compiler messages).
const ORACLE_INAPPLICABLE_BASE_CODES: ReadonlySet<number> = new Set([
  0x2031, // ERROR_CannotReadBitmapFile        — &BITMAP: "Cannot open the bitmap or icon file for reading"
  0x290c, // ERROR_FileNotFound                — &VISUALKEYBOARD .kvks not found (also covers &DISPLAYMAP)
  0x7004, // ERROR_TouchLayoutFileDoesNotExist — &LAYOUTFILE touch-layout file missing (KmwCompiler namespace)
  0x2095, // WARN_EmbedJsFileMissing           — &KMW_EMBEDJS missing (also reused for &KMW_EMBEDCSS)
  0x2094, // WARN_HelpFileMissing              — &KMW_HELPFILE missing
  0x2038, // ERROR_CannotLoadIncludeFile       — &INCLUDECODES file cannot be loaded
]);

/** Symbolic aliases of the same diagnostics (future-proofing the wire format). */
const ORACLE_INAPPLICABLE_SYMBOLS: ReadonlySet<string> = new Set([
  "ERROR_CannotReadBitmapFile",
  "ERROR_FileNotFound",
  "ERROR_TouchLayoutFileDoesNotExist",
  "WARN_EmbedJsFileMissing",
  "WARN_HelpFileMissing",
  "ERROR_CannotLoadIncludeFile",
]);

/**
 * True when a raw kmcmplib code denotes a file-existence diagnostic that the
 * text-only oracle can never satisfy (see block comment above). The oracle
 * drops these findings before translation.
 */
export function isOracleInapplicable(kmcmpCode: string): boolean {
  if (ORACLE_INAPPLICABLE_SYMBOLS.has(kmcmpCode)) return true;
  // Short-circuit blank input: Number("") and Number("   ") both coerce to 0,
  // which passes Number.isInteger and would reach the mask-and-lookup.
  if (kmcmpCode.trim() === "") return false;
  const numeric = Number(kmcmpCode);
  if (!Number.isInteger(numeric)) return false;
  return ORACLE_INAPPLICABLE_BASE_CODES.has(numeric & KMCMP_BASECODE_MASK);
}

/** Sanitize a kmcmplib code suffix into a SCREAMING_SNAKE_CASE LintCode tail. */
function normalizeSuffix(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

/**
 * Translate a raw kmcmplib code that isn't in CODE_MAP. Severity is
 * derived from the upstream prefix (FATAL_/ERROR_/WARN_/HINT_/INFO_);
 * INFO_ is downgraded to "hint" because Layer A must not emit "info"
 * (see packages/contracts/src/lintFinding.ts:10-12).
 *
 * The resulting LintCode embeds "KMCMP" so passthrough findings are
 * visually distinct in tools and logs.
 */
export function translatePassthrough(kmcmpCode: string): Omit<CodeMapEntry, "group"> {
  const match = /^(FATAL|ERROR|WARN|HINT|INFO)_(.*)$/.exec(kmcmpCode);
  const suffix = match
    ? normalizeSuffix(match[2] ?? "")
    : normalizeSuffix(kmcmpCode);
  const safeSuffix = suffix.length > 0 ? suffix : "UNKNOWN";

  if (!match) {
    // No recognizable prefix — default to hint (safest, non-blocking).
    return {
      code: `KM_HINT_KMCMP_${safeSuffix}`,
      severity: "hint",
    };
  }

  switch (match[1]) {
    case "FATAL":
      return {
        code: `KM_FATAL_KMCMP_${safeSuffix}`,
        severity: "fatal",
      };
    case "ERROR":
      return {
        code: `KM_ERROR_KMCMP_${safeSuffix}`,
        severity: "error",
      };
    case "WARN":
      return {
        code: `KM_WARN_KMCMP_${safeSuffix}`,
        severity: "warning",
      };
    case "HINT":
      return {
        code: `KM_HINT_KMCMP_${safeSuffix}`,
        severity: "hint",
      };
    case "INFO":
    default:
      // INFO_* downgrades to hint per Layer A contract.
      return {
        code: `KM_HINT_KMCMP_${safeSuffix}`,
        severity: "hint",
      };
  }
}

/**
 * Translate a raw WASM finding into a LintFinding. Returns the finding
 * plus the resolved GroupName so the caller can filter by requested
 * groups.
 */
export function translateWasmFinding(
  raw: RawWasmFinding,
  sourceFile: string
): { finding: LintFinding; group: GroupName } {
  const entry = CODE_MAP[raw.kmcmpCode];

  if (entry !== undefined) {
    const finding: LintFinding = {
      code: entry.code,
      severity: entry.severity,
      layer: "A",
      message: raw.text,
      location: locationFor(raw, sourceFile),
    };
    return { finding, group: entry.group };
  }

  const passthrough = translatePassthrough(raw.kmcmpCode);
  const finding: LintFinding = {
    code: passthrough.code,
    severity: passthrough.severity,
    layer: "A",
    message: raw.text,
    location: locationFor(raw, sourceFile),
  };
  return { finding, group: "passthrough" };
}

function locationFor(raw: RawWasmFinding, file: string) {
  return raw.column !== undefined
    ? { file, line: raw.line, column: raw.column }
    : { file, line: raw.line };
}
