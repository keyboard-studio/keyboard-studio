// Legacy CLDR → IR desktop import (issue #2599).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { emit } from "../codec/emit.js";
import { parse } from "../codec/parse.js";
import { parseCldrLegacyKeyboard } from "./legacyXml.js";
import { importCldrDesktopKeyboard } from "./toIr.js";

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string): string =>
  readFileSync(resolve(here, "__fixtures__", name), "utf8");

const DE_SOURCE = "keyboards/windows/de-t-k0-windows.xml";

function importDe() {
  return importCldrDesktopKeyboard(
    parseCldrLegacyKeyboard(readFixture("de-t-k0-windows.xml")),
    { keyboardId: "cldr_de_windows", displayName: "German (CLDR Windows)", sourceFile: DE_SOURCE },
  );
}

/** Find a rule by its struck key + modifiers. */
function ruleFor(
  ir: ReturnType<typeof importDe>["ir"],
  vkey: string,
  modifiers: string[] = [],
) {
  return ir.groups[0]?.rules.find(
    (r) =>
      r.context.length === 1 &&
      r.context[0]?.kind === "vkey" &&
      r.context[0].name === vkey &&
      JSON.stringify(r.context[0].modifiers) === JSON.stringify(modifiers),
  );
}

describe("importCldrDesktopKeyboard — de windows fixture", () => {
  const { ir, report } = importDe();

  it("builds one using-keys group with the imported rules", () => {
    expect(ir.groups).toHaveLength(1);
    expect(ir.groups[0]?.name).toBe("main");
    expect(ir.groups[0]?.usingKeys).toBe(true);
    expect(ir.origin).toBe("imported");
    expect(report.keystrokeRules).toBeGreaterThan(100);
    expect(report.transformRules).toBeGreaterThan(30);
    expect(report.skipped).toEqual([]);
    expect(report.unmappedPositions).toEqual([]);
  });

  it("discovers the dead keys and names them cldr_<hex>", () => {
    // Sorted by codepoint: ^ U+005E, ` U+0060, ´ U+00B4.
    expect(report.deadkeys).toEqual([
      { char: "^", name: "cldr_005e" },
      { char: "`", name: "cldr_0060" },
      { char: "´", name: "cldr_00b4" },
    ]);
  });

  it("arms a deadkey from the key that types its character", () => {
    // Both arming keys also have CAPS rules, so the base rule carries NCAPS
    // (kmc-kmn caps consistency — see toIr.ts).
    const e00 = ruleFor(ir, "K_BKQUOTE", ["NCAPS"]);
    expect(e00?.output).toEqual([
      { kind: "namedDeadkey", name: "cldr_005e" },
    ]);
    const e12 = ruleFor(ir, "K_EQUAL", ["NCAPS"]);
    expect(e12?.output).toEqual([
      { kind: "namedDeadkey", name: "cldr_00b4" },
    ]);
  });

  it("imports plain keystroke rules (base + shift)", () => {
    expect(ruleFor(ir, "K_Q", ["NCAPS"])?.output).toEqual([
      { kind: "char", value: "q" },
    ]);
    expect(ruleFor(ir, "K_Q", ["NCAPS", "SHIFT"])?.output).toEqual([
      { kind: "char", value: "Q" },
    ]);
    expect(ruleFor(ir, "K_SPACE", ["NCAPS"])?.output).toEqual([
      { kind: "char", value: " " },
    ]);
  });

  it("imports transforms as deadkey + keystroke rules", () => {
    const dkRule = ir.groups[0]?.rules.find(
      (r) =>
        r.context[0]?.kind === "namedDeadkey" &&
        r.context[0].name === "cldr_005e" &&
        r.context[2]?.kind === "vkey" &&
        r.context[2].name === "K_A",
    );
    expect(dkRule).toBeDefined();
    expect(dkRule?.context[1]).toEqual({ kind: "raw", text: "+" });
    expect(dkRule?.output).toEqual([{ kind: "char", value: "â" }]);
    // Deadkey + space yields the deadkey character itself.
    const spaceRule = ir.groups[0]?.rules.find(
      (r) =>
        r.context[0]?.kind === "namedDeadkey" &&
        r.context[0].name === "cldr_005e" &&
        r.context[2]?.kind === "vkey" &&
        r.context[2].name === "K_SPACE",
    );
    expect(spaceRule?.output).toEqual([{ kind: "char", value: "^" }]);
  });

  it("records the CLDR origin in the header, stores and comments", () => {
    expect(ir.header.keyboardId).toBe("cldr_de_windows");
    expect(ir.header.copyright).toContain("Unicode");
    expect(ir.comments[0]?.text).toContain(DE_SOURCE);
    expect(ir.comments[0]?.text).toContain("Unicode License");
  });

  it("emits KMN the codec can read back", () => {
    const kmn = emit(ir);
    // The emitter spells BMP rule outputs as U+XXXX tokens, and base rules
    // for keys with a CAPS variant carry NCAPS (kmc-kmn caps consistency).
    expect(kmn).toContain("+ [NCAPS K_Q] > U+0071");
    expect(kmn).toContain("dk(cldr_005e) + [NCAPS K_A] > U+00E2");
    expect(kmn).toContain("store(&NAME) 'German (CLDR Windows)'");
    const parsed = parse(kmn, "cldr_de_windows");
    expect(parsed.ir.groups[0]?.rules.length).toBe(
      ir.groups[0]?.rules.length,
    );
  });
});

