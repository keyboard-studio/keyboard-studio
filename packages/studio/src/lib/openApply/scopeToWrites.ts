// scopeToWrites -- `base` with ONLY the subtrees named by `writes` taken from
// `next`. The `model` apply diffs this, so a difference between the working IR
// and the file that sits outside the change's declared write paths can never be
// swept into the file (spec 111, defence in depth). A path is followed down to
// its first array step; the subtree at that prefix is taken whole.

import type { IRPath, KeyboardIR } from "@keyboard-studio/contracts";

function prefixOf(path: IRPath): string[] {
  const out: string[] = [];
  for (const seg of path) {
    if (typeof seg !== "string") break;
    out.push(seg);
  }
  return out;
}

function getIn(root: unknown, prefix: readonly string[]): unknown {
  let cur = root;
  for (const k of prefix) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function setIn(root: Record<string, unknown>, prefix: readonly string[], value: unknown): Record<string, unknown> {
  if (prefix.length === 0) return root;
  const [head, ...rest] = prefix as [string, ...string[]];
  const child = root[head];
  const copy = { ...root };
  copy[head] =
    rest.length === 0
      ? value
      : setIn(child !== null && typeof child === "object" ? (child as Record<string, unknown>) : {}, rest, value);
  return copy;
}

export function scopeToWrites(base: KeyboardIR, next: KeyboardIR, writes: readonly IRPath[]): KeyboardIR {
  let out = base as unknown as Record<string, unknown>;
  for (const w of writes) {
    const prefix = prefixOf(w);
    if (prefix.length === 0) continue;
    out = setIn(out, prefix, getIn(next, prefix));
  }
  return out as unknown as KeyboardIR;
}
