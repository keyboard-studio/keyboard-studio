import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { errorCodes, keymanCompile } from "./keymanCompile.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const sample = (name: string): string =>
  readFileSync(join(HERE, "fixtures", "cldr-samples", name), "utf8");

describe("keymanCompile (H1, H2)", () => {
  it("compiles the hardware sample with zero errors", async () => {
    const r = await keymanCompile(sample("fr.xml"));
    expect(errorCodes(r.messages)).toEqual([]);
    expect(r.ok).toBe(true);
  }, 30000);

  it("builds a kmx for the hardware sample", async () => {
    const r = await keymanCompile(sample("fr.xml"), { build: true });
    expect(errorCodes(r.messages)).toEqual([]);
    expect(r.kmx?.length ?? 0).toBeGreaterThan(0);
  }, 30000);

  it("reports a schema error for conformsTo 49", async () => {
    const xml = sample("fr.xml").replace(/conformsTo="\d+"/, 'conformsTo="49"');
    const r = await keymanCompile(xml);
    expect(r.ok).toBe(false);
    expect(errorCodes(r.messages)).toContain("ERROR_SchemaValidationError");
  }, 30000);
});