describe("importCldrDesktopKeyboard — transform=no (fr fixture)", () => {
  it("keeps a transform=no key's plain output even for a dead-key char", () => {
    const { ir, report } = importCldrDesktopKeyboard(
      parseCldrLegacyKeyboard(readFixture("fr-t-k0-windows.xml")),
      {
        keyboardId: "cldr_fr_windows",
        displayName: "French (CLDR Windows)",
        sourceFile: "keyboards/windows/fr-t-k0-windows.xml",
      },
    );
    expect(report.deadkeys.map((d) => d.char)).toContain("^");
    // fr E09 is `^` with transform="no" — it types a literal caret. The
    // transform="no" map lives on the `altR+caps?` layer (AltGr+9 on AZERTY),
    // so the rule is [NCAPS RALT K_9] (NCAPS: the key also has a CAPS rule).
    const e09 = ruleFor(ir, "K_9", ["NCAPS", "RALT"]);
    expect(e09?.output).toEqual([{ kind: "char", value: "^" }]);
  });
});

describe("importCldrDesktopKeyboard — form-dependent positions", () => {
  it("maps pt B11 to the ABNT2 extra key", () => {
    const { ir } = importCldrDesktopKeyboard(
      parseCldrLegacyKeyboard(readFixture("pt-t-k0-windows.xml")),
      {
        keyboardId: "cldr_pt_windows",
        displayName: "Portuguese (CLDR Windows)",
        sourceFile: "keyboards/windows/pt-t-k0-windows.xml",
      },
    );
    expect(ruleFor(ir, "K_oC1", ["NCAPS"])?.output).toEqual([
      { kind: "char", value: "/" },
    ]);
  });

  it("maps ja E13 to the JIS number-row extra key", () => {
    // E13 exists only on the chromeos file (the windows file has no E13).
    const { ir } = importCldrDesktopKeyboard(
      parseCldrLegacyKeyboard(readFixture("ja-t-k0-chromeos.xml")),
      {
        keyboardId: "cldr_ja_chromeos",
        displayName: "Japanese (CLDR ChromeOS)",
        sourceFile: "keyboards/chromeos/ja-t-k0-chromeos.xml",
      },
    );
    expect(ruleFor(ir, "K_oE0", ["NCAPS"])).toBeDefined();
  });
});

describe("importCldrDesktopKeyboard — android fileKind", () => {
  it("skips opt keyMaps (touch symbol layers) for the desktop half", () => {
    const { ir, report } = importCldrDesktopKeyboard(
      parseCldrLegacyKeyboard(readFixture("de-t-k0-android.xml")),
      {
        keyboardId: "cldr_de_android",
        displayName: "German (CLDR Android)",
        sourceFile: "keyboards/android/de-t-k0-android.xml",
        fileKind: "android",
      },
    );
    // No RALT rules: the opt layers never become desktop rules.
    const raltRules = ir.groups[0]?.rules.filter((r) =>
      r.context.some(
        (el) => el.kind === "vkey" && el.modifiers.includes("RALT"),
      ),
    );
    expect(raltRules).toEqual([]);
    expect(report.skipped).toContainEqual(
      expect.objectContaining({ reason: "android-opt-keymap-touch-only" }),
    );
    // The letter layers still import (the de android file has a `shift caps`
    // keyMap, so the base rule carries NCAPS like the desktop import).
    expect(ruleFor(ir, "K_Q", ["NCAPS"])?.output).toEqual([
      { kind: "char", value: "q" },
    ]);
  });
});
