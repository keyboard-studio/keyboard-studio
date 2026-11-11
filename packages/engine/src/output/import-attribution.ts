// see spec.md §12 line 1157 — PR body must include source path, round-trip
// status, and opaque-feature inventory when the session imported a release/ keyboard.

import type {
  DeprecatedRewrite,
  DeprecatedRewriteKind,
  ImportReport,
} from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";

/** Human-readable heading per rewrite kind, for the as-built notes. */
const DEPRECATED_REWRITE_HEADINGS: Record<DeprecatedRewriteKind, string> = {
  "header-statement": "Header statements",
  "legacy-value-format": "Legacy value formats",
  "target-selector": "Target selectors ($keyman*:)",
  "version-raise": "Version raise",
};

/**
 * Format one rewrite entry as a single as-built-notes line:
 * `line 12: NAME "Foo" → store(&NAME) 'Foo'`.
 */
function formatDeprecatedRewrite(rewrite: DeprecatedRewrite): string {
  return `line ${rewrite.sourceLine}: ${rewrite.sourceText} → ${rewrite.rewrittenText}`;
}

export interface ImportAttributionInput {
  /** Relative path of the imported keyboard in the source tree, e.g. "release/c/cm_qwerty". */
  sourcePath: string;
  /** Pinned commit SHA from the import operation, when available. */
  sourceSha?: string;
  /** Full import report produced by the codec + Layer A' checks. */
  report: ImportReport;
  /**
   * Opaque feature IDs that were removed during the carve-gallery step
   * (e.g. ["if-option-store"]). Present only when the user deleted opaque
   * cards before publishing.
   */
  deletedOpaque?: string[];
}

/**
 * Format the round-trip status line for the import attribution block.
 *
 * Uses an exhaustive switch so future ImportStatus enum additions are caught
 * at compile time via the `default: never` assignment.
 */
function formatStatusLine(report: ImportReport): string {
  switch (report.status) {
    case ImportStatus.Clean:
      return "Round-trip status: Clean";
    case ImportStatus.CleanWithOpaque: {
      const total = report.opaqueFeatureInventory.reduce(
        (sum, item) => sum + item.count,
        0,
      );
      return `Round-trip status: CleanWithOpaque (${total} opaque feature${total === 1 ? "" : "s"})`;
    }
    case ImportStatus.ParseFailure:
      return "Round-trip status: ParseFailure (import failed; this PR should not normally exist)";
    case ImportStatus.RoundTripDivergence:
      return "Round-trip status: RoundTripDivergence (review carefully; some inputs produce different output post-emit)";
    default: {
      const _exhaustive: never = report.status;
      return `Round-trip status: ${String(_exhaustive)}`;
    }
  }
}

/**
 * Assemble the markdown "Import attribution" block for the PR body.
 *
 * Spec §12 line 1157 — when the session imported a release/ keyboard the PR
 * body must record the source path, pinned commit, round-trip status, and the
 * opaque-feature inventory so reviewers can assess the translation fidelity.
 *
 * Pure function — no I/O, safe to unit-test without network mocks.
 */
export function buildImportAttributionBlock(
  input: ImportAttributionInput,
): string {
  const { sourcePath, sourceSha, report, deletedOpaque } = input;

  // CleanWithOpaque is contractually defined as "clean import that retained at
  // least one opaque feature". An empty inventory under that status would render
  // a misleading "(0 opaque features)" / "Opaque features: none" block, so fail
  // loudly rather than silently misattribute (refs #239).
  if (
    report.status === ImportStatus.CleanWithOpaque &&
    report.opaqueFeatureInventory.length === 0
  ) {
    throw new Error(
      "CleanWithOpaque requires at least one entry in opaqueFeatureInventory",
    );
  }

  // --- source line ---
  const commitRef =
    sourceSha !== undefined && sourceSha.length > 0
      ? `(commit ${sourceSha})`
      : "(commit unknown)";
  const sourceLine = `Adapted from: \`${sourcePath}\` ${commitRef}`;

  // --- round-trip status line ---
  const statusLine = formatStatusLine(report);

  // --- opaque features inventory line ---
  const opaqueNames =
    report.opaqueFeatureInventory.length > 0
      ? report.opaqueFeatureInventory.map((item) => item.feature).join(", ")
      : "none";
  const opaqueLine = `Opaque features: ${opaqueNames}`;

  // --- deleted opaque features line (only when present) ---
  const lines: string[] = [
    "## Import attribution",
    sourceLine,
    statusLine,
    opaqueLine,
  ];

  if (deletedOpaque !== undefined && deletedOpaque.length > 0) {
    lines.push(`Deleted opaque features: ${deletedOpaque.join(", ")} (removed during carve gallery step)`);
  }

  // --- deprecated-syntax rewrites (#2633) ---
  // Each rewrite the codec performed on a Keyman 19-deprecated form, grouped
  // by kind, so the user can see exactly what changed on import. Absent
  // entirely when the source had no deprecated forms.
  const rewrites = report.deprecatedRewrites ?? [];
  if (rewrites.length > 0) {
    lines.push("", "### Deprecated syntax rewrites");
    lines.push(
      "The source used Keyman 19-deprecated syntax (removed in Keyman 20); " +
        "the working copy was rewritten to the modern equivalent:",
    );
    const kinds: DeprecatedRewriteKind[] = [
      "header-statement",
      "legacy-value-format",
      "target-selector",
      "version-raise",
    ];
    for (const kind of kinds) {
      const entries = rewrites.filter((r) => r.kind === kind);
      if (entries.length === 0) continue;
      lines.push(`- ${DEPRECATED_REWRITE_HEADINGS[kind]} (${entries.length}):`);
      for (const entry of entries) {
        lines.push(`  - ${formatDeprecatedRewrite(entry)}`);
      }
    }
  }

  return lines.join("\n");
}
