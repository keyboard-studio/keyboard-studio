import { describe, it, expect } from "vitest";
import { applyStoreSlotRemovals, classifyStoreSlotEdit } from "./applyStoreSlotRemovals.js";
import { collectCharContributors, collectTaintedContributors } from "./collectCharContributors.js";
import { parseSlotId } from "./slotId.js";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import type { KeyboardIR, IRStore } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// 10. Canaries — real sibling keyboards checkout (skipped if absent)
// ---------------------------------------------------------------------------

import { classifyRemovalCapabilities } from "../recognizer/classifyRemovalCapabilities.js";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const CAMEROON_KMN = resolve(
  __dir,
  "../../../../../keyboards/release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.kmn",
);
const cameroonExists = existsSync(CAMEROON_KMN);

describe("applyStoreSlotRemovals — Cameroon canary (real keyboard)", () => {
  it.skipIf(!cameroonExists)(
    "parses sil_cameroon_qwerty.kmn and asserts ir.raw.length===0 and dkf003b/dkt003b have equal items.length",
    () => {
      const kmnText = readFileSync(CAMEROON_KMN, "utf-8");
      const { ir } = parse(kmnText, "sil_cameroon_qwerty");

      // No opaque fragments — the carve re-emit gate must be passable
      expect(ir.raw.length).toBe(0);

      const dkf = ir.stores.find((s) => s.name === "dkf003b");
      const dkt = ir.stores.find((s) => s.name === "dkt003b");
      expect(dkf).toBeDefined();
      expect(dkt).toBeDefined();

      // Parallel stores must have equal length for index() alignment to be valid
      expect(dkf!.items.length).toBe(dkt!.items.length);
    },
  );
});

