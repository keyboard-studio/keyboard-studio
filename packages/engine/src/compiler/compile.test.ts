import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const minimalKmnPath = resolve(here, "__fixtures__", "minimal.kmn");
const minimalKmn = readFileSync(minimalKmnPath, "utf8");

describe("compile() — kmc-kmn pipeline against minimal.kmn fixture", () => {
  it("produces a non-empty .kmx artifact", async () => {
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: minimalKmn, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const kmx = result.artifacts.find((a) => a.filename.endsWith(".kmx"));
    expect(kmx).toBeDefined();
    expect(kmx?.sizeBytes ?? 0).toBeGreaterThan(0);
  }, 30_000);

  it("emits no error- or fatal-severity diagnostics", async () => {
    const vfs = createVirtualFS([
      { path: "source/minimal.kmn", content: minimalKmn, isBinary: false },
    ]);
    const result = await compile(vfs, "minimal");

    const blocking = result.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "fatal",
    );
    expect(blocking).toEqual([]);
  }, 30_000);
});
