// basicKeyboard: the keyboards whose physical layout must never change.
//
// The basic keyboards (release/basic/, ids basic_kbd*) mirror the Windows
// layouts key for key, and the studio treats those layouts as ground truth for
// what each physical key types. Updating one of them in Open may upgrade its
// touch layout, documentation and project structure, but no suggestion may edit
// its physical keys. This is the one place that says which keyboards those are.
// Pure: no store reads, no timers.

import type { SuggestedFix } from "./consistencySuggestions.ts";

/** The minimum of a start keyboard this module reads. */
export interface KeyboardRef {
  id: string;
  path?: string;
}

/** True for a basic keyboard: id starts with `basic_kbd`, or its source is under `release/basic/`. */
export function isBasicKeyboard(keyboard: KeyboardRef | null | undefined): boolean {
  if (keyboard === null || keyboard === undefined) return false;
  if (keyboard.id.startsWith("basic_kbd")) return true;
  return keyboard.path?.replace(/\\/g, "/").split("/").slice(0, 2).join("/") === "release/basic";
}

/** True when accepting `fix` would edit physical keys (routes to the mechanisms gallery). */
export function editsPhysicalKeys(fix: SuggestedFix): boolean {
  const target = fix.action?.target;
  return target === "physical" || target === "mechanisms";
}

/** `fixes` without those that edit physical keys, when `suppress` (a basic keyboard opened for update). */
export function withoutPhysicalFixes(fixes: readonly SuggestedFix[], suppress: boolean): SuggestedFix[] {
  return suppress ? fixes.filter((f) => !editsPhysicalKeys(f)) : [...fixes];
}