describe("applyStoreSlotRemovals — issue #1809 real-keyboard regressions (sil_cameroon_qwerty)", () => {
  // End-to-end nomination → pruning on the real keyboard the issue was filed
  // against (km-lead binding ruling, verification plan). Guarded by the same
  // sibling-checkout canary as above: skipped where the checkout is absent,
  // run in CI.
  function parseCameroon(): KeyboardIR {
    const kmnText = readFileSync(CAMEROON_KMN, "utf-8");
    return parse(kmnText, "sil_cameroon_qwerty").ir;
  }
  function charIndex(store: IRStore, ch: string): number {
    return store.items.findIndex((i) => i.kind === "char" && i.value === ch);
  }
  function storeByName(ir: KeyboardIR, name: string): IRStore {
    const s = ir.stores.find((st) => st.name === name);
    expect(s).toBeDefined();
    return s!;
  }

  it.skipIf(!cameroonExists)(
    "carve U+0308 → ä→a and ṻ→ū backspace rows pruned, paired stores stay equal length, zero system-store warnings",
    () => {
      const ir = parseCameroon();
      const composed = storeByName(ir, "composed");
      const compDia = storeByName(ir, "comp-dia");
      const aeIdx = charIndex(composed, "ä");
      const uhIdx = charIndex(composed, "ṻ");
      expect(aeIdx).toBeGreaterThanOrEqual(0);
      expect(uhIdx).toBeGreaterThanOrEqual(0);
      // Sanity: the issue's rows really are the aligned deconstruction pair.
      expect(compDia.items[aeIdx]).toMatchObject({ kind: "char", value: "a" });
      expect(compDia.items[uhIdx]).toMatchObject({ kind: "char", value: "ū" });

      const { storeSlotIds } = collectTaintedContributors(ir, new Set(["\u0308"]));
      expect(storeSlotIds).toContain(`${composed.nodeId}#${aeIdx}`);
      expect(storeSlotIds).toContain(`${composed.nodeId}#${uhIdx}`);

      const { ir: pruned, warnings } = applyStoreSlotRemovals(ir, new Set(storeSlotIds), {
        carveNotAnyHygiene: true,
      });
      const after = (name: string) => storeByName(pruned, name);
      // The carved rows are gone...
      expect(
        after("composed").items.some((i) => i.kind === "char" && i.value === "ä"),
      ).toBe(false);
      expect(
        after("composed").items.some((i) => i.kind === "char" && i.value === "ṻ"),
      ).toBe(false);
      // ...and every index()-paired store pair kept equal length (lockstep).
      for (const [a, b] of [
        ["composed", "comp-dia"],
        ["dkf003b", "dkt003b"],
        ["dkf003d", "dkt003d"],
        ["lc", "uc"],
      ] as const) {
        expect(after(a).items.length).toBe(after(b).items.length);
      }
      // No system-store defense-in-depth warnings on carve input (ruling §4).
      // (The humanized warning text is "system/compiler-directive store".)
      expect(warnings.some((w) => w.includes("system/compiler-directive"))).toBe(false);
    },
  );

  it.skipIf(!cameroonExists)("carve r → ṝ→ṛ row pruned (ruling §9, no transitive step)", () => {
    const ir = parseCameroon();
    const composed = storeByName(ir, "composed");
    const compDia = storeByName(ir, "comp-dia");
    // NFD(ṝ)=⟨r,U+0323,U+0304⟩ ∋ r (input tainted),
    // NFD(ṛ)=⟨r,U+0323⟩ ∋ r (output tainted) — ruling §8.
    const rrIdx = charIndex(composed, "ṝ");
    expect(rrIdx).toBeGreaterThanOrEqual(0);
    expect(compDia.items[rrIdx]).toMatchObject({ kind: "char", value: "ṛ" });

    const { storeSlotIds } = collectTaintedContributors(ir, new Set(["r"]));
    expect(storeSlotIds).toContain(`${composed.nodeId}#${rrIdx}`);

    const { ir: pruned } = applyStoreSlotRemovals(ir, new Set(storeSlotIds), {
      carveNotAnyHygiene: true,
    });
    const afterComposed = storeByName(pruned, "composed");
    expect(
      afterComposed.items.some((i) => i.kind === "char" && i.value === "ṝ"),
    ).toBe(false);
    expect(afterComposed.items.length).toBe(storeByName(pruned, "comp-dia").items.length);
  });

  it.skipIf(!cameroonExists)(
    "carve q → dkf003b/dkt003b deadkey fan-out rows survive (selector never taint-tested, ruling §3)",
    () => {
      const ir = parseCameroon();
      const dkf = storeByName(ir, "dkf003b");
      const dkt = storeByName(ir, "dkt003b");
      const qIdx = charIndex(dkf, "q");
      // 'q' is genuinely present in the selector store — the test is vacuous otherwise.
      expect(qIdx).toBeGreaterThanOrEqual(0);

      const { storeSlotIds } = collectTaintedContributors(ir, new Set(["q"]));
      // Neither the selector slot nor its produced slot is nominated.
      expect(storeSlotIds).not.toContain(`${dkf.nodeId}#${qIdx}`);
      expect(storeSlotIds).not.toContain(`${dkt.nodeId}#${qIdx}`);

      const { ir: pruned } = applyStoreSlotRemovals(ir, new Set(storeSlotIds), {
        carveNotAnyHygiene: true,
      });
      // The fan-out pair is untouched and still aligned.
      expect(storeByName(pruned, "dkf003b").items.length).toBe(dkf.items.length);
      expect(storeByName(pruned, "dkt003b").items.length).toBe(dkt.items.length);
    },
  );

  it.skipIf(!cameroonExists)("system stores are never nominated on the real keyboard (ruling §4)", () => {
    const ir = parseCameroon();
    const sysNodeIds = new Set(
      ir.stores.filter((s) => s.isSystem).map((s) => s.nodeId),
    );
    // The &CasedKeys et al. system stores parse with isSystem (the `&` prefix
    // is stripped by the codec — the old startsWith("&") guard was dead).
    expect(sysNodeIds.size).toBeGreaterThan(0);

    const { storeSlotIds } = collectTaintedContributors(ir, new Set(["\u0308"]));
    for (const id of storeSlotIds) {
      const parsed = parseSlotId(id);
      expect(parsed).not.toBeNull();
      expect(sysNodeIds.has(parsed!.storeNodeId)).toBe(false);
    }
  });
});

const BAMUM_KMN = resolve(
  __dir,
  "../../../../../keyboards/release/b/bamum/source/bamum.kmn",
);
const bamumExists = existsSync(BAMUM_KMN);

