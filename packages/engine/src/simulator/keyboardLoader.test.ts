// Loader equivalence (spec 078 T004): the browser loader must be a drop-in for
// the Node vm loader. The same compiled keyboard, fed the same keys from the
// same seed, gives the same simulate() output under both.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { CompileResult, SimKeyInput } from "@keyboard-studio/contracts";

import { parse } from "../codec/parse.js";
import { compile } from "../compiler/index.js";
import { buildToleranceCompileVfs } from "../validator/context-tolerance.js";
import { browserKeyboardLoader } from "./browserKeyboardLoader.js";
import { simulate } from "./index.js";
import { setKeyboardLoader } from "./keyboardLoader.js";
import { nodeKeyboardLoader } from "./nodeKeyboardLoader.js";

const KEYBOARDS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../keyboards/release");
const YORUBA8 = resolve(KEYBOARDS, "sil/sil_yoruba8/source/sil_yoruba8.kmn");
const KBDFR = resolve(KEYBOARDS, "basic/basic_kbdfr/source/basic_kbdfr.kmn");

async function compileKeyboard(path: string, id: string): Promise<CompileResult> {
  const { ir } = parse(readFileSync(path, "utf-8"), id);
  return compile(buildToleranceCompileVfs(ir), id);
}

const key = (vkey: string, ...modifiers: SimKeyInput["modifiers"]): SimKeyInput => ({ vkey, modifiers });

function outputsUnder(
  loader: typeof nodeKeyboardLoader,
  compiled: CompileResult,
  cases: { seed: string; keys: SimKeyInput[] }[],
): string[] {
  setKeyboardLoader(loader);
  return cases.map((c) => simulate(compiled, c.keys, { text: c.seed }).finalOutput);
}

afterAll(() => setKeyboardLoader(nodeKeyboardLoader));

describe("browserKeyboardLoader matches nodeKeyboardLoader (spec 078 T004)", () => {
  it.skipIf(!existsSync(YORUBA8))(
    "sil_yoruba8: composed and decomposed seeds give identical output under both loaders",
    async () => {
      const compiled = await compileKeyboard(YORUBA8, "sil_yoruba8");
      const seeds = ["ọ", "ọ".normalize("NFD"), "ẹ", "ẹ".normalize("NFD"), "a", ""];
      const keys = [[key("K_LBRKT")], [key("K_RBRKT")], [key("K_BKQUOTE")], [key("K_O")], [key("K_E", "shift")]];
      const cases = seeds.flatMap((seed) => keys.map((k) => ({ seed, keys: k })));

      const viaNode = outputsUnder(nodeKeyboardLoader, compiled, cases);
      const viaBrowser = outputsUnder(browserKeyboardLoader, compiled, cases);
      expect(viaBrowser).toEqual(viaNode);
      // The comparison is only meaningful if the keyboard actually did something.
      expect(viaNode.some((out, i) => out !== cases[i]!.seed)).toBe(true);
    },
    60_000,
  );

  it.skipIf(!existsSync(KBDFR))(
    "basic_kbdfr: deadkey sequences give identical output under both loaders",
    async () => {
      const compiled = await compileKeyboard(KBDFR, "basic_kbdfr");
      const cases = [
        { seed: "", keys: [key("K_LBRKT"), key("K_E")] },
        { seed: "", keys: [key("K_LBRKT", "shift"), key("K_A")] },
        { seed: "x", keys: [key("K_Q"), key("K_2")] },
        { seed: "", keys: [key("K_2", "ralt"), key("K_SPACE")] },
      ];

      const viaNode = outputsUnder(nodeKeyboardLoader, compiled, cases);
      const viaBrowser = outputsUnder(browserKeyboardLoader, compiled, cases);
      expect(viaBrowser).toEqual(viaNode);
      expect(viaNode.some((out) => out.length > 0)).toBe(true);
    },
    60_000,
  );
});
