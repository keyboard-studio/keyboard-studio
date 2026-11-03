/**
 * htmlCodeLint — HTML validation for the HTML editor step.
 *
 * The `welcome.htm` file is HTML (verified on keymanapp/keyboards:
 * akan, basic_kbdus, khmer_angkor — all start with `<!DOCTYPE html>`).
 * This linter provides debounced, pure validation of HTML text:
 * - Unclosed tags (error) — tag-stack based
 * - Mismatched / unexpected closing tags (error)
 * - Missing `<!DOCTYPE html>` (warning)
 * - Missing `<html>`, `<head>`, `<body>` structure (warning)
 *
 * Comments (`<!-- ... -->`) are skipped; void elements
 * (br, img, meta, …) and self-closing tags never open the stack.
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

/** Elements that never have a closing tag. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

interface OpenTag {
  name: string;
  line: number;
  column: number;
}

/**
 * Validate HTML text, returning a list of markers.
 * Empty array = valid.
 */
export function lintHtmlText(text: string): HtmlCodeMarker[] {
  const markers: HtmlCodeMarker[] = [];
  if (text.trim() === "") {
    return markers;
  }

  // Precompute line-start offsets for offset → line/column mapping.
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  const toLineCol = (offset: number): [number, number] => {
    let line = 0;
    while (line + 1 < lineStarts.length && (lineStarts[line + 1] ?? 0) <= offset) {
      line++;
    }
    return [line + 1, offset - (lineStarts[line] ?? 0) + 1];
  };

  const stack: OpenTag[] = [];
  const seenTags = new Set<string>();
  let hasDoctype = false;

  // Tokens: comments, doctype, open/close/self-closing tags.
  // Attributes may not contain unquoted < or > (best-effort).
  // Note the `i` flag: tag names and the doctype keyword are case-insensitive.
  const tokenRe =
    /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*?)?\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    const token = m[0];
    const [line, column] = toLineCol(m.index);

    // Comments carry no structure.
    if (token.startsWith("<!--")) continue;

    // Doctype declaration.
    if (/^<!DOCTYPE/i.test(token)) {
      hasDoctype = true;
      continue;
    }

    const isClose = token.startsWith("</");
    const nameMatch = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(token);
    if (!nameMatch) continue;
    const name = (nameMatch[1] ?? "").toLowerCase();
    seenTags.add(name);
    const selfClosing = token.endsWith("/>") || VOID_ELEMENTS.has(name);

    if (isClose) {
      // Find the matching open tag, innermost first.
      let idx = stack.length - 1;
      while (idx >= 0 && stack[idx]?.name !== name) idx--;
      if (idx < 0) {
        markers.push({
          line,
          column,
          message: `Unexpected closing tag </${name}> with no matching open tag`,
          severity: "error",
        });
      } else {
        // Tags left open above the match are unclosed.
        for (let j = stack.length - 1; j > idx; j--) {
          const unclosed = stack.pop();
          if (unclosed) {
            markers.push({
              line: unclosed.line,
              column: unclosed.column,
              message: `Unclosed tag <${unclosed.name}>`,
              severity: "error",
            });
          }
        }
        stack.pop(); // the matched open tag
      }
    } else if (!selfClosing) {
      stack.push({ name, line, column });
    }
  }

  // Anything still on the stack never closed.
  for (const open of stack) {
    markers.push({
      line: open.line,
      column: open.column,
      message: `Unclosed tag <${open.name}>`,
      severity: "error",
    });
  }

  // Document-structure warnings.
  if (!hasDoctype) {
    markers.push({
      line: 1,
      column: 1,
      message: "Missing <!DOCTYPE html> declaration",
      severity: "warning",
    });
  }
  for (const required of ["html", "head", "body"]) {
    if (!seenTags.has(required)) {
      markers.push({
        line: 1,
        column: 1,
        message: `Missing <${required}> element`,
        severity: "warning",
      });
    }
  }

  return markers;
}
