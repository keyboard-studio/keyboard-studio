// kmnCodeLint — the Mechanical Gallery's Code tab lint pipeline.
//
// Pure module: .kmn source text in, marker data out. No monaco imports, so
// this is unit-testable without a browser worker.
//
// Pipeline:
//   text ─parseKmn (engine; throws Error with `line:col`)─► markers
//
// parseKmn throws on hard syntax errors with messages like
// "Malformed rule at line 12:3: ...". The line/col is extracted for
// positioned markers; messages without a position become file-level markers.

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
  /** False when the text does not parse. */
  readonly parsed: boolean;
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
 *
 * Never throws: every failure mode is a marker.
 */
export function lintKmnCodeText(
  text: string,
  parse: (text: string) => unknown,
): KmnCodeLintResult {
  try {
    parse(text);
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
  return { parsed: true, markers: [] };
}
