// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import * as caps from "@keyboard-studio/engine/caps";
import { parseKmn } from "@keyboard-studio/engine";
import { findRawCtrlRules } from "@keymanapp/keyboard-lint";

import { buildRawCtrlOffer } from "./rawCtrlUpgrade.ts";
import type { UpgradeInput } from "./upgradePairs.ts";

const projectMock = vi.hoisted(() => ({ failNext: false }));
vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine")>();
  return {
    ...actual,
    projectKmnText: (...args: Parameters<typeof actual.projectKmnText>) => {
      if (projectMock.failNext) {
        projectMock.failNext = false;
        return { ok: false, reason: "forced" } as unknown as ReturnType<typeof actual.projectKmnText>;
      }
      return actual.projectKmnText(...args);
    },
  };
});

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../keyboards/release");
const EWE = `${CORPUS}/e/ewe/source/ewe.kmn`;
const BUNONG = `${CORPUS}/sil/sil_bunong/source/sil_bunong.kmn`;

function inputFor(id: string, path: string): UpgradeInput {
  const kmnText = readFileSync(path, "utf8");
  const file = `source/${id}.kmn`;
  return { file, kmnText, keyboardId: id, caps, readText: (p) => (p === file ? kmnText : undefined), paths: [file] };
}

describe.skipIf(!existsSync(EWE))("raw-Ctrl fix on ewe", () => {
  it("splices out the Ctrl rules only, and the result no longer reports", async () => {
    const input = inputFor("ewe", EWE);
    const offer = await buildRawCtrlOffer(input);
    expect(offer).not.toBeNull();
    expect(offer!.file).toBe("source/ewe.kmn");
    expect(offer!.fix.id).toBe("upgrade:KM_LINT_RAW_CTRL:source/ewe.kmn");
    expect(offer!.fix.kind).toBe("upgrade");
    expect(offer!.afterText).not.toMatch(/\[CTRL /);
    expect(offer!.afterText).toMatch(/\[ALT K_1\]/);
    expect(offer!.afterText).toMatch(/\[SHIFT K_Z\]/);
    expect(findRawCtrlRules(parseKmn(offer!.afterText, "ewe").ir, "ewe")).toEqual([]);
  });

  it("adds each uncovered character once, unplaced, and skips ones another rule types", async () => {
    const offer = await buildRawCtrlOffer(inputFor("ewe", EWE));
    const added = offer!.inventoryAdditions ?? [];
    for (const ch of ["\u0101", "\u0113", "\u014d", "\u016b", "\u00e1", "\u00e9", "\u00ed", "\u00f3", "\u00fa"]) {
      expect(added.filter((c) => c === ch), ch).toHaveLength(1);
    }
    expect(new Set(added).size).toBe(added.length);
    // Typed by remaining rules (ALT rules), so not re-added.
    expect(added).not.toContain("\u0254");
    expect(added).not.toContain("\u025b");
    expect(added).not.toContain("\u0303");
  });

  it("previews each removed output with names for invisible characters, and a touch note", async () => {
    const offer = await buildRawCtrlOffer(inputFor("ewe", EWE));
    const note = offer!.fix.preview.find((p) => p.file !== "source/ewe.kmn");
    expect(note).toBeDefined();
    const text = `${note!.before}\n${note!.after}`;
    expect(text).toContain("CTRL K_1");
    expect(text).toContain("COMBINING MACRON");
    expect(text).toMatch(/touch/i);
  });

  it("offers nothing when the projection fails", async () => {
    projectMock.failNext = true;
    expect(await buildRawCtrlOffer(inputFor("ewe", EWE))).toBeNull();
  });
});

describe.skipIf(!existsSync(BUNONG))("raw-Ctrl fix on sil_bunong", () => {
  it("offers nothing", async () => {
    expect(await buildRawCtrlOffer(inputFor("sil_bunong", BUNONG))).toBeNull();
  });
});
