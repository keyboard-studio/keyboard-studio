import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { stripDefaultNamespace, validateAgainstCldr } from "./xsdValidate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const sample = (name: string): string =>
  readFileSync(join(HERE, "fixtures", "cldr-samples", name), "utf8");

describe("validateAgainstCldr (H3)", () => {
  it.each(["fr.xml", "fr-t-k0-test.xml"])("%s validates under 46", async (name) => {
    expect(await validateAgainstCldr(sample(name), "46")).toEqual([]);
  });

  it("rejects an unknown element", async () => {
    const bad = sample("fr.xml").replace("</keyboard3>", "<bogusElement/></keyboard3>");
    const errors = await validateAgainstCldr(bad, "46");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("removes the default xmlns only", () => {
    const out = stripDefaultNamespace('<keyboard3 xmlns="urn:x" locale="a">');
    expect(out).toBe('<keyboard3 locale="a">');
  });
});