describe("applyStoreSlotRemovals — Bamum canary (bare-any fan-out coordinated drop)", () => {
  it.skipIf(!bamumExists)(
    "removing one defaultU slot coordinates a drop of the paired defaultK input slot too (pairing-graph fix; formerly nul-fill)",
    () => {
      const kmnText = readFileSync(BAMUM_KMN, "utf-8");
      const { ir } = parse(kmnText, "bamum");

      const defaultU = ir.stores.find((s) => s.name === "defaultU");
      const defaultK = ir.stores.find((s) => s.name === "defaultK");
      expect(defaultU).toBeDefined();
      expect(defaultK).toBeDefined();
      const originalULength = defaultU!.items.length;
      const originalKLength = defaultK!.items.length;
      expect(originalULength).toBeGreaterThan(1);

      // Classify — defaultU must still be aliased as removable:slot-fill
      // (a RULE-classification concern, unrelated to the store-slot pairing fix).
      const capMap = classifyRemovalCapabilities(ir);
      expect(capMap.get(defaultU!.nodeId)).toBe("removable:slot-fill");

      // classifyStoreSlotEdit: defaultU is now a coordinated drop, paired with defaultK.
      expect(classifyStoreSlotEdit(defaultU!, ir)).toEqual({
        mode: "drop",
        coordinatedWith: ["defaultK"],
      });

      // Remove slot 0 (first character in the defaultU store).
      const slotId = `${defaultU!.nodeId}#0`;
      const { ir: droppedIr, appliedCount, notices } = applyStoreSlotRemovals(
        ir,
        new Set([slotId]),
      );
      expect(appliedCount).toBe(2); // one item from EACH of the two paired stores
      expect(notices.some((n) => n.includes("coordinated removal"))).toBe(true);

      const droppedU = droppedIr.stores.find((s) => s.name === "defaultU");
      const droppedK = droppedIr.stores.find((s) => s.name === "defaultK");
      expect(droppedU).toBeDefined();
      expect(droppedK).toBeDefined();

      // Both stores shrank by exactly one; slot 0 is gone from BOTH (spliced,
      // not nulled), and what used to be slot 1 is now slot 0.
      expect(droppedU!.items.length).toBe(originalULength - 1);
      expect(droppedK!.items.length).toBe(originalKLength - 1);
      expect(droppedU!.items[0]).toEqual(defaultU!.items[1]);
      expect(droppedK!.items[0]).toEqual(defaultK!.items[1]);

      // No interior nul introduced anywhere.
      const emitted = emit(droppedIr);
      const defaultUEmittedLine = emitted.split("\n").find((l) => l.includes("store(defaultU)"));
      expect(defaultUEmittedLine).toBeDefined();
      expect(defaultUEmittedLine).not.toContain("nul");
    },
  );
});

// ---------------------------------------------------------------------------
// 11. Cameroon-shaped integration test — trimmed embedded fixture
//
// Captures the same idioms as the real sil_cameroon_qwerty.kmn (stores
// word/final/dkf003b/dkt003b; rules :29/:30-shaped self-pairing on
// word/final; the :351-353-shaped dk(003b)/dkf003b/dkt003b cross-pairing;
// literal RALT K_A / SHIFT RALT K_A output rules) WITHOUT committing the
// full SIL keyboard (spec §16 / task instruction).
// ---------------------------------------------------------------------------

