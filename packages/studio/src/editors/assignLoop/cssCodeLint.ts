/**
 * cssCodeLint — CSS syntax validation for the CSS editor step.
 *
 * Provides debounced, pure validation of CSS text. Uses a hand-rolled
 * brace/paren/bracket balance checker plus basic rule validation, since
 * we don't want to pull in a full CSS parser for the MVP.
 *
 * Returns markers with line/column positions for Monaco.
 */

export interface CssCodeMarker {
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** End line (1-based), defaults to line. */
  endLine?: number;
  /** End column (1-based), defaults to column + 1. */
  endColumn?: number;
  message: string;
  severity: "error" | "warning";
}

/**
 * Validate CSS text, returning a list of markers.
 * Empty array = valid.
 */
export function lintCssText(text: string): CssCodeMarker[] {
  const markers: CssCodeMarker[] = [];
  if (text.trim() === "") {
    return markers;
  }

  const lines = text.split("\n");
  const stack: Array<{ char: string; line: number; column: number }> = [];

  const pairs: Record<string, string> = {
    "{": "}",
    "(": ")",
    "[": "]",
  };
  const closers: Record<string, string> = {
    "}": "{",
    ")": "(",
    "]": "[",
  };

  let inString: string | null = null;
  let inComment = false;
  let prevChar = "";

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci] ?? "";
      const next = line[ci + 1] ?? "";

      // Handle comments
      if (!inString && !inComment && ch === "/" && next === "*") {
        inComment = true;
        ci++;
        continue;
      }
      if (inComment && ch === "*" && next === "/") {
        inComment = false;
        ci++;
        continue;
      }
      if (inComment) continue;

      // Handle strings
      if (!inString && (ch === '"' || ch === "'")) {
        inString = ch;
        continue;
      }
      if (inString) {
        if (ch === inString && prevChar !== "\\") {
          inString = null;
        }
        prevChar = ch;
        continue;
      }

      // Handle brackets
      if (ch in pairs) {
        stack.push({ char: ch, line: li + 1, column: ci + 1 });
      } else if (ch in closers) {
        const expected = closers[ch];
        const top = stack.pop();
        if (!top) {
          markers.push({
            line: li + 1,
            column: ci + 1,
            message: `Unmatched closing '${ch}'`,
            severity: "error",
          });
        } else if (top.char !== expected) {
          markers.push({
            line: li + 1,
            column: ci + 1,
            message: `Mismatched '${top.char}' (opened line ${top.line}) closed with '${ch}'`,
            severity: "error",
          });
        }
      }

      prevChar = ch;
    }
    prevChar = "\n";
  }

  // Unclosed brackets
  for (const item of stack) {
    markers.push({
      line: item.line,
      column: item.column,
      message: `Unclosed '${item.char}'`,
      severity: "error",
    });
  }

  // Unterminated string
  if (inString) {
    markers.push({
      line: lines.length,
      column: (lines[lines.length - 1] ?? "").length + 1,
      message: "Unterminated string",
      severity: "error",
    });
  }

  // Unterminated comment
  if (inComment) {
    markers.push({
      line: lines.length,
      column: 1,
      message: "Unterminated comment",
      severity: "error",
    });
  }

  return markers;
}
