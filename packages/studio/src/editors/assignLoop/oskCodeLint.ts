// oskCodeLint — the OSK editor's Code tab lint pipeline.
//
// Pure module: .kvks XML text in, marker data out. No monaco imports, so
// this is unit-testable without a browser worker.
//
// Pipeline:
//   text ─well-formedness check─► syntax marker (unbalanced tag / bad nesting)
//        ─parseKvks (engine; regex-based, never throws)─► KvksIR
//
// parseKvks is regex-based and lenient — it returns partial data rather
// than throwing — so the well-formedness check is the real syntax gate.
// Findings surface as file-level or positioned markers.

/** Marker severity the pane maps onto monaco's MarkerSeverity. */
export type OskCodeMarkerSeverity = "error" | "warning" | "info" | "hint";

/** Monaco marker data, minus the monaco import. */
export interface OskCodeMarker {
  readonly code: string;
  readonly severity: OskCodeMarkerSeverity;
  readonly message: string;
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

export interface OskCodeLintResult {
  /** The markers to surface. */
  readonly markers: readonly OskCodeMarker[];
  /** False when the text is not well-formed XML. */
  readonly parsed: boolean;
}

/**
 * Minimal XML well-formedness check: balanced tags, proper nesting,
 * quoted attributes. Returns the 1-based line/column of the first problem,
 * or null if the text looks well-formed.
 *
 * This is intentionally simple — it catches unbalanced tags, mismatched
 * nesting, and unterminated constructs, which covers the vast majority of
 * hand-editing errors. It is not a full XML parser.
 */
export function findXmlError(
  text: string,
): { line: number; column: number; message: string } | null {
  const stack: Array<{ name: string; line: number; column: number }> = [];
  // Matches: comments, CDATA, PIs, doctype, closing tags, self-closing and
  // open tags (with attributes).
  const tagRe =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([A-Za-z_][\w:.-]*)\s*>|<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;

  // Track line/column.
  let line = 1;
  let lineStart = 0;
  const advanceTo = (pos: number) => {
    for (let i = lineStart; i < pos; i++) {
      if (text[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
    }
  };

  let m: RegExpExecArray | null;
  let lastIndex = 0;
  while ((m = tagRe.exec(text)) !== null) {
    // Check for stray '<' in skipped text (e.g. unescaped < in content).
    const skipped = text.slice(lastIndex, m.index);
    const stray = skipped.indexOf("<");
    if (stray !== -1) {
      advanceTo(lastIndex + stray);
      return {
        line,
        column: lastIndex + stray - lineStart + 1,
        message: "Stray '<' — escape it as &lt; in text content.",
      };
    }
    lastIndex = tagRe.lastIndex;
    advanceTo(m.index);
    const col = m.index - lineStart + 1;

    const full = m[0];
    // Comments, CDATA, PIs, doctype: skipped by the regex, nothing to do.
    if (full.startsWith("<!--") || full.startsWith("<![CDATA[") || full.startsWith("<?") || full.startsWith("<!DOCTYPE")) {
      continue;
    }
    if (m[1] !== undefined) {
      // Closing tag.
      const name = m[1];
      const open = stack.pop();
      if (!open) {
        return { line, column: col, message: `Closing tag </${name}> without a matching open tag.` };
      }
      if (open.name !== name) {
        return {
          line,
          column: col,
          message: `Mismatched tag: expected </${open.name}> (opened at line ${open.line}), found </${name}>.`,
        };
      }
      continue;
    }
    // Open or self-closing tag.
    const name = m[2];
    const selfClosing = m[4] === "/";
    // Check for unquoted attribute values (common hand-editing error).
    const attrText = m[3] ?? "";
    if (/=\s*[^"'\s>][^\s>]*\s*(?:[\s>]|$)/.test(attrText + " ")) {
      return { line, column: col, message: `Unquoted attribute value in <${name}> — quote attribute values.` };
    }
    if (name && !selfClosing) {
      stack.push({ name, line, column: col });
    }
  }

  // Trailing stray '<'.
  const tail = text.slice(lastIndex);
  const strayTail = tail.indexOf("<");
  if (strayTail !== -1) {
    advanceTo(lastIndex + strayTail);
    return {
      line,
      column: lastIndex + strayTail - lineStart + 1,
      message: "Stray '<' — escape it as &lt; in text content.",
    };
  }

  if (stack.length > 0) {
    const open = stack[stack.length - 1]!;
    return {
      line: open.line,
      column: open.column,
      message: `Unclosed tag <${open.name}> (opened at line ${open.line}).`,
    };
  }
  return null;
}

/**
 * Lint .kvks XML text for the Code tab.
 *
 * Never throws: every failure mode is a marker.
 */
export function lintOskCodeText(text: string): OskCodeLintResult {
  const xmlError = findXmlError(text);
  if (xmlError !== null) {
    return {
      parsed: false,
      markers: [
        {
          code: "XML_SYNTAX",
          severity: "error",
          message: `Invalid XML: ${xmlError.message}`,
          startLineNumber: xmlError.line,
          startColumn: xmlError.column,
          endLineNumber: xmlError.line,
          endColumn: xmlError.column + 1,
        },
      ],
    };
  }
  return { parsed: true, markers: [] };
}
