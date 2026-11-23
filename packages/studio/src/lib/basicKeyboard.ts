// basicKeyboard: the keyboards whose physical layout must never change.
//
// The basic keyboards (release/basic/, ids basic_kbd*) mirror the Windows
// layouts key for key, and the studio treats those layouts as ground truth for
// what each physical key types. Updating one of them in Open may upgrade its
// touch layout, documentation and project structure, but no suggestion may edit
// its physical keys. This is the one place that says which keyboards those are.
//
// Touch behaviour stays open: a rule on a T_ or U_ touch key, or one gated behind
// platform('touch'), never fires for a physical key, so a code edit that only
// changes such rules (plus comments, header fields and stores only they use) is
// allowed. Anything else could change what a physical key types.
// Pure: no store reads, no timers.

import { classifyRawElement, ruleConditions, ruleContextElements } from "@keyboard-studio/contracts";
import type { IRChange, IRNode, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
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

/**
 * The Open menu tools a basic keyboard opened for update does not offer, because everything they
 * write fires on the physical keys: the remove tool, the convenience-letters question that only
 * feeds it, the marks series (mark guards and output form act after any keystroke) and the
 * deadkeys step (its triggers are physical keys). Punctuation and invisible characters stay: they
 * only add to the letters to place, which on a basic keyboard go on the touch layout. Rules stays,
 * view-only (survey/rules/RulesStep.tsx).
 */
export const BASIC_KEYBOARD_SKIPPED_TOOLS: ReadonlySet<string> = new Set(["carve", "convenience", "marks", "deadkeys"]);

/** True when accepting `fix` would edit physical keys (routes to the mechanisms gallery). */
export function editsPhysicalKeys(fix: SuggestedFix): boolean {
  const target = fix.action?.target;
  return target === "physical" || target === "mechanisms";
}

/** `fixes` without those that edit physical keys, when `suppress` (a basic keyboard opened for update). */
export function withoutPhysicalFixes(fixes: readonly SuggestedFix[], suppress: boolean): SuggestedFix[] {
  return suppress ? fixes.filter((f) => !editsPhysicalKeys(f)) : [...fixes];
}

function isRule(node: IRNode): node is IRRule {
  return "context" in node;
}

/** True for a rule that only ever fires on touch: a T_ or U_ key, or a platform('touch') gate. */
export function isTouchOnlyRule(rule: IRRule): boolean {
  const touchGate = ruleConditions(rule).some(
    (el) =>
      (el.kind === "platform" && el.value.toLowerCase() === "touch") ||
      (el.kind === "raw" && isTouchPlatformCall(el.text)) ||
      (el.kind === "if" && el.store.toLowerCase() === "&platform" && el.value.toLowerCase() === "touch"),
  );
  return touchGate || ruleContextElements(rule).some((el) => el.kind === "vkey" && /^[TU]_/i.test(el.name));
}

function isTouchPlatformCall(text: string): boolean {
  const call = classifyRawElement(text);
  return call.kind === "platform" && call.value.toLowerCase() === "touch";
}

/** Whether `node` leaves the physical keys alone: a comment, or a touch-only rule. An opaque fragment cannot be read, so it does not. */
function touchSafeNode(node: IRNode): boolean {
  if (isRule(node)) return isTouchOnlyRule(node);
  return !("sourceText" in node);
}

/**
 * System stores that change how the physical keys behave (caps handling, mnemonic layout). Every
 * other system store is metadata (version, copyright, bitmap, layout file, ...) and safe to edit.
 */
const BEHAVIOURAL_SYSTEM_STORES = new Set(["casedkeys", "mnemoniclayout", "capsalwaysoff", "capsononly", "shiftfreescaps"]);

/** Whether a change to the store `name` leaves the physical keys alone. */
function touchSafeStore(after: KeyboardIR, name: string, isSystem: boolean): boolean {
  return isSystem ? !BEHAVIOURAL_SYSTEM_STORES.has(name.toLowerCase()) : usedOnlyByTouch(after, name);
}

/** Every store name a rule reads or writes (`any`, `index`, `outs`, `if`, ...), lower-cased. */
function storesUsedBy(rule: IRRule): Set<string> {
  const names = new Set<string>();
  for (const el of [...ruleContextElements(rule), ...rule.output] as ReadonlyArray<Record<string, unknown>>) {
    if (typeof el["storeRef"] === "string") names.add((el["storeRef"] as string).toLowerCase());
    if (el["kind"] === "if" && typeof el["store"] === "string") names.add((el["store"] as string).toLowerCase());
  }
  return names;
}

/** Whether every rule of `ir` that uses the store `name` is touch-only. */
function usedOnlyByTouch(ir: KeyboardIR, name: string): boolean {
  const key = name.toLowerCase();
  return ir.groups.every((g) => g.rules.every((r) => !isRule(r) || !storesUsedBy(r).has(key) || isTouchOnlyRule(r)));
}

/**
 * The indices of `changes` (a code edit's structural diff, `after` the edited keyboard) that could
 * change what a physical key types. Allowed: touch-only rules and comments, header fields, a new
 * group (its rules arrive as their own changes), a removed group whose rules are all touch-only,
 * a store that only touch-only rules use, and a metadata system store. Everything else, including
 * the `begin` statement and the caps and mnemonic system stores, counts as physical.
 */
export function physicalCodeChanges(changes: readonly IRChange[], after: KeyboardIR): number[] {
  const out: number[] = [];
  changes.forEach((c, index) => {
    let safe: boolean;
    switch (c.change) {
      case "insert":
        safe = touchSafeNode(c.node);
        break;
      case "remove":
        safe = touchSafeNode(c.old);
        break;
      case "replace":
        safe = touchSafeNode(c.old) && touchSafeNode(c.node);
        break;
      case "set-store":
        safe = touchSafeStore(after, c.name, c.value.isSystem);
        break;
      case "remove-store":
        safe = touchSafeStore(after, c.name, c.previous.isSystem);
        break;
      case "add-group":
      case "set-header":
        safe = true;
        break;
      case "remove-group":
        safe = c.previous.rules.every(touchSafeNode);
        break;
      case "set-begin":
        safe = false;
        break;
    }
    if (!safe) out.push(index);
  });
  return out;
}
