// Check 11.8 — KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED
// Criteria (criteria.json "11.8-php-osk-image-constrained"): "OSK
// graphics either use Keyman-generated form or custom images have
// width constraints."
//
// The Keyman-generated form is the data-states OSK placeholder markup
// (empty <div data-states='...'> elements the Keyman site fills at
// render) — it contains no <img> tags at all, so a help page with no
// custom images has nothing to constrain. Every <img> in the help page
// is therefore custom, and each must carry a width constraint from one
// of three places:
//   - a `width` attribute on the tag,
//   - a `width:` / `max-width:` declaration in its inline `style`,
//   - a CSS rule in the package's bundled stylesheets whose selector
//     matches the image (its class, its element name `img`, or `*`)
//     and that sets `width` or `max-width`.
// A `height` attribute alone is NOT a width constraint — the
// criterion's words — so height-only images are reported.

import type { DocLintInput } from "@keyboard-studio/contracts";
import { docMemberPath } from "./_shared.js";
import { checkFailed, checkPassed, type CheckResult } from "../criteria/_shared.js";

interface ImgTag {
  raw: string;
  src: string;
  classes: string[];
  hasWidthAttr: boolean;
  styleHasWidth: boolean;
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const WIDTH_DECL_RE = /(?:^|;)\s*(?:max-)?width\s*:/i;

function parseImgTags(text: string): ImgTag[] {
  const tags: ImgTag[] = [];
  for (const m of text.matchAll(IMG_TAG_RE)) {
    const raw = m[0];
    const attrs = new Map<string, string>();
    for (const a of raw.matchAll(ATTR_RE)) {
      attrs.set(a[1]!.toLowerCase(), a[2] ?? a[3] ?? "");
    }
    const style = attrs.get("style") ?? "";
    tags.push({
      raw,
      src: attrs.get("src") ?? "",
      classes: (attrs.get("class") ?? "").split(/\s+/).filter(Boolean),
      hasWidthAttr: attrs.has("width"),
      styleHasWidth: WIDTH_DECL_RE.test(style),
    });
  }
  return tags;
}

/**
 * True when a stylesheet text constrains images matching `classes`:
 * any rule whose selector list includes `img`, `*`, or one of the
 * classes, and whose declarations set width / max-width.
 */
function cssConstrains(cssTexts: readonly string[], classes: string[]): boolean {
  for (const css of cssTexts) {
    // Strip comments so commented-out widths do not count.
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = (rule[1] ?? "").split(",").map((s) => s.trim());
      const declarations = rule[2] ?? "";
      if (!WIDTH_DECL_RE.test(declarations)) continue;
      const matches = selectors.some(
        (sel) =>
          sel === "img" ||
          sel === "*" ||
          classes.some((c) => sel === `.${c}` || sel.endsWith(`.${c}`) || sel.includes(`.${c} `) || sel.includes(`.${c}:`)),
      );
      if (matches) return true;
    }
  }
  return false;
}

/**
 * Check that every custom image in the help page carries a width
 * constraint (tag, inline style, or bundled CSS class rule).
 *
 * @param input - Documentation check input (uses `members["help-php"]`
 *   and the optional `cssTexts`).
 */
export function checkOskImageConstrained(input: DocLintInput): CheckResult {
  const code = "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED";
  const text = input.members["help-php"];
  if (text === undefined) return checkPassed(code, ["No help.php to check."]);

  const tags = parseImgTags(text);
  if (tags.length === 0)
    return checkPassed(code, [
      "File: " + docMemberPath("help-php", input.keyboardId),
      "No custom images — nothing to constrain.",
    ]);

  const cssTexts = input.cssTexts ?? [];
  const unconstrained = tags.filter(
    (t) =>
      !t.hasWidthAttr &&
      !t.styleHasWidth &&
      !cssConstrains(cssTexts, t.classes),
  );
  const path = docMemberPath("help-php", input.keyboardId);
  if (unconstrained.length === 0)
    return checkPassed(code, [
      "File: " + path,
      `All ${tags.length} image${tags.length === 1 ? "" : "s"} width-constrained.`,
    ]);

  const named = unconstrained
    .map((t) => (t.src !== "" ? `"${t.src}"` : "an image with no src"))
    .join(", ");
  return checkFailed(code, [
    {
      code: "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED",
      severity: "warning",
      layer: "C",
      message: `${path} uses custom image(s) with no width constraint: ${named}.`,
      location: { file: path, line: 0 },
      hint: "Give each custom image a width (a width attribute, an inline style, or a CSS class rule in the bundled stylesheet) so it cannot overflow the help page.",
    },
  ]);
}
