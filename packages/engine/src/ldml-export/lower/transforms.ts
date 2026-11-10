// Renders KMN rules as LDML transforms within Keyman 19's subset (research R3; task T033).
//
// `from` and `to` use literals (NFD, escaped by side), `$[set]` variables, markers `\m{id}`,
// capture groups, and the single `$[1:set]` mapping. Marks, controls, format characters,
// non-space whitespace and the supplementary planes are written as `\u{...}`.

import { elementAtOffset } from "@keyboard-studio/contracts";
import type { ContextElement, IRStore, KeyboardIR, OutputElement } from "@keyboard-studio/contracts";
import { findStore, isGuardElement, MAX_TRANSFORMS_PER_RULE, dkKey, type RulePlan } from "../classify/ruleElements.js";
import type { LdmlTransform } from "../xml/model.js";

export { MAX_TRANSFORMS_PER_RULE };

const NEEDS_U_ESCAPE = /[\p{M}\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}\p{Co}\p{Cs}\p{Cn}]/u;
const FROM_META = new Set(["\\", "[", "]", "(", ")", "{", "}", ".", "*", "+", "?", "|", "^", "$"]);

function uEscape(ch: string): string {
  return `\\u{${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`;
}

/** True for a character written as `\u{...}` in every position. */
function mustEscape(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (ch === " ") return false;
  return cp > 0xffff || NEEDS_U_ESCAPE.test(ch);
}

