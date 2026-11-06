// Opt-in corpus check (spec 111 T059c): the keyboards fork's release/basic
// layouts were given a symbol layer and K_SYMBOLS keys by the owner's scripts
// (three of the 186 did not fit). The symbols fixer must agree: it leaves
// those layouts alone, and it is idempotent where it does change one.
// Skips without a sibling `../keyboards` checkout.

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addTouchSymbolsLayerRaw } from "./addTouchSymbolsLayer.js";

const BASIC = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../keyboards/release/basic");

describe.skipIf(!existsSync(BASIC))("addTouchSymbolsLayerRaw over the fork's basic keyboards", () => {
  it("leaves the processed layouts alone", () => {
    const changed: string[] = [];
    let total = 0;
    for (const id of readdirSync(BASIC)) {
      const f = join(BASIC, id, "source", `${id}.keyman-touch-layout`);
      if (!existsSync(f)) continue;
      total += 1;
      const text = readFileSync(f, "utf8");
      const once = addTouchSymbolsLayerRaw(text);
      if (!once.changed) continue;
      changed.push(id);
      expect(addTouchSymbolsLayerRaw(once.json).changed, id).toBe(false);
    }
    expect(total).toBeGreaterThan(100);
    expect(changed).toEqual([]);
  });
});
