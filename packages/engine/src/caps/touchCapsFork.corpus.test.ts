// Opt-in corpus check (spec 111 T059a): the owner's `processTouch.py` produced
// the touch layouts of the keyboards fork's release/basic keyboards. Running
// the Capsifesto touch sync over those results must leave them (nearly)
// unchanged -- the sync and the script agree on what a finished layout is.
// Skips without a sibling `../keyboards` checkout.

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncTouchCapsLayerRaw } from "./syncTouchCapsLayer.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASIC_ROOT = resolve(__dir, "../../../../../keyboards/release/basic");
const available = existsSync(BASIC_ROOT);

interface Key {
  id?: string;
  text?: string;
  nextlayer?: string;
  multitap?: unknown;
}
interface Layer {
  id: string;
  row: Array<{ key: Key[] }>;
}

function forkLayouts(): Array<{ id: string; text: string }> {
  if (!available) return [];
  const out: Array<{ id: string; text: string }> = [];
  for (const id of readdirSync(BASIC_ROOT)) {
    const dir = join(BASIC_ROOT, id, "source");
    const kmn = join(dir, `${id}.kmn`);
    const touch = join(dir, `${id}.keyman-touch-layout`);
    if (!existsSync(kmn) || !existsSync(touch)) continue;
    // The script only processed keyboards that declare &CasedKeys.
    if (!/&CasedKeys/i.test(readFileSync(kmn, "utf8"))) continue;
    out.push({ id, text: readFileSync(touch, "utf8") });
  }
  return out;
}

describe.skipIf(!available)("syncTouchCapsLayerRaw over the fork's processed basic keyboards", () => {
  const layouts = forkLayouts();

  it("finds the processed keyboards", () => {
    expect(layouts.length).toBeGreaterThan(50);
  });

  it("agrees with the script on the shift and caps keys of most layouts", () => {
    let unchanged = 0;
    const gaps: string[] = [];
    for (const { id, text } of layouts) {
      const out = syncTouchCapsLayerRaw(text, { bcp47: "en" });
      if (!out.changed) {
        unchanged += 1;
        continue;
      }
      const before = JSON.parse(text) as Record<string, { layer: Layer[] }>;
      const after = JSON.parse(out.json) as Record<string, { layer: Layer[] }>;
      for (const [p, platform] of Object.entries(after)) {
        for (const l of platform.layer) {
          const old = before[p]?.layer.find((x) => x.id === l.id);
          if (old === undefined) {
            gaps.push(`${id}: +layer ${l.id}`);
            continue;
          }
          const oldKeys = old.row.flatMap((r) => r.key);
          // Some layers repeat a key id: pair the n-th occurrence with the n-th.
          const seen = new Map<string, number>();
          for (const k of l.row.flatMap((r) => r.key)) {
            const n = seen.get(k.id ?? "") ?? 0;
            seen.set(k.id ?? "", n + 1);
            const o = oldKeys.filter((x) => x.id === k.id)[n];
            if (o === undefined) continue;
            if (o.text !== k.text) gaps.push(`${id}: ${l.id}/${k.id} text ${o.text} -> ${k.text}`);
            if (o.nextlayer !== k.nextlayer) gaps.push(`${id}: ${l.id}/${k.id} nextlayer ${o.nextlayer} -> ${k.nextlayer}`);
          }
        }
      }
    }
    // The only differences: the script left a caps character key switching
    // layer (spec 112 FR-003 removes that), and it wrote the nonexistent
    // layer id "rightalt-default" for Shift on rightalt-caps (the sync writes
    // "rightalt").
    const explained = gaps.filter(
      (g) => /: (rightalt-)?caps\/\S+ nextlayer default -> undefined$/.test(g) || /rightalt-caps\/K_SHIFT nextlayer rightalt-default -> rightalt$/.test(g),
    );
    expect(gaps.filter((g) => !explained.includes(g))).toEqual([]);
    expect(unchanged).toBeGreaterThan(layouts.length / 2);
  });
});
