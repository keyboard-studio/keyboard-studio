// touchCodeLint — the Code tab's lint pipeline (TIKE touch-builder port,
// Phase 2; slice-spec §5.3).
//
// Pure module: Monaco text in, marker data out. No monaco imports, so this
// is unit-testable without a browser worker.
//
// Pipeline:
//   text ─JSON.parse─► syntax marker (native error mapped to an offset)
//        ─parseTouchLayoutString (contracts; lenient)─► TouchLayoutIR
//        ─► the 18-x check functions that take a bare TouchLayoutIR ─► findings
//        ─► marker data
//
// Two of the spec's ten checks are DELIBERATELY excluded:
// - checkTouchCoverage needs the linguist inventory (+ an optional rule
//   index): inputs that only exist in a full lint run's assembled context.
// - checkInventoryCoverage needs a full KeyboardIR + LinguistInventory.
// Both are exactly the "full KeyboardLintEngine run" weight slice-spec §2
// excludes from the editing loop. The eight layout-only checks below take a
// bare TouchLayoutIR — no VFS scaffolding — which is the right granularity
// for on-type linting.
//
// NEVER conformTouchLayoutToKeymanSchema here: it is a conformance pruner,
// not a validator (slice-spec §5.3 warning).
//
// Location mapping (verified in keyboard-lint during implementation): the
// 18-x checks run on the parsed IR, not on source text, so every finding's
// location is makeLocation's placeholder `{ file, line: 0 }` — there is no
// source line to map. Findings therefore surface as file-level markers on
// line 1, named by their lint code.

import {
  checkControlKeyDrift,
  checkKeysPerRow,
  checkLayerSwitchReturn,
  checkLongpress,
  checkTouchDuplicateKeyId,
  checkTouchMissingLayer,
  checkTouchMissingRequiredKey,
  checkTouchRows,
} from "@keymanapp/keyboard-lint";
import {
  parseTouchLayoutString,
  type LintFinding,
  type LintSeverity,
} from "@keyboard-studio/contracts";

/** Virtual path stamped into findings' `location.file` (no real file). */
export const TOUCH_CODE_VIRTUAL_PATH = "touch-layout.json";

/** Marker severity the pane maps onto monaco's MarkerSeverity. */
export type TouchCodeMarkerSeverity = "error" | "warning" | "info" | "hint";

/** Monaco marker data, minus the monaco import. */
export interface TouchCodeMarker {
  readonly code: string;
  readonly severity: TouchCodeMarkerSeverity;
  readonly message: string;
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

export interface TouchCodeLintResult {
  /** The markers to surface (syntax first, then check findings). */
  readonly markers: readonly TouchCodeMarker[];
  /** False when the text is not valid JSON / not a touch-layout object. */
  readonly parsed: boolean;
}

function mapSeverity(severity: LintSeverity): TouchCodeMarkerSeverity {
  switch (severity) {
    case "fatal":
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "info";
    case "hint":
      return "hint";
  }
}

/** A file-level marker spanning the text's first line. */
function fileMarker(
  text: string,
  code: string,
  severity: TouchCodeMarkerSeverity,
  message: string,
): TouchCodeMarker {
  const firstLineLength = text.split("\n", 1)[0]?.length ?? 0;
  return {
    code,
    severity,
    message,
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    // A point marker (1:1–1:1) renders no squiggle; spanning the first line
    // keeps the finding visible in the editor, not just the Problems panel.
    endColumn: Math.max(2, firstLineLength + 1),
  };
}

/**
 * Map a native JSON.parse error message to a 1-based line/column. V8
 * (older) reports "… in JSON at position N"; newer engines omit the
 * position, in which case the marker falls back to the end of the text.
 * Exported for tests.
 */
export function jsonErrorPosition(
  text: string,
  message: string,
): { line: number; column: number } {
  const at = /at position (\d+)/.exec(message);
  if (at?.[1] !== undefined) {
    const pos = Math.min(Number.parseInt(at[1], 10), text.length);
    const before = text.slice(0, pos);
    return {
      line: before.split("\n").length,
      column: pos - before.lastIndexOf("\n"),
    };
  }
  if (text.length === 0) return { line: 1, column: 1 };
  const lines = text.split("\n");
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

/**
 * Map a native JSON.parse SyntaxError to a marker. The implementer owns the
 * offset mapping (slice-spec §5.3): see {@link jsonErrorPosition}.
 */
function syntaxMarker(text: string, err: unknown): TouchCodeMarker {
  const message = err instanceof Error ? err.message : String(err);
  const { line, column } = jsonErrorPosition(text, message);
  return {
    code: "JSON_SYNTAX",
    severity: "error",
    message: `Invalid JSON: ${message}`,
    startLineNumber: line,
    startColumn: column,
    endLineNumber: line,
    endColumn: column + 1,
  };
}

function findingMarker(text: string, finding: LintFinding): TouchCodeMarker {
  return fileMarker(
    text,
    finding.code,
    mapSeverity(finding.severity),
    `[${finding.code}] ${finding.message}`,
  );
}

/**
 * Lint touch-layout JSON text for the Code tab.
 *
 * Never throws: every failure mode (syntax, shape, check) is a marker.
 */
export function lintTouchLayoutText(text: string): TouchCodeLintResult {
  try {
    JSON.parse(text);
  } catch (err) {
    return { parsed: false, markers: [syntaxMarker(text, err)] };
  }

  let ir;
  try {
    ir = parseTouchLayoutString(text);
  } catch (err) {
    // Valid JSON but not a touch-layout object (parseTouchLayoutString
    // throws TypeError). Not a syntax error — a shape error.
    const message = err instanceof Error ? err.message : String(err);
    return {
      parsed: false,
      markers: [
        fileMarker(text, "TOUCH_LAYOUT_SHAPE", "error", `Not a touch layout: ${message}`),
      ],
    };
  }

  // The eight layout-only 18-x checks (see the module header for why the two
  // coverage checks are excluded). checkLongpress/checkTouchRows return
  // CheckResult; the rest return LintFinding[] directly.
  const findings: LintFinding[] = [
    ...checkLongpress(ir, TOUCH_CODE_VIRTUAL_PATH).findings,
    ...checkTouchRows(ir, TOUCH_CODE_VIRTUAL_PATH).findings,
    ...checkKeysPerRow(ir, TOUCH_CODE_VIRTUAL_PATH),
    ...checkControlKeyDrift(ir, TOUCH_CODE_VIRTUAL_PATH),
    ...checkTouchDuplicateKeyId(ir, TOUCH_CODE_VIRTUAL_PATH),
    ...checkTouchMissingRequiredKey(ir, TOUCH_CODE_VIRTUAL_PATH),
    ...checkLayerSwitchReturn(ir, TOUCH_CODE_VIRTUAL_PATH),
    ...checkTouchMissingLayer(ir, TOUCH_CODE_VIRTUAL_PATH),
  ];

  return {
    parsed: true,
    markers: findings.map((f) => findingMarker(text, f)),
  };
}
