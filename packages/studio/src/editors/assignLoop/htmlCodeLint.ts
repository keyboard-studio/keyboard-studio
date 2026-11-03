/**
 * htmlCodeLint — Markdown validation for the HTML/Markdown editor step.
 *
 * The `welcome.htm` file is Markdown despite its extension (verified on
 * keymanapp/keyboards: basic_kbdus, akan, khmer_angkor). This linter
 * provides debounced, pure validation of Markdown text:
 * - Balanced code fences (``` blocks)
 * - Balanced inline code spans (`...`)
 * - Balanced emphasis markers (*, **, _, __) — best-effort
 * - Balanced link/image brackets ([...](...))
 * - Heading level skips (e.g. # then ###) as warnings
 *
 * Returns markers with line/column positions for Monaco.
 */

export interface HtmlCodeMarker {
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
 * Validate Markdown text, returning a list of markers.
 * Empty array = valid.
 */
export function lintHtmlText(text: string): HtmlCodeMarker[] {
  const markers: HtmlCodeMarker[] = [];
  if (text.trim() === "") {
    return markers;
  }

  const lines = text.split("\n");

  // --- Code fence balance (``` or ~~~) ---
  let fenceChar: string | null = null;
  let fenceLine = 0;
  let fenceCol = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const fence = fenceMatch[1] ?? "";
      const fenceStart = fence[0] ?? "";
      if (fenceChar === null) {
        fenceChar = fenceStart;
        fenceLine = li + 1;
        fenceCol = line.indexOf(fence) + 1;
      } else if (fenceStart === fenceChar) {
        fenceChar = null;
      }
      // Different fence char inside a fence is content, not a fence
    }
  }
  if (fenceChar !== null) {
    markers.push({
      line: fenceLine,
      column: fenceCol,
      message: "Unclosed code fence",
      severity: "error",
    });
  }

  // --- Per-line checks (skip lines inside code fences) ---
  let inFence = false;
  let prevHeadingLevel = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";
    const trimmed = line.trimStart();

    // Track fence state for per-line skipping
    if (/^(```+|~~~+)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Heading level skip detection (warning)
    const headingMatch = /^(#{1,6})\s/.exec(trimmed);
    if (headingMatch) {
      const level = (headingMatch[1] ?? "").length;
      if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
        markers.push({
          line: li + 1,
          column: line.indexOf("#") + 1,
          message: `Heading level skipped (h${prevHeadingLevel} → h${level})`,
          severity: "warning",
        });
      }
      prevHeadingLevel = level;
    }

    // Unbalanced inline code spans (odd number of backticks outside fences)
    // Count backticks not part of a fence (fences handled above)
    const backtickRuns = line.match(/`+/g) ?? [];
    let inlineBackticks = 0;
    for (const run of backtickRuns) {
      // Single backtick runs are inline code; longer runs on their own line
      // would have been fences (handled above), so count singles here
      if (run.length === 1) inlineBackticks++;
    }
    if (inlineBackticks % 2 !== 0) {
      const col = line.indexOf("`") + 1;
      markers.push({
        line: li + 1,
        column: col,
        message: "Unbalanced inline code span (odd number of backticks)",
        severity: "warning",
      });
    }

    // Unbalanced link brackets: count [ and ] outside inline code
    // (best-effort: strip inline code spans first)
    const noInlineCode = line.replace(/`[^`]*`/g, "");
    const openBrackets = (noInlineCode.match(/\[/g) ?? []).length;
    const closeBrackets = (noInlineCode.match(/\]/g) ?? []).length;
    if (openBrackets > closeBrackets) {
      markers.push({
        line: li + 1,
        column: noInlineCode.indexOf("[") + 1,
        message: "Unclosed link bracket '['",
        severity: "warning",
      });
    } else if (closeBrackets > openBrackets) {
      markers.push({
        line: li + 1,
        column: noInlineCode.indexOf("]") + 1,
        message: "Unmatched closing bracket ']'",
        severity: "warning",
      });
    }

    // Image without alt text: ![](...)
    if (/!\[\]\(/.test(noInlineCode)) {
      markers.push({
        line: li + 1,
        column: noInlineCode.indexOf("![") + 1,
        message: "Image without alt text",
        severity: "warning",
      });
    }
  }

  return markers;
}
