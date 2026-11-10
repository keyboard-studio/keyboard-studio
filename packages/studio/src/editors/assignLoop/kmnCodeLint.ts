// kmnCodeLint — the Mechanical Gallery's Code tab lint pipeline.
//
// Pure module: .kmn source text in, marker data out. No monaco imports, so
// this is unit-testable without a browser worker.
//
// Pipeline:
//   text ─parseKmn (engine; throws Error with `line:col`)─► markers
//        ─findRawCtrlRules (keyboard-lint; 7.29)─► raw-Ctrl markers
//
// parseKmn throws on hard syntax errors with messages like
// "Malformed rule at line 12:3: ...". The line/col is extracted for
// positioned markers; messages without a position become file-level markers.
//
// Raw Ctrl (issue #2359, spec 114 FR-003): a rule that types content on
// unsided CTRL without Alt may not be AUTHORed here — the Code tab is the one
// authoring surface the gallery pools do not cover. A rule the edited text
// ADDS (not already in the working copy) is an error marker and blocks Apply
// (`parsed: false`, the same gate syntax errors use); a rule already in the
// working copy (imported / grandfathered) is a warning marker and never
// blocks, matching the Open submit ratchet (pre-existing failures never
// block). Rule identity is content-based (`[plane key] > outputs`), not
// positional, so editing an unrelated rule never reclassifies a grandfathered
// rule as new. The 7.29 detector's own exemptions stand (K_SPACE, basic_*,
// a Ctrl+digit rule typing the same digit). Findings carry no source
// position — the checks run on the parsed IR — so they surface as file-level
// markers on line 1, as touchCodeLint does for the 18-x checks.

import { findRawCtrlRules, type RawCtrlRule } from "@keymanapp/keyboard-lint";
import type { KeyboardIR } from "@keyboard-studio/contracts";

/** Marker severity the pane maps onto monaco's MarkerSeverity. */
export type KmnCodeMarkerSeverity = "error" | "warning" | "info" | "hint";

/** Monaco marker data, minus the monaco import. */
export interface KmnCodeMarker {
  readonly code: string;
  readonly severity: KmnCodeMarkerSeverity;
  readonly message: string;
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

export interface KmnCodeLintResult {
  /** The markers to surface. */
  readonly markers: readonly KmnCodeMarker[];
  /** False when the text does not parse or adds a raw-Ctrl rule. */
  readonly parsed: boolean;
}

/** Options for {@link lintKmnCodeText}. */
export interface KmnCodeLintOptions {
  /** Keyboard id for the 7.29 detector's basic_* exemption. Defaults to "keyboard". */
  readonly keyboardId?: string;
  /**
   * Content keys (see {@link rawCtrlRuleKey}) of the raw-Ctrl rules already
   * in the working copy — never block. Defaults to empty: every raw-Ctrl
   * rule in the text is new.
   */
  readonly baselineRawCtrl?: ReadonlySet<string>;
}

/**
 * Content-based identity of one raw-Ctrl rule, stable across edits to
 * unrelated rules. The pane builds the baseline set from the working copy's
 * current IR with this same function, so the lint and the pane cannot drift
 * apart.
 */
export function rawCtrlRuleKey(rule: RawCtrlRule): string {
  return `[${rule.plane} ${rule.key}]>${rule.outputs.join(",")}${rule.hasOtherOutputs ? "+other" : ""}`;
}

/** The IR out of a parse result, or null when the parse stub returns no usable IR. */
function parsedIr(value: unknown): KeyboardIR | null {
  if (typeof value !== "object" || value === null) return null;
  const ir = (value as { ir?: unknown }).ir;
  if (typeof ir !== "object" || ir === null) return null;
  if (!Array.isArray((ir as { groups?: unknown }).groups)) return null;
  return ir as KeyboardIR;
}

/** A file-level marker spanning the text's first line. */
function fileMarker(
  text: string,
  code: string,
  severity: KmnCodeMarkerSeverity,
  message: string,
): KmnCodeMarker {
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

/** Quote one typed character for a marker message. */
function quoteOutput(output: string): string {
  return output.includes("'") ? `"${output}"` : `'${output}'`;
}

/** What a raw-Ctrl rule types, in prose for a marker message. */
function describeRawCtrlOutputs(rule: RawCtrlRule): string {
  if (rule.outputs.length > 0) return rule.outputs.map(quoteOutput).join(", ");
  return "a non-character output";
}

/**
 * Extract a 1-based line/column from a parseKmn error message.
 * Messages look like "Malformed rule at line 12:3: ..." or
 * "Malformed store declaration at line 5: ...".
 * Exported for tests.
 */
export function kmnErrorPosition(
  message: string,
): { line: number; column: number } | null {
  const m = /line (\d+)(?::(\d+))?/.exec(message);
  if (!m?.[1]) return null;
  return {
    line: Number.parseInt(m[1], 10),
    column: m[2] !== undefined ? Number.parseInt(m[2], 10) : 1,
  };
}

/**
 * Lint .kmn source text for the Code tab.
 *
 * @param text The .kmn source.
 * @param parse A parse function (injectable for tests; defaults to the
 *   engine's parseKmn). Must throw on syntax errors.
 * @param opts Keyboard id and the baseline raw-Ctrl rule set (issue #2359).
 *
 * Never throws: every failure mode is a marker.
 */
export function lintKmnCodeText(
  text: string,
  parse: (text: string) => unknown,
  opts: KmnCodeLintOptions = {},
): KmnCodeLintResult {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const pos = kmnErrorPosition(message);
    if (pos) {
      return {
        parsed: false,
        markers: [
          {
            code: "KMN_SYNTAX",
            severity: "error",
            message,
            startLineNumber: pos.line,
            startColumn: pos.column,
            endLineNumber: pos.line,
            endColumn: pos.column + 1,
          },
        ],
      };
    }
    // No position: file-level marker on line 1.
    const firstLineLength = text.split("\n", 1)[0]?.length ?? 0;
    return {
      parsed: false,
      markers: [
        {
          code: "KMN_SYNTAX",
          severity: "error",
          message,
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: Math.max(2, firstLineLength + 1),
        },
      ],
    };
  }
  const ir = parsedIr(parsed);
  if (ir === null) return { parsed: true, markers: [] };
  // Raw Ctrl (issue #2359): new rules block Apply; grandfathered ones warn.
  const baseline = opts.baselineRawCtrl ?? new Set<string>();
  const markers = findRawCtrlRules(ir, opts.keyboardId ?? "keyboard").map((rule) =>
    fileMarker(
      text,
      "KM_LINT_RAW_CTRL",
      baseline.has(rawCtrlRuleKey(rule)) ? "warning" : "error",
      baseline.has(rawCtrlRuleKey(rule))
        ? `[KM_LINT_RAW_CTRL] [${rule.plane} ${rule.key}] types ${describeRawCtrlOutputs(rule)} on Ctrl without Alt. Already in this keyboard, so it does not block Apply.`
        : `[KM_LINT_RAW_CTRL] [${rule.plane} ${rule.key}] types ${describeRawCtrlOutputs(rule)} on Ctrl without Alt. Move it off Ctrl, onto a Shift or Alt-based layer — the keyboard may not be accepted if it stays.`,
    ),
  );
  return {
    parsed: !markers.some((m) => m.severity === "error"),
    markers,
  };
}