describe("applyStoreSlotRemovals — Cameroon-shaped integration (trimmed fixture)", () => {
  const CAMEROON_SHAPED_KMN = [
    "store(&NAME) 'Cameroon-shaped test'",
    "store(&COPYRIGHT) '(C) Test'",
    "store(&TARGETS) 'any'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "",
    "store(word) \"aɛbcĐƐz\"",
    "store(final) \".!?\"",
    "store(dkf003b) U+0061 U+0062 U+0063 U+0064 U+0065 U+0066 U+0067 U+0068 U+0069 U+006A U+006B U+006C",
    "store(dkt003b) U+003B U+2019 U+201D U+00BC U+00BD U+00BE U+20AC U+00D7 U+2018 U+201C U+025B U+0190 nul nul",
    "",
    "platform('touch') any(word) any(final) + [K_SPACE] > index(word,2) index(final,3) \" \"",
    "dk(003b) any(dkf003b) > index(dkt003b, 2)",
    "",
    "+ [RALT K_A] > U+025B",
    "+ [SHIFT RALT K_A] > U+0190",
  ].join("\n");

  it("parses codec-clean (no opaque fragments) and index-target length >= any-source length holds", () => {
    const { ir, warnings } = parse(CAMEROON_SHAPED_KMN, "cameroon_shaped");
    expect(warnings ?? []).toHaveLength(0);
    expect(ir.raw.length).toBe(0);

    const dkf = ir.stores.find((s) => s.name === "dkf003b")!;
    const dkt = ir.stores.find((s) => s.name === "dkt003b")!;
    expect(dkt.items.length).toBeGreaterThanOrEqual(dkf.items.length);
  });

  it("carving the ɛ+Ɛ contributor set splices word/final self-paired and dkf003b/dkt003b cross-paired at the SAME positions, with no interior nul", () => {
    const { ir: startIr } = parse(CAMEROON_SHAPED_KMN, "cameroon_shaped");

    const lower = collectCharContributors(startIr, "ɛ");
    const upper = collectCharContributors(startIr, "Ɛ");

    // Whole-rule deletes for the two literal RALT rules.
    expect(lower.ruleNodeIds.length).toBe(1);
    expect(upper.ruleNodeIds.length).toBe(1);

    // Store-slot contributors: word (self-paired) and dkt003b (cross-paired).
    const deletedItemIds = new Set<string>([
      ...lower.ruleNodeIds,
      ...lower.storeSlotIds,
      ...upper.ruleNodeIds,
      ...upper.storeSlotIds,
    ]);

    const storeNodeIdSet = new Set(startIr.stores.map((s) => s.nodeId));
    const slotIds = new Set<string>();
    const wholeNodeItemIds = new Set<string>();
    for (const id of deletedItemIds) {
      const parsed = parseSlotId(id);
      if (parsed !== null && storeNodeIdSet.has(parsed.storeNodeId)) {
        slotIds.add(id);
      } else {
        wholeNodeItemIds.add(id);
      }
    }

    // Non-vacuous: both a whole-rule and a slot-level contributor were found.
    expect(wholeNodeItemIds.size).toBe(2);
    expect(slotIds.size).toBeGreaterThan(0);

    const { ir: carvedIr, notices, appliedCount } = applyStoreSlotRemovals(startIr, slotIds);
    expect(appliedCount).toBeGreaterThan(0);
    expect(notices.some((n) => n.includes("coordinated removal") && n.includes("dkf003b") && n.includes("dkt003b"))).toBe(true);

    const word = carvedIr.stores.find((s) => s.name === "word")!;
    const final = carvedIr.stores.find((s) => s.name === "final")!;
    const dkf = carvedIr.stores.find((s) => s.name === "dkf003b")!;
    const dkt = carvedIr.stores.find((s) => s.name === "dkt003b")!;

    // word lost ɛ and Ɛ (self-paired drop); final is untouched (no ɛ/Ɛ in it).
    expect(word.items.map((i) => (i.kind === "char" ? i.value : i.kind))).toEqual(["a", "b", "c", "Đ", "z"]);
    const baseFinal = startIr.stores.find((s) => s.name === "final")!;
    expect(final).toBe(baseFinal); // structural sharing: untouched store keeps the same reference

    // dkf003b and dkt003b both lost items[10] and items[11] (ɛ, Ɛ) — SAME
    // positions in both, per the pairing graph. Neither store shrinks to a
    // different length than the other.
    expect(dkf.items.length).toBe(10);
    expect(dkt.items.length).toBe(12); // started 2 longer (trailing nuls) — stays 2 longer
    // dkt003b's original trailing nuls (positions 12,13) are now positions 10,11 — present, not interior.
    expect(dkt.items[10]).toEqual({ kind: "raw", text: "nul" });
    expect(dkt.items[11]).toEqual({ kind: "raw", text: "nul" });
    // No char item anywhere in dkt003b sits AFTER a nul — i.e. every nul is trailing.
    const firstNulIdx = dkt.items.findIndex((i) => i.kind === "raw" && i.text === "nul");
    expect(dkt.items.slice(firstNulIdx).every((i) => i.kind === "raw" && i.text === "nul")).toBe(true);

    // Emitted text contains no MORE nuls than the two pre-existing ones, and
    // no interior nul (Layer-A check #9's alignment invariant holds).
    const emitted = emit(carvedIr);
    const dktLine = emitted.split("\n").find((l) => l.includes("store(dkt003b)"));
    expect(dktLine).toBeDefined();
    expect((dktLine!.match(/nul/g) ?? []).length).toBe(2);
  });
});
