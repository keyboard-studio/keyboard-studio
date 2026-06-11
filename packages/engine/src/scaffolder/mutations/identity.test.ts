/**
 * Tests for mutateIdentity.
 *
 * Migrated from stub-mutator/index.test.ts (Sprint-1 stub, removed during scaffold-over-IR work).
 * The original tests used VFS-level text assertions; these use IR-level
 * assertions on the store items after mutateIdentity.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { mutateIdentity } from "./identity.js";
import { parse } from "../../codec/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(__dirname, "../../../../../../keyboards");
const SIBLING_REPO_PRESENT = existsSync(KEYBOARDS_ROOT);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** Minimal but realistic KMN fixture with all four identity stores. */
const FIXTURE_KMN = [
  "store(&NAME) 'Original Name'",
  "store(&COPYRIGHT) 'Copyright © 2020 Original Author'",
  "store(&VERSION) '1.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
].join("\n");

function parseFixture(): KeyboardIR {
  return parse(FIXTURE_KMN).ir;
}

function storeItems(ir: KeyboardIR, storeName: string): string {
  const s = ir.stores.find((s) => s.isSystem && s.name.toUpperCase() === storeName.toUpperCase());
  if (!s) return "";
  return s.items.map((i) => (i.kind === "char" ? i.value : "")).join("");
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("mutateIdentity", () => {
  it("updates the NAME store", () => {
    const ir = mutateIdentity(parseFixture(), "test_kb", "My New Keyboard");
    expect(storeItems(ir, "NAME")).toBe("My New Keyboard");
  });

  it("updates the COPYRIGHT store with year and display name", () => {
    const year = new Date().getFullYear();
    const ir = mutateIdentity(parseFixture(), "test_kb", "New Author");
    expect(storeItems(ir, "COPYRIGHT")).toBe(`Copyright © ${year} New Author`);
  });

  it("updates VERSION to 1.0", () => {
    const ir = mutateIdentity(parseFixture(), "test_kb", "Test");
    expect(storeItems(ir, "VERSION")).toBe("1.0");
  });

  it("updates KEYBOARDVERSION to 1.0", () => {
    const ir = mutateIdentity(parseFixture(), "test_kb", "Test");
    expect(storeItems(ir, "KEYBOARDVERSION")).toBe("1.0");
  });

  it("updates all four fields together", () => {
    const year = new Date().getFullYear();
    const ir = mutateIdentity(parseFixture(), "test_kb", "All Three");
    expect(storeItems(ir, "NAME")).toBe("All Three");
    expect(storeItems(ir, "COPYRIGHT")).toBe(`Copyright © ${year} All Three`);
    expect(storeItems(ir, "VERSION")).toBe("1.0");
    expect(storeItems(ir, "KEYBOARDVERSION")).toBe("1.0");
  });

  it("leaves non-identity stores unchanged", () => {
    const original = parseFixture();
    const ir = mutateIdentity(original, "test_kb", "Changed Name");
    // Other stores (none in fixture), groups, rules should be untouched
    expect(ir.groups).toBe(original.groups); // referential equality (no group mutation)
  });

  it("does not mutate input IR in-place (shallow-clone)", () => {
    const original = parseFixture();
    const originalNameItems = original.stores.find((s) => s.name.toUpperCase() === "NAME")!.items;
    mutateIdentity(original, "test_kb", "Changed");
    // Original store items unchanged
    const originalText = originalNameItems.map((i) => (i.kind === "char" ? i.value : "")).join("");
    expect(originalText).toBe("Original Name");
  });

  it("replaces straight apostrophe with RIGHT SINGLE QUOTATION MARK (U+2019) in NAME store", () => {
    const ir = mutateIdentity(parseFixture(), "test_kb", "O'Brien");
    // The char items should contain U+2019, not U+0027
    const nameStore = ir.stores.find((s) => s.isSystem && s.name.toUpperCase() === "NAME");
    expect(nameStore).toBeDefined();
    const text = nameStore!.items.map((i) => (i.kind === "char" ? i.value : "")).join("");
    expect(text).toContain("’");
    expect(text).not.toContain("'");
    expect(text).toBe("O’Brien");
  });

  it("replaces apostrophe in COPYRIGHT store too", () => {
    const year = new Date().getFullYear();
    const ir = mutateIdentity(parseFixture(), "test_kb", "O'Brien");
    const text = storeItems(ir, "COPYRIGHT");
    expect(text).toBe(`Copyright © ${year} O’Brien`);
  });

  it("updates ir.header fields", () => {
    const year = new Date().getFullYear();
    const ir = mutateIdentity(parseFixture(), "new_id", "Display Name");
    expect(ir.header.keyboardId).toBe("new_id");
    expect(ir.header.name).toBe("Display Name");
    expect(ir.header.copyright).toBe(`Copyright © ${year} Display Name`);
    expect(ir.header.version).toBe("1.0");
  });

  it("resets ir.header.bcp47 to empty array (Phase A fills it later)", () => {
    // Fixture has no bcp47 set (defaults to [] from parse), but set a
    // non-empty value to confirm the reset is active.
    const base = parseFixture();
    const withBcp47 = { ...base, header: { ...base.header, bcp47: ["en", "fr"] } };
    const ir = mutateIdentity(withBcp47, "test_kb", "Test");
    expect(ir.header.bcp47).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Live-keyboard tests (require sibling keymanapp/keyboards repo at ../keyboards)
// ---------------------------------------------------------------------------

function parseRealKeyboard(id: string): KeyboardIR {
  const kmnPath = resolve(KEYBOARDS_ROOT, `release/basic/${id}/source/${id}.kmn`);
  const content = readFileSync(kmnPath, "utf8");
  return parse(content).ir;
}

describe.skipIf(!SIBLING_REPO_PRESENT)(
  "mutateIdentity — live keyboards (sibling repo)",
  () => {
    it("basic_kbdus: updates NAME, COPYRIGHT, VERSION stores; leaves groups referentially equal", () => {
      const year = new Date().getFullYear();
      const original = parseRealKeyboard("basic_kbdus");
      const result = mutateIdentity(original, "basic_kbdus", "Test US");
      expect(storeItems(result, "NAME")).toBe("Test US");
      expect(storeItems(result, "COPYRIGHT")).toBe(`Copyright © ${year} Test US`);
      expect(storeItems(result, "VERSION")).toBe("1.0");
      // Groups should not have been touched
      expect(result.groups).toBe(original.groups);
    });

    it("basic_kbdgr: updates NAME only; VERSION and COPYRIGHT stores have 1.0 / updated text", () => {
      const year = new Date().getFullYear();
      const original = parseRealKeyboard("basic_kbdgr");
      const result = mutateIdentity(original, "basic_kbdgr", "German Test");
      expect(storeItems(result, "NAME")).toBe("German Test");
      expect(storeItems(result, "COPYRIGHT")).toBe(`Copyright © ${year} German Test`);
      expect(storeItems(result, "VERSION")).toBe("1.0");
    });
  }
);
