/**
 * buildOutputRepertoire -- the static set of character clusters a keyboard can
 * produce, derived from its `KeyboardIR` alone (spec 086 research R1).
 *
 * Unlike `buildProducedSet` (frozen; flattens to NFC code points) this keeps the
 * EXACT produced code-point form of every cluster, and closes the set over
 * "postfix" rules that rewrite the tail of the text (a rule whose context
 * consumes a letter or mark and whose output re-emits it plus another mark).
 *
 * The result is deliberately a SUPERSET of what the keyboard really produces:
 * an extra cluster only adds a harmless map, while a missing one could make the
 * normalization step rewrite the keyboard's own output.
 *
 * Pure, browser-safe, no I/O, deterministic.
 */

import type {
  ContextElement,
  IRRule,
  IRStore,
  KeyboardIR,
  OutputElement,
  StoreItem,
  TouchKeyIR,
} from "../keyboard-ir.js";
import type { OutputRepertoire } from "../toleranceReport.js";
import { isPlusSeparator } from "../rule-shape.js";
import { decodeUnicodeKeyId } from "../touch-coverage.js";
import { US_BASE_LAYOUT } from "./usBaseLayout.js";

export interface BuildOutputRepertoireOptions {
  /** Polled during the closure; when it returns true the closure stops early. */
  shouldStop?: () => boolean;
}

/** Part of an instance output: literal text, or the index of a matched text element to echo. */
type OutPart = string | number;

/** One concrete (store-selection-resolved) reading of a rule. */
interface Instance {
  /** Text the rule consumes from the end of the text; `null` matches any one code point. */
  pat: (string | null)[];
  out: OutPart[];
}

const MARK_RE = /^\p{M}/u;
const MAX_SELECTIONS = 5000;
const MAX_ALTERNATIVES = 256;
const MAX_CLUSTERS = 400000;
/**
 * Context-free mark appends (`+ [K_X] > U+0301`) extend only clusters that hold
 * fewer than this many marks. Unbounded stacking of every standalone mark on
 * every base multiplies the repertoire (60 bases x 9 marks x 3 deep is ~43,000
 * clusters on one corpus keyboard) with clusters nobody types; two marks is the
 * reach of a two-key sequence, and patterned rules still extend further (R10).
 */
const APPEND_STACK_CAP = 2;

const isMark = (cp: string): boolean => MARK_RE.test(cp);

function cpCompare(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i] as string).codePointAt(0)! - (y[i] as string).codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** Split text into runs: one non-mark code point plus its trailing marks; leading marks form their own run. */
function runsOf(s: string): string[] {
  const runs: string[] = [];
  let cur = "";
  for (const cp of s) {
    if (cur !== "" && !isMark(cp)) {
      runs.push(cur);
      cur = "";
    }
    cur += cp;
  }
  if (cur !== "") runs.push(cur);
  return runs;
}

function markCount(s: string): number {
  let n = 0;
  for (const cp of s) if (isMark(cp)) n++;
  return n;
}

function lastCp(s: string): string {
  const a = [...s];
  return a[a.length - 1] ?? "";
}

// ---------------------------------------------------------------------------
// Store resolution
// ---------------------------------------------------------------------------

function storeNameOfFragment(sourceText: string): string | undefined {
  return /^\s*store\s*\(\s*([^)\s]+)\s*\)/i.exec(sourceText)?.[1];
}

function buildStoreMap(ir: KeyboardIR): Map<string, StoreItem[]> {
  const m = new Map<string, StoreItem[]>();
  for (const s of ir.stores as IRStore[]) m.set(s.name.toLowerCase(), s.items);
  for (const f of ir.raw) {
    if (f.storeSketch === undefined) continue;
    const name = storeNameOfFragment(f.sourceText);
    if (name !== undefined && !m.has(name.toLowerCase())) m.set(name.toLowerCase(), f.storeSketch);
  }
  return m;
}

const itemText = (it: StoreItem | undefined): string => (it?.kind === "char" ? it.value : "");

// ---------------------------------------------------------------------------
// Rule -> instances
// ---------------------------------------------------------------------------

interface CtxEl {
  el: ContextElement;
  isKey: boolean;
}

