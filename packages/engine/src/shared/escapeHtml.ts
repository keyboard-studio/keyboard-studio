// escapeHtml — the single XML/HTML text-escaper for emitted artifacts.
//
// Extracted from `scaffolder/index.ts` (spec 059 T002) when `buildKpsContent`
// moved out into `package-descriptor/`: both the scaffolder's `.htm` / `LICENSE`
// stubs and the package descriptor interpolate author-supplied text, and a
// second copy is how one of them comes to escape a character the other does not.
//
// Escapes the five XML predefined entities. Sufficient for element text and for
// double- or single-quoted attribute values alike, which is what both callers
// need (`<Language ID="...">` is an attribute; `<Name>` is element text).

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Defuse a PHP block-comment terminator ('*'+'/') inside text destined for a
 * `/* ... *\/` PHP comment. Shared by the scaffolder's help.php stub and
 * helpDocsRender's FR-002 fallback so both emit byte-identical placeholder
 * text (spec 061 D-04) from one copy of the escaping rule.
 */
export function phpCommentEscape(s: string): string {
  return s.replace(/\*\//g, "* /");
}