/** A literal in `from`: NFD, regex metacharacters backslash-escaped, specials as `\u{...}`. */
export function escapeFrom(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFD")) {
    if (mustEscape(ch)) out += uEscape(ch);
    else if (FROM_META.has(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

/** A literal in `to`: NFD; only `\\`, `\$` are escapes; specials as `\u{...}`. */
export function escapeTo(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFD")) {
    if (mustEscape(ch)) out += uEscape(ch);
    else if (ch === "\\") out += "\\\\";
    else if (ch === "$") out += "\\$";
    else out += ch;
  }
  return out;
}

/** A literal in a key `output`, a set item or a string value: NFD; `\` and space as `\u{...}` when asked. */
export function escapeOutput(text: string, inSet = false): string {
  let out = "";
  for (const ch of text.normalize("NFD")) {
    if (mustEscape(ch) || ch === "\\" || (inSet && (ch === " " || ch === "$"))) out += uEscape(ch);
    else out += ch;
  }
  return out;
}

export function marker(id: string): string {
  return `\\m{${id}}`;
}

/** A class item inside `[^...]`: letters and digits as is, everything else `\u{...}`. */
function classItem(ch: string): string {
  return /^[A-Za-z0-9]$/.test(ch) ? ch : uEscape(ch);
}

export interface RenderEnv {
  ir: KeyboardIR;
  /** The resolved marker id for a source key (`dkKey` or a trigger source). */
  markerId(source: string): string;
  /** Register a store as a `<set>` variable and return its id. */
  setVar(storeName: string): string;
  /** `source/<id>.kmn`, for the line comments. */
  sourceName: string;
}

export interface TriggerText {
  /** The trigger as written in `from` (already escaped, or a marker). */
  from: string;
}

export interface RenderedTransform {
  kind: "simple" | "backspace";
  transform: LdmlTransform;
}

function itemText(store: IRStore | undefined, index: number): string {
  const it = store?.items[index];
  return it?.kind === "char" ? it.value : "";
}

function cartesian(sizes: readonly number[]): number[][] {
  let acc: number[][] = [[]];
  for (const n of sizes) {
    const next: number[][] = [];
    for (const a of acc) for (let i = 0; i < n; i++) next.push([...a, i]);
    acc = next;
  }
  return acc;
}

/**
 * Render one rule (for one key, when it has a keystroke) as zero or more transforms.
 * `trigger` is the key's trigger text; null for a context-only or backspace rule.
 * `itemIndex` selects the store item for `any()` in keystroke position.
 */
export function renderRule(
  env: RenderEnv,
  plan: RulePlan,
  trigger: TriggerText | null,
  itemIndex: number | null,
): RenderedTransform[] {
  const { ir } = env;
  const rule = plan.rule;
  const full: ContextElement[] = plan.keyElement ? [...plan.pre, plan.keyElement] : [...plan.pre];
  const keyOffset = plan.keyElement ? full.length : -1; // 1-based offset of the keystroke, or -1
  const out = rule.output;

  const emptyTo = plan.suppress !== null;
  const ctxOffsets = new Set<number>();
  let bare = false;
  for (const o of out) {
    if (o.kind === "context") {
      if (o.offset === 0) bare = true;
      else ctxOffsets.add(o.offset);
    }
  }

  // Elements that expand (cartesian): the `any` elements index() points at, unless one set mapping.
  const indexOffsets: number[] = [];
  if (!plan.setMapping) {
    for (const o of out) {
      if (o.kind === "index" && o.offset !== keyOffset && !indexOffsets.includes(o.offset)) indexOffsets.push(o.offset);
    }
  }
  const sizes = indexOffsets.map((off) => {
    const el = elementAtOffset(rule, plan.group, off);
    return el?.kind === "any" ? (findStore(ir, el.storeRef)?.items.length ?? 1) : 1;
  });
  const combos = cartesian(sizes);
  if (combos.length * 1 > MAX_TRANSFORMS_PER_RULE) return [];

  const result: RenderedTransform[] = [];
  for (const combo of combos) {
    const pick = new Map<number, number>();
    indexOffsets.forEach((off, k) => pick.set(off, combo[k] ?? 0));

    // --- from -------------------------------------------------------------------------------
    const parts = full.map((el, i): string => {
      const off = i + 1;
      if (off === keyOffset) return trigger?.from ?? "";
      if (isGuardElement(el)) return "";
      if (el.kind === "char") return escapeFrom(el.value);
      if (el.kind === "deadkey" || el.kind === "namedDeadkey") return marker(env.markerId(dkKey(el)));
      if (el.kind === "any") {
        const store = findStore(ir, el.storeRef);
        const p = pick.get(off);
        if (p !== undefined) return escapeFrom(itemText(store, p));
        const v = `$[${env.setVar(el.storeRef)}]`;
        return plan.setMapping && out[0]?.kind === "index" && out[0].offset === off ? `(${v})` : v;
      }
      if (el.kind === "notany") {
        const store = findStore(ir, el.storeRef);
        const chars = (store?.items ?? []).flatMap((it) => (it.kind === "char" ? [...it.value.normalize("NFD")] : []));
        return `[^${chars.map(classItem).join("")}]`;
      }
      return "";
    });
    let groups = 0;
    let outerGroup = 0;
    const groupOf = new Map<number, number>();
    let body = "";
    const emit = (i: number): void => {
      const piece = parts[i] ?? "";
      if (piece === "") return;
      if (ctxOffsets.has(i + 1)) {
        groups += 1;
        groupOf.set(i + 1, groups);
        body += `(${piece})`;
      } else body += piece;
    };
    const preCount = keyOffset === -1 ? parts.length : keyOffset - 1;
    if (bare) {
      groups += 1;
      outerGroup = groups;
      body += "(";
      for (let i = 0; i < preCount; i++) emit(i);
      body += ")";
      if (keyOffset !== -1) emit(keyOffset - 1);
    } else {
      for (let i = 0; i < parts.length; i++) emit(i);
    }
    const from = (plan.anchorStart ? "^" : "") + body;
    if (body === "") continue;

    // --- to ---------------------------------------------------------------------------------
    let to = "";
    if (!emptyTo) {
      for (const o of out as OutputElement[]) {
        if (o.kind === "char") to += escapeTo(o.value);
        else if (o.kind === "deadkey" || o.kind === "namedDeadkey") to += marker(env.markerId(dkKey(o)));
        else if (o.kind === "outs") to += escapeTo(findStore(ir, o.storeRef)?.items.map((it) => (it.kind === "char" ? it.value : "")).join("") ?? "");
        else if (o.kind === "context") {
          const n = o.offset === 0 ? outerGroup : groupOf.get(o.offset);
          if (n !== undefined) to += `$${n}`;
        } else if (o.kind === "index") {
          const toStore = findStore(ir, o.storeRef);
          if (plan.setMapping) to += `$[1:${env.setVar(o.storeRef)}]`;
          else if (o.offset === keyOffset) to += escapeTo(itemText(toStore, itemIndex ?? 0));
          else to += escapeTo(itemText(toStore, pick.get(o.offset) ?? 0));
        }
      }
    }
    const t: LdmlTransform = { from, comment: `${env.sourceName}:${rule.sourceLine ?? 0}` };
    if (to !== "") t.to = to;
    result.push({ kind: plan.backspace ? "backspace" : "simple", transform: t });
  }
  return result;
}