function splitContext(rule: IRRule, usingKeys: boolean): CtxEl[] {
  const sep = rule.context.findIndex(isPlusSeparator);
  const out: CtxEl[] = [];
  rule.context.forEach((el, i) => {
    if (i === sep) return;
    const isKey = sep >= 0 ? i > sep : usingKeys;
    out.push({ el, isKey });
  });
  return out;
}

function expandRule(
  ctx: CtxEl[],
  output: readonly OutputElement[],
  stores: Map<string, StoreItem[]>,
  unresolved: Map<string, string>,
): Instance[] {
  // Dimensions: one per resolvable any() element, in order.
  const dims: { pos: number; size: number }[] = [];
  ctx.forEach((c, i) => {
    if (c.el.kind !== "any") return;
    const items = stores.get(c.el.storeRef.toLowerCase());
    if (items !== undefined && items.length > 0) dims.push({ pos: i + 1, size: items.length });
  });
  let total = 1;
  for (const d of dims) total = Math.min(total * d.size, MAX_SELECTIONS + 1);
  const paired = total <= MAX_SELECTIONS;

  const selections: Map<number, number>[] = [];
  if (paired) {
    const idx = dims.map(() => 0);
    for (let n = 0; n < total; n++) {
      selections.push(new Map(dims.map((d, k) => [d.pos, idx[k] as number])));
      for (let k = dims.length - 1; k >= 0; k--) {
        idx[k] = (idx[k] as number) + 1;
        if (idx[k] !== (dims[k] as { size: number }).size) break;
        idx[k] = 0;
      }
    }
  } else {
    selections.push(new Map());
  }

  const instances: Instance[] = [];
  for (const sel of selections) {
    const pat: (string | null)[] = [];
    const textIndexOfPos = new Map<number, number>();
    const textOfPos = new Map<number, string | null>();
    ctx.forEach((c, i) => {
      const pos = i + 1;
      if (c.isKey) return;
      let v: string | null | undefined;
      const el = c.el;
      if (el.kind === "char") v = el.value;
      else if (el.kind === "any") {
        const items = stores.get(el.storeRef.toLowerCase());
        const k = sel.get(pos);
        if (items === undefined) v = null;
        else if (k !== undefined) {
          const it = items[k];
          if (it?.kind === "vkey") v = undefined; // a key store used outside the key region
          else v = it?.kind === "char" ? it.value : null;
        } else {
          v = null; // unpaired: any one character
        }
      } else if (el.kind === "notany") v = null;
      else if (el.kind === "index") {
        const prior = textOfPos.get(el.offset);
        v = prior !== undefined ? prior : null;
      } else v = undefined; // deadkey / vkey / baselayout / raw / context: no text
      if (v === undefined) return;
      textIndexOfPos.set(pos, pat.length);
      textOfPos.set(pos, v);
      pat.push(v);
    });

    // Output parts, each with a list of alternatives (unpaired store expansion).
    const slots: OutPart[][] = [];
    for (const o of output) {
      switch (o.kind) {
        case "char":
          slots.push([o.value]);
          break;
        case "outs": {
          const items = stores.get(o.storeRef.toLowerCase());
          if (items === undefined) unresolved.set(o.storeRef.toLowerCase(), o.storeRef);
          else slots.push([items.map(itemText).join("")]);
          break;
        }
        case "index": {
          const items = stores.get(o.storeRef.toLowerCase());
          if (items === undefined) {
            unresolved.set(o.storeRef.toLowerCase(), o.storeRef);
            break;
          }
          const k = sel.get(o.offset);
          if (k !== undefined) slots.push([itemText(items[k])]);
          else slots.push([...new Set(items.map(itemText))]);
          break;
        }
        case "context": {
          if (o.offset === 0) {
            pat.forEach((p, j) => slots.push([p === null ? j : p]));
          } else {
            const t = textIndexOfPos.get(o.offset);
            if (t !== undefined) slots.push([pat[t] === null ? t : (pat[t] as string)]);
          }
          break;
        }
        default:
          break; // deadkey, beep, nul, useGroup, raw: no text
      }
    }

    const flat = slots;

    // Cartesian over alternatives, capped; overflow falls back to per-slot atoms.
    let combos = 1;
    for (const s of flat) combos = Math.min(combos * Math.max(s.length, 1), MAX_ALTERNATIVES + 1);
    if (combos <= MAX_ALTERNATIVES) {
      let acc: OutPart[][] = [[]];
      for (const s of flat) {
        const next: OutPart[][] = [];
        for (const a of acc) for (const alt of s.length > 0 ? s : [""]) next.push([...a, alt]);
        acc = next;
      }
      for (const out of acc) instances.push({ pat, out });
    } else {
      for (const s of flat) for (const alt of s) instances.push({ pat, out: [alt] });
    }
  }
  return instances;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function touchAtoms(ir: KeyboardIR, add: (s: string) => void): void {
  const walk = (k: TouchKeyIR): void => {
    const d = decodeUnicodeKeyId(k.id);
    if (d !== undefined) add(d);
    if (k.output !== undefined && k.output !== "") add(k.output);
    for (const s of k.sk ?? []) walk(s);
    for (const s of k.multitap ?? []) walk(s);
    if (k.flick !== undefined) {
      for (const dir of Object.keys(k.flick).sort()) {
        const f = (k.flick as Record<string, TouchKeyIR | undefined>)[dir];
        if (f !== undefined) walk(f);
      }
    }
  };
  for (const p of ir.touchLayout?.platforms ?? [])
    for (const l of p.layers) for (const r of l.rows) for (const k of r.keys) walk(k);
}

/** Keys that some unconditional rule always consumes (default layer / shift layer). */
function boundKeys(ir: KeyboardIR, stores: Map<string, StoreItem[]>): Set<string> {
  const bound = new Set<string>();
  const layer = (mods: readonly string[]): string | undefined => {
    const m = mods.map((x) => x.toUpperCase().replace(/^N?CAPS$/, ""));
    const set = m.filter((x) => x !== "");
    if (set.length === 0) return "";
    if (set.length === 1 && set[0] === "SHIFT") return "S+";
    return undefined;
  };
  for (const g of ir.groups) {
    if (!g.usingKeys) continue;
    for (const r of g.rules) {
      if (r.matchKind !== undefined) continue;
      const ctx = splitContext(r, true);
      const keyEls = ctx.filter((c) => c.isKey);
      // A rule with text context can fall through when the context is absent.
      if (ctx.some((c) => !c.isKey && c.el.kind !== "deadkey" && c.el.kind !== "baselayout")) continue;
      for (const { el } of keyEls) {
        if (el.kind === "vkey") {
          const p = layer(el.modifiers);
          if (p !== undefined) bound.add(p + el.name);
        } else if (el.kind === "char") bound.add(`char:${el.value}`);
        else if (el.kind === "any") {
          for (const it of stores.get(el.storeRef.toLowerCase()) ?? []) {
            if (it.kind === "vkey") bound.add(it.name);
            else if (it.kind === "char") bound.add(`char:${it.value}`);
          }
        }
      }
    }
  }
  return bound;
}

export function buildOutputRepertoire(
  ir: KeyboardIR,
  options?: BuildOutputRepertoireOptions,
): OutputRepertoire {
  const stores = buildStoreMap(ir);
  const unresolvedRaw = new Map<string, string>();
  const instances: Instance[] = [];
  const seenInst = new Set<string>();
  const pushInstances = (list: Instance[]): void => {
    for (const i of list) {
      const key = JSON.stringify([i.pat, i.out]);
      if (seenInst.has(key)) continue;
      seenInst.add(key);
      instances.push(i);
    }
  };

  for (const g of ir.groups) {
    for (const r of g.rules) {
      if (r.matchKind !== undefined) continue;
      pushInstances(expandRule(splitContext(r, g.usingKeys), r.output, stores, unresolvedRaw));
    }
  }
  for (const f of ir.raw) {
    if (f.producedOutput !== undefined) pushInstances(expandRule([], f.producedOutput, stores, unresolvedRaw));
  }

  // Seed atoms.
  const clusters = new Set<string>();
  let depth = 1;
  const queue: string[] = [];
  const seed = (text: string): void => {
    for (const run of runsOf(text)) {
      depth = Math.max(depth, markCount(run));
      if (!clusters.has(run)) {
        clusters.add(run);
        queue.push(run);
      }
    }
  };
  for (const i of instances) {
    for (const p of i.pat) if (p !== null) depth = Math.max(depth, markCount(p));
    seed(i.out.filter((p): p is string => typeof p === "string").join(""));
  }
  touchAtoms(ir, seed);
  const bound = boundKeys(ir, stores);
  for (const [k, ch] of US_BASE_LAYOUT) {
    if (ch === " ") continue;
    if (!bound.has(k) && !bound.has(`char:${ch}`)) seed(ch);
  }
  const D = Math.min(depth, 3) as 1 | 2 | 3;

  // Instances that act on existing clusters.
  const appends: string[] = [];
  const byLast = new Map<string, { c: string; out: OutPart[]; pat: (string | null)[] }[]>();
  const wild: Instance[] = [];
  for (const i of instances) {
    const outStr = i.out.every((p) => typeof p === "string") ? (i.out as string[]).join("") : undefined;
    if (i.pat.length === 0) {
      if (outStr !== undefined && outStr !== "" && isMark([...outStr][0] as string)) appends.push(outStr);
      continue;
    }
    if (i.pat.every((p) => p !== null)) {
      const c = (i.pat as string[]).join("");
      if (c === "") continue;
      const key = lastCp(c);
      const list = byLast.get(key) ?? [];
      list.push({ c, out: i.out, pat: i.pat });
      byLast.set(key, list);
    } else wild.push(i);
  }
  appends.sort(cpCompare);

  const resolveOut = (out: OutPart[], matched: string[]): string =>
    out.map((p) => (typeof p === "string" ? p : (matched[p] ?? ""))).join("");

  const apply = (x: string, consumedLen: number, o: string): void => {
    const pre = x.slice(0, x.length - consumedLen);
    const text = pre + o;
    let off = 0;
    for (const run of runsOf(text)) {
      off += run.length;
      if (off <= pre.length) continue;
      if (markCount(run) > D) continue;
      if (!clusters.has(run)) {
        clusters.add(run);
        queue.push(run);
      }
    }
  };

  let steps = 0;
  for (let qi = 0; qi < queue.length && clusters.size < MAX_CLUSTERS; qi++) {
    if (++steps % 512 === 0 && options?.shouldStop?.() === true) break;
    const x = queue[qi] as string;
    if (markCount(x) < APPEND_STACK_CAP) for (const a of appends) apply(x, 0, a);
    for (const e of byLast.get(lastCp(x)) ?? []) {
      if (x.endsWith(e.c)) apply(x, e.c.length, resolveOut(e.out, []));
    }
    for (const w of wild) {
      // Match from the end of x; null consumes one code point.
      const xs = [...x];
      let pos = xs.length;
      const matched: string[] = [];
      let ok = true;
      for (let k = w.pat.length - 1; k >= 0; k--) {
        const p = w.pat[k] as string | null;
        if (p === null) {
          if (pos < 1) { ok = false; break; }
          matched[k] = xs[pos - 1] as string;
          pos -= 1;
        } else {
          const n = [...p].length;
          if (pos < n || xs.slice(pos - n, pos).join("") !== p) { ok = false; break; }
          matched[k] = p;
          pos -= n;
        }
      }
      if (!ok) continue;
      const consumed = xs.slice(pos).join("").length;
      apply(x, consumed, resolveOut(w.out, matched));
    }
  }

  const sortedClusters = [...clusters].sort(cpCompare);
  const markSet = new Set<string>();
  const baseSet = new Set<string>();
  for (const c of sortedClusters) {
    const cps = [...c];
    if (!isMark(cps[0] as string)) baseSet.add(cps[0] as string);
    for (const cp of cps) if (isMark(cp)) markSet.add(cp);
  }
  for (const i of instances) {
    for (const p of i.pat) if (p !== null) for (const cp of p) if (isMark(cp)) markSet.add(cp);
  }

  return {
    clusters: new Set(sortedClusters),
    marks: [...markSet].sort(cpCompare),
    bases: [...baseSet].sort(cpCompare),
    stackDepth: D,
    unresolved: [...unresolvedRaw.values()]
      .sort()
      .map((storeName) => ({ storeName, reason: "store is not defined and has no storeSketch" })),
  };
}
