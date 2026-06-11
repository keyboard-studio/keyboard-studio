/**
 * Integration tests for recognizePatterns against real keyboard sources.
 *
 * Uses the real KMN codec (parse from packages/engine/src/codec) to produce
 * KeyboardIR from the sibling keyboards checkout.  Tests skip cleanly when
 * the sibling repo is absent so CI does not break in minimal checkouts.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { recognizePatterns } from "./index.js";
import { parse } from "../codec/index.js";

const KEYBOARDS_ROOT = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/basic",
);

const kbdfrPath = path.join(KEYBOARDS_ROOT, "basic_kbdfr/source/basic_kbdfr.kmn");
const kbdcaPath = path.join(KEYBOARDS_ROOT, "basic_kbdca/source/basic_kbdca.kmn");

const kbdfrExists = fs.existsSync(kbdfrPath);
const kbdcaExists = fs.existsSync(kbdcaPath);

// ---------------------------------------------------------------------------
// basic_kbdfr — French AZERTY
//
// Real keyboard structure:
//   - main group: ~80 S-01-candidate rules (char swaps) + 4 deadkey trigger
//     rules (RALT K_2 → dk(007e), RALT K_7 → dk(0060), K_LBRKT → dk(005e),
//     SHIFT K_LBRKT → dk(00a8)) + 1 match directive rule
//   - deadkeys group: 4 body rules (one per family)
//   - stores: 8 parallel stores (dkf007e/dkt007e, dkf0060/dkt0060,
//             dkf00a8/dkt00a8, dkf005e/dkt005e)
//
// S-01 recognizer skips the main group because distinctBaseNames > 5.
// S-02 recognizer finds all 4 deadkey families.
// ---------------------------------------------------------------------------

describe("integration: recognizePatterns against real basic_kbdfr source", () => {
  it.skipIf(!kbdfrExists)(
    "produces exactly 4 S-02 Patterns and recognizedRatio > 0",
    () => {
      const kmnText = fs.readFileSync(kbdfrPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdfr");
      const { ir: out, recognizedRatio } = recognizePatterns(ir);

      const s01Patterns = out.recognizedPatterns.filter((p) => p.strategyId === "S-01");
      const s02Patterns = out.recognizedPatterns.filter((p) => p.strategyId === "S-02");

      // The main group has many distinct base-key names (> 5), so S-01 does
      // not fire for kbdfr.  The deadkey group name is "deadkeys" which S-01
      // also excludes.
      expect(s01Patterns).toHaveLength(0);

      // basic_kbdfr has exactly 4 deadkey families.
      expect(s02Patterns).toHaveLength(4);

      // At least the 4 trigger rules + 4 body rules are covered.
      expect(recognizedRatio).toBeGreaterThan(0);
    },
  );

  it.skipIf(!kbdfrExists)(
    "S-02 patterns cover the expected deadkey ids (007e, 0060, 00a8, 005e)",
    () => {
      const kmnText = fs.readFileSync(kbdfrPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdfr");
      const { ir: out } = recognizePatterns(ir);

      const s02Patterns = out.recognizedPatterns.filter((p) => p.strategyId === "S-02");
      const deadkeyNames = s02Patterns
        .map((p) => p.questions.find((q) => q.id === "deadkeyName")?.default ?? "")
        .sort();

      // Each pattern is named after its deadkey id in hex (zero-padded to 4 digits,
      // uppercase) via the recognizer's deadkeyName() helper.
      expect(deadkeyNames).toEqual(
        ["dk_0060", "dk_005E", "dk_007E", "dk_00A8"].sort(),
      );
    },
  );

  it.skipIf(!kbdfrExists)(
    "the 0060 (grave) family uses RALT K_7 as its trigger key",
    () => {
      const kmnText = fs.readFileSync(kbdfrPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdfr");
      const { ir: out } = recognizePatterns(ir);

      const gravePattern = out.recognizedPatterns.find(
        (p) =>
          p.strategyId === "S-02" &&
          p.questions.find((q) => q.id === "deadkeyName")?.default === "dk_0060",
      );
      expect(gravePattern).toBeDefined();

      // The real kbdfr trigger is: + [RALT K_7] > dk(0060)
      const triggerKey = gravePattern!.questions.find((q) => q.id === "triggerKey")?.default;
      expect(triggerKey).toBe("RALT K_7");
    },
  );
});

// ---------------------------------------------------------------------------
// basic_kbdca — Canadian French
//
// Real keyboard structure:
//   - main group: many S-01-candidate rules + 5 deadkey trigger clusters:
//       RALT K_SLASH → dk(00b4)   (acute, single trigger)
//       K_QUOTE + SHIFT K_QUOTE → dk(0060)   (grave, 2 triggers)
//       K_LBRKT + SHIFT K_LBRKT → dk(005e)   (circumflex, 2 triggers)
//       K_RBRKT → dk(00b8)        (cedilla, single trigger)
//       SHIFT K_RBRKT → dk(00a8)  (diaeresis, single trigger)
//   - deadkeys group: 5 body rules (one per family)
//
// S-02 recognizer finds all 5 deadkey families.
// ---------------------------------------------------------------------------

describe("integration: recognizePatterns against real basic_kbdca source", () => {
  it.skipIf(!kbdcaExists)(
    "produces exactly 5 S-02 Patterns (one per deadkey family)",
    () => {
      const kmnText = fs.readFileSync(kbdcaPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdca");
      const { ir: out } = recognizePatterns(ir);

      const s02Patterns = out.recognizedPatterns.filter((p) => p.strategyId === "S-02");
      expect(s02Patterns).toHaveLength(5);
    },
  );

  it.skipIf(!kbdcaExists)(
    "recognizes multi-trigger grave pattern: triggerKey is [K_QUOTE] (unshifted primary)",
    () => {
      const kmnText = fs.readFileSync(kbdcaPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdca");
      const { ir: out } = recognizePatterns(ir);

      const gravePattern = out.recognizedPatterns.find(
        (p) =>
          p.strategyId === "S-02" &&
          p.questions.find((q) => q.id === "deadkeyName")?.default === "dk_0060",
      );
      expect(gravePattern).toBeDefined();

      // primary trigger is unshifted K_QUOTE (no modifiers); SHIFT K_QUOTE is the
      // secondary trigger — both own the same dk(0060) family.
      const triggerKey = gravePattern!.questions.find((q) => q.id === "triggerKey")?.default;
      expect(triggerKey).toBe("K_QUOTE");
    },
  );

  it.skipIf(!kbdcaExists)(
    "the grave pattern (0060) owns 3 rule nodes: 2 triggers + 1 body",
    () => {
      const kmnText = fs.readFileSync(kbdcaPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdca");
      const { ir: out } = recognizePatterns(ir);

      const gravePattern = out.recognizedPatterns.find(
        (p) =>
          p.strategyId === "S-02" &&
          p.questions.find((q) => q.id === "deadkeyName")?.default === "dk_0060",
      );
      expect(gravePattern).toBeDefined();

      const ruleNodes = (gravePattern!.ownedNodes ?? []).filter((n) => n.kind === "rule");
      // 2 trigger rules (K_QUOTE unshifted + SHIFT K_QUOTE) + 1 body rule = 3
      expect(ruleNodes).toHaveLength(3);
    },
  );

  it.skipIf(!kbdcaExists)(
    "the circumflex pattern (005e) also has 2 triggers (K_LBRKT + SHIFT K_LBRKT)",
    () => {
      const kmnText = fs.readFileSync(kbdcaPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdca");
      const { ir: out } = recognizePatterns(ir);

      const circumPattern = out.recognizedPatterns.find(
        (p) =>
          p.strategyId === "S-02" &&
          p.questions.find((q) => q.id === "deadkeyName")?.default === "dk_005E",
      );
      expect(circumPattern).toBeDefined();

      const ruleNodes = (circumPattern!.ownedNodes ?? []).filter((n) => n.kind === "rule");
      // 2 trigger rules + 1 body rule = 3
      expect(ruleNodes).toHaveLength(3);

      // unshifted K_LBRKT is the primary trigger
      const triggerKey = circumPattern!.questions.find((q) => q.id === "triggerKey")?.default;
      expect(triggerKey).toBe("K_LBRKT");
    },
  );
});
