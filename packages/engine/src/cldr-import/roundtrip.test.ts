// Keystroke round-trip test for the CLDR import (issue #2599, criterion 2):
// import the German fixtures, compile the emitted keyboard, and simulate
// the keystrokes the CLDR file describes — including a dead-key layout.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS, type SimKeyInput } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { emitTouchLayout } from "../codec/parse-touch.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { parseCldrLegacyKeyboard } from "./legacyXml.js";
import { importCldrKeyboard } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): string =>
  readFileSync(resolve(here, "__fixtures__", name), "utf8");

async function compileGerman() {
  const { ir } = importCldrKeyboard({
    desktop: parseCldrLegacyKeyboard(readFixture("de-t-k0-windows.xml")),
    android: parseCldrLegacyKeyboard(readFixture("de-t-k0-android.xml")),
    keyboardId: "cldr_de_windows",
    displayName: "German (CLDR Windows)",
    bcp47: ["de"],
    sourceFiles: {
      desktop: "keyboards/windows/de-t-k0-windows.xml",
      android: "keyboards/android/de-t-k0-android.xml",
    },
  });
  const vfs = createVirtualFS([
    { path: "source/cldr_de_windows.kmn", content: emit(ir), isBinary: false },
    {
      path: "source/cldr_de_windows.keyman-touch-layout",
      content: emitTouchLayout(ir.touchLayout as NonNullable<typeof ir.touchLayout>),
      isBinary: false,
    },
  ]);
  const compiled = await compile(vfs, "cldr_de_windows");
  expect(compiled.success, "compile must succeed").toBe(true);
  const jsArtifact = compiled.artifacts.find((a) => a.filename.endsWith(".js"));
  expect(jsArtifact?.data, ".js artifact must have raw data bytes").toBeDefined();
  return compiled;
}

describe("CLDR import — keystroke round-trip (de fixtures)", () => {
  it("types plain keys per the CLDR keyMap", async () => {
    const compiled = await compileGerman();
    const keys: SimKeyInput[] = [
      { vkey: "K_Q", modifiers: [], caps: false },
      { vkey: "K_E", modifiers: [], caps: false },
      { vkey: "K_Q", modifiers: ["shift"], caps: false },
      { vkey: "K_SPACE", modifiers: [], caps: false },
    ];
    expect(simulate(compiled, keys).finalOutput).toBe("qeQ ");
  }, 60_000);

  it("resolves the circumflex dead key (^ then a → â)", async () => {
    const compiled = await compileGerman();
    const keys: SimKeyInput[] = [
      { vkey: "K_BKQUOTE", modifiers: [], caps: false }, // types ^, arms dk
      { vkey: "K_A", modifiers: [], caps: false },
    ];
    const result = simulate(compiled, keys);
    expect(result.trace[0]?.outputAfter).toBe("");
    expect(result.trace[0]?.pendingDeadkeys).toHaveLength(1);
    expect(result.finalOutput).toBe("â");
  }, 60_000);

  it("resolves the acute dead key (´ then e → é)", async () => {
    const compiled = await compileGerman();
    const keys: SimKeyInput[] = [
      { vkey: "K_EQUAL", modifiers: [], caps: false }, // types ´, arms dk
      { vkey: "K_E", modifiers: [], caps: false },
    ];
    expect(simulate(compiled, keys).finalOutput).toBe("é");
  }, 60_000);

  it("yields the dead-key character itself after a space (^ then space → ^)", async () => {
    const compiled = await compileGerman();
    const keys: SimKeyInput[] = [
      { vkey: "K_BKQUOTE", modifiers: [], caps: false },
      { vkey: "K_SPACE", modifiers: [], caps: false },
    ];
    expect(simulate(compiled, keys).finalOutput).toBe("^");
  }, 60_000);

  it("keeps the touch layout attached (LAYOUTFILE store + emitted JSON)", async () => {
    const { ir } = importCldrKeyboard({
      desktop: parseCldrLegacyKeyboard(readFixture("de-t-k0-windows.xml")),
      android: parseCldrLegacyKeyboard(readFixture("de-t-k0-android.xml")),
      keyboardId: "cldr_de_windows",
      displayName: "German (CLDR Windows)",
      bcp47: ["de"],
      sourceFiles: {
        desktop: "keyboards/windows/de-t-k0-windows.xml",
        android: "keyboards/android/de-t-k0-android.xml",
      },
    });
    const layoutFile = ir.stores.find((s) => s.name === "LAYOUTFILE");
    expect(layoutFile).toBeDefined();
    expect(ir.touchLayout?.platforms.map((p) => p.id)).toEqual(["phone"]);
    expect(
      ir.touchLayout?.platforms[0]?.layers.map((l) => l.id),
    ).toEqual(["default", "shift", "symbol", "symbol-shift"]);
    // The emitted touch layout parses back to the same layers.
    const { parseTouchLayout } = await import("../codec/parse-touch.js");
    const reparsed = parseTouchLayout(
      emitTouchLayout(ir.touchLayout as NonNullable<typeof ir.touchLayout>),
    );
    expect(reparsed.platforms[0]?.layers.map((l) => l.id)).toEqual([
      "default",
      "shift",
      "symbol",
      "symbol-shift",
    ]);
  }, 60_000);
});
