// The studio's regressed-keyboard list must agree with the committed
// verification record, and the lookup must only ever veto a regressed keyboard.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import regressedList from "./generated/normalizationRegressed.generated.json";
import { lookupNormalizationVerification } from "./normalizationVerification.ts";
import { NORMALIZATION_STEP_GENERATOR_VERSION } from "@keyboard-studio/engine/context-tolerance";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const RECORD = join(REPO_ROOT, "docs", "context-normalization-verification.json");

describe("lookupNormalizationVerification", () => {
  it("reports unknown for a keyboard the harness did not find regressed", () => {
    expect(lookupNormalizationVerification("no_such_keyboard_for_this_test")).toBe("unknown");
  });

  it("reports regressed for every id on the generated list", () => {
    for (const id of regressedList.regressed) {
      expect(lookupNormalizationVerification(id)).toBe("regressed");
    }
  });
});

describe("generated regressed list", () => {
  it("matches the committed verification record", async () => {
    expect(existsSync(RECORD), `committed verification record missing: ${RECORD}`).toBe(true);
    const codegen = (await import(pathToFileURL(join(REPO_ROOT, "scripts", "codegen-normalization-regressed.mjs")).href)) as {
      deriveRegressedList: (record: unknown) => unknown;
    };
    const record: unknown = JSON.parse(readFileSync(RECORD, "utf8"));
    expect(regressedList).toEqual(codegen.deriveRegressedList(record));
  });
});

describe("generated regressed list generator version", () => {
  it("was derived under the generator version the studio runs", () => {
    expect(regressedList.generatorVersion).toBe(NORMALIZATION_STEP_GENERATOR_VERSION);
  });
});
