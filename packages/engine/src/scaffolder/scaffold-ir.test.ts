import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import {
  scaffoldIR,
  resetIdentity,
  stripCapsRules,
  ensureCasedKeysStore,
  removeCapsContextElements,
} from "./scaffold-ir.js";

const US_BASE_KMN = `store(&NAME) 'US English'
store(&COPYRIGHT) 'Copyright © 2020 Acme'
store(&VERSION) '5.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [CAPS K_A] > 'a'
+ [NCAPS K_B] > 'b'
+ [K_C] > 'c'
`;

describe("scaffoldIR — IR-native scaffolder operations", () => {
  it("resetIdentity rewrites header.keyboardId/bcp47/copyright/version", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    resetIdentity(ir, {
      keyboardId: "my_new_kbd",
      displayName: "My New Keyboard",
      bcp47: ["fr-FR"],
      version: "1.0",
    });
    expect(ir.header.keyboardId).toBe("my_new_kbd");
    expect(ir.header.name).toBe("My New Keyboard");
    expect(ir.header.bcp47).toEqual(["fr-FR"]);
    expect(ir.header.version).toBe("1.0");
    expect(ir.header.copyright).toMatch(/Copyright © \d{4} My New Keyboard/);
  });

  it("resetIdentity also rewrites the matching &NAME / &COPYRIGHT / &VERSION / &KEYBOARDVERSION system stores", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    resetIdentity(ir, {
      keyboardId: "my_new_kbd",
      displayName: "My New Keyboard",
    });
    const name = ir.stores.find((s) => s.isSystem && s.name === "NAME");
    const version = ir.stores.find((s) => s.isSystem && s.name === "VERSION");
    const kbVersion = ir.stores.find((s) => s.isSystem && s.name === "KEYBOARDVERSION");
    expect(name?.items.map((i) => (i.kind === "char" ? i.value : "")).join("")).toBe(
      "My New Keyboard"
    );
    // &VERSION is the KMN file-format version — always "14.0" (minimum for &CasedKeys).
    expect(version?.items.map((i) => (i.kind === "char" ? i.value : "")).join("")).toBe("14.0");
    // &KEYBOARDVERSION is the human-visible release version — defaults to "1.0".
    expect(kbVersion?.items.map((i) => (i.kind === "char" ? i.value : "")).join("")).toBe("1.0");
  });

  it("resetIdentity rewrites &VISUALKEYBOARD / &LAYOUTFILE / &KMW_EMBEDCSS to match the new keyboardId", () => {
    const SOURCE_WITH_PATH_STORES = `store(&NAME) 'Old'
store(&COPYRIGHT) 'C'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
store(&VISUALKEYBOARD) 'sil_cameroon_qwerty.kvks'
store(&LAYOUTFILE) 'sil_cameroon_qwerty.keyman-touch-layout'
store(&KMW_EMBEDCSS) 'sil_cameroon_qwerty.css'
store(&BITMAP) 'Cameroon.ico'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
`;
    const { ir } = parse(SOURCE_WITH_PATH_STORES, "sil_cameroon_qwerty");
    resetIdentity(ir, { keyboardId: "ewondo", displayName: "Ewondo" });

    const readStore = (n: string): string =>
      ir.stores
        .find((s) => s.isSystem && s.name.toUpperCase() === n)!
        .items.map((i) => (i.kind === "char" ? i.value : ""))
        .join("");

    expect(readStore("VISUALKEYBOARD")).toBe("ewondo.kvks");
    expect(readStore("LAYOUTFILE")).toBe("ewondo.keyman-touch-layout");
    expect(readStore("KMW_EMBEDCSS")).toBe("ewondo.css");
    // &BITMAP with a non-baseId-named icon (sil_cameroon_qwerty uses
    // `Cameroon.ico`) is preserved — `renameFilesInVfs` won't rename
    // the file either, so the store still points at a valid filename.
    expect(readStore("BITMAP")).toBe("Cameroon.ico");
  });

  it("resetIdentity rewrites &BITMAP when its basename matches the base keyboardId", () => {
    // sil_akebu.ico is named after the base id — matches the file
    // rename in renameFilesInVfs, so the store reference must move too.
    const SOURCE = `store(&NAME) 'Akebu'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
store(&BITMAP) 'sil_akebu.ico'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
`;
    const { ir } = parse(SOURCE, "sil_akebu");
    resetIdentity(ir, { keyboardId: "my_akebu_copy", displayName: "My Akebu Copy" });
    const bitmap = ir.stores
      .find((s) => s.isSystem && s.name.toUpperCase() === "BITMAP")!
      .items.map((i) => (i.kind === "char" ? i.value : ""))
      .join("");
    expect(bitmap).toBe("my_akebu_copy.ico");
  });

  it("resetIdentity also rewrites &KMW_EMBEDJS and &KMW_HELPFILE when present", () => {
    const SOURCE = `store(&NAME) 'Old'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
store(&KMW_EMBEDJS) 'old_id.js'
store(&KMW_HELPFILE) 'old_id.htm'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
`;
    const { ir } = parse(SOURCE, "old_id");
    resetIdentity(ir, { keyboardId: "new_id", displayName: "New" });
    const read = (n: string): string =>
      ir.stores
        .find((s) => s.isSystem && s.name.toUpperCase() === n)!
        .items.map((i) => (i.kind === "char" ? i.value : ""))
        .join("");
    expect(read("KMW_EMBEDJS")).toBe("new_id.js");
    expect(read("KMW_HELPFILE")).toBe("new_id.htm");
  });

  it("stripCapsRules removes IRRule nodes whose context has a CAPS or NCAPS modifier", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    const beforeCount = ir.groups[0]!.rules.length;
    expect(beforeCount).toBe(3);
    stripCapsRules(ir);
    const afterRules = ir.groups[0]!.rules;
    expect(afterRules.length).toBe(1);
    // Only the [K_C] rule should remain.
    const remaining = afterRules[0]!;
    const vkey = remaining.context.find((c) => c.kind === "vkey");
    expect(vkey?.kind === "vkey" && vkey.name).toBe("K_C");
  });

  it("removeCapsContextElements strips CAPS/NCAPS from any surviving vkey modifiers", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    // Build a hand-crafted rule that has CAPS alongside another modifier so stripCapsRules
    // doesn't remove the whole rule first.
    ir.groups[0]!.rules.push({
      nodeId: "rule:test",
      context: [{ kind: "vkey", name: "K_X", modifiers: ["SHIFT", "CAPS"] }],
      output: [{ kind: "char", value: "X" }],
    });
    // Skip stripCapsRules so the rule survives; run only the element scrubber.
    removeCapsContextElements(ir);
    const test = ir.groups[0]!.rules.find((r) => r.nodeId === "rule:test");
    const vkey = test?.context[0];
    expect(vkey?.kind === "vkey" && vkey.modifiers).toEqual(["SHIFT"]);
  });

  it("ensureCasedKeysStore inserts &CasedKeys for qwerty group", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    ensureCasedKeysStore(ir, "qwerty-qwertz");
    const cased = ir.stores.find((s) => s.isSystem && s.name === "CasedKeys");
    expect(cased).toBeDefined();
  });

  it("ensureCasedKeysStore inserts the AZERTY extended range for azerty group", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    ensureCasedKeysStore(ir, "azerty");
    const cased = ir.stores.find((s) => s.isSystem && s.name === "CasedKeys");
    expect(cased).toBeDefined();
    // The AZERTY value is preserved as a raw store item.
    const first = cased!.items[0];
    expect(first?.kind === "raw" && first.text).toContain("[K_0]..[K_9]");
  });

  it("ensureCasedKeysStore is a no-op for non-roman group", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    ensureCasedKeysStore(ir, "non-roman");
    const cased = ir.stores.find((s) => s.isSystem && s.name === "CasedKeys");
    expect(cased).toBeUndefined();
  });

  it("ensureCasedKeysStore does not double-insert when one already exists", () => {
    const kmn = US_BASE_KMN + "store(&CasedKeys) [K_A]..[K_Z]\n";
    const { ir } = parse(kmn, "us_english");
    ensureCasedKeysStore(ir, "qwerty-qwertz");
    const all = ir.stores.filter((s) => s.isSystem && s.name === "CasedKeys");
    expect(all.length).toBe(1);
  });

  it("scaffoldIR end-to-end on US-English fallback: identity reset, no NCAPS/CAPS rules, &CasedKeys present", () => {
    const { ir } = parse(US_BASE_KMN, "us_english");
    const result = scaffoldIR(ir, {
      identity: { keyboardId: "my_us_layout", displayName: "My US Layout" },
      group: "qwerty-qwertz",
    });

    expect(result).toBe(ir); // mutates in place

    // Identity reset on header.
    expect(result.header.keyboardId).toBe("my_us_layout");
    expect(result.header.name).toBe("My US Layout");

    // No NCAPS or CAPS context elements anywhere.
    for (const group of result.groups) {
      for (const rule of group.rules) {
        for (const el of rule.context) {
          if (el.kind === "vkey") {
            expect(el.modifiers).not.toContain("CAPS");
            expect(el.modifiers).not.toContain("NCAPS");
          }
        }
      }
    }

    // &CasedKeys store present.
    const cased = result.stores.find((s) => s.isSystem && s.name === "CasedKeys");
    expect(cased).toBeDefined();

    // Round-trip through emit so we exercise the full pipeline.
    const emitted = emit(result);
    expect(emitted).not.toContain("[CAPS");
    expect(emitted).not.toContain("[NCAPS");
    expect(emitted).toContain("store(&NAME) 'My US Layout'");
    expect(emitted).toMatch(/store\(&CasedKeys\)/);
  });
});
