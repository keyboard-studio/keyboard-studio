// docImageWidthFix -- the image-width fix for the help/welcome pages' `kb.css`
// (documentation criterion 11.8), shared by the Copy output, the findings check,
// the proposal row and the Open apply so they cannot drift apart.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { readVfsText } from "./vfsText.ts";

/** The pages' stylesheet paths the fix applies to. */
export const KB_CSS = /^source\/(?:help|welcome)\/kb\.css$/i;

/** A stylesheet that already constrains image width. */
export const IMG_RULE = /\bimg\s*\{[^}]*\bmax-width\s*:/i;

/** The rule the fix adds. */
export const IMG_RULE_TEXT = "img { max-width: 100%; }";

/** `css` with the width rule appended, or null when it already carries one. */
export function withImageWidthRule(css: string): string | null {
  if (IMG_RULE.test(css)) return null;
  return `${css.replace(/\s+$/, "")}\n${IMG_RULE_TEXT}\n`;
}

/** True when a pages' `kb.css` in `vfs` carries the width rule (the fix is in the files). */
export function imageWidthRuleInFiles(vfs: VirtualFS): boolean {
  return vfs.list("source/").some((p) => KB_CSS.test(p) && IMG_RULE.test(readVfsText(vfs, p) ?? ""));
}
