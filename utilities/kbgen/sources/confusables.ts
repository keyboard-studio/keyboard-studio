// Adapter over the vendored confusables.txt (UTS #39). Provides the objective
// "visually similar" signal for ALL scripts: each source character maps toward a
// prototype skeleton, and we follow that chain to the first base-layout ASCII letter.
//
// Note: UTS #39 scope is visual SPOOFING, so it covers e.g. ɓ→b and ɣ→y but omits
// letter-identity look-alikes like ŋ→n. Those gaps are filled by data/supplement.json.

import fs from "fs";
import path from "node:path";
import { pkgRoot } from "../pkg-root.js";

const FILE = path.join(pkgRoot(), "data", "unicode", "confusables.txt");
let MAP: Map<number, number[]> | null = null; // int -> [int] prototype sequence

function load(): Map<number, number[]> {
  if (MAP !== null) return MAP;
  MAP = new Map();
  let text: string;
  try {
    text = fs.readFileSync(FILE, "utf8");
  } catch {
    return MAP;
  }
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const parts = line.split(";");
    if (parts.length < 2) continue;
    const srcStr = parts[0]?.trim() ?? "";
    const tgtStr = parts[1]?.trim() ?? "";
    const src = parseInt(srcStr, 16);
    const tgt = tgtStr.split(/\s+/).map((h) => parseInt(h, 16)).filter((n) => !isNaN(n));
    if (!isNaN(src) && tgt.length) MAP.set(src, tgt);
  }
  return MAP;
}

export const available = (): boolean => load().size > 0;
const isAsciiLetter = (cp: number): boolean =>
  (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);

// Resolve a character to the first base-layout ASCII letter reachable through its
// confusable skeleton, or null. Follows the prototype chain a few hops.
export function skeletonBase(ch: string, depth = 0): string | null {
  const m = load();
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  if (depth > 0 && isAsciiLetter(cp)) return String.fromCodePoint(cp);
  if (depth > 5) return null;
  const tgt = m.get(cp);
  if (!tgt) return null;
  const head = tgt[0];
  if (head === undefined) return null;
  if (isAsciiLetter(head)) return String.fromCodePoint(head);
  return skeletonBase(String.fromCodePoint(head), depth + 1);
}
