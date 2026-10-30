// Drift guard (spec 107 FR-011, SC-004): the product functions the author
// calls (driftGuard.ts INVENTORY) are still there, so a proposal the UI uses
// cannot silently drop out of the author.
//
// Split with boundary.test.ts, which already proves each entry is imported by
// its production caller and by an author file (rule d). Here:
//   - every inventoried function is still exported by its module (a rename or
//     removal fails here, not as a vague walk difference later);
//   - step-proposal entries (PROPOSAL_INVENTORY) are imported only from
//     stepDrivers/: the loop, case input and reporting call no proposal.
//
// Default vitest config: no corpus needed.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INVENTORY, PROPOSAL_INVENTORY, type InventoryEntry } from "./driftGuard.ts";

const HA_DIR = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HA_DIR, "..", "..");

const toSrc = (abs: string): string => relative(SRC, abs).split("\\").join("/");

function walkTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) return walkTs(abs);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [abs] : [];
  });
}

/** Value imports by name, with the specifier resolved to a src-relative module or package. */
function namedValueImports(absFile: string): { name: string; module: string }[] {
  const text = readFileSync(absFile, "utf8");
  const out: { name: string; module: string }[] = [];
  for (const m of text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    if (m[1] !== undefined) continue;
    const spec = m[3]!;
    const module = spec.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(toSrc(absFile)), spec))
      : spec;
    for (const raw of m[2]!.split(",")) {
      const part = raw.trim();
      if (part === "" || part.startsWith("type ")) continue;
      out.push({ name: part.split(/\s+as\s+/)[0]!.trim(), module });
    }
  }
  return out;
}

async function loadModule(entry: InventoryEntry): Promise<Record<string, unknown>> {
  return entry.module.startsWith("@")
    ? ((await import(/* @vite-ignore */ entry.module)) as Record<string, unknown>)
    : ((await import(/* @vite-ignore */ resolve(SRC, entry.module))) as Record<string, unknown>);
}

describe("headless author drift guard (FR-011)", () => {
  it("every inventoried function is still exported by its module", async () => {
    const missing: string[] = [];
    for (const entry of INVENTORY) {
      const mod = await loadModule(entry);
      if (mod[entry.fn] === undefined) missing.push(`${entry.fn} from ${entry.module}`);
    }
    expect(missing, "renamed or removed product functions").toEqual([]);
  }, 120_000);

  it("only stepDrivers/ import step proposals", () => {
    const proposals = new Set(PROPOSAL_INVENTORY.map((e) => `${e.fn}@${e.module}`));
    const offenders: string[] = [];
    for (const abs of walkTs(HA_DIR)) {
      const path = toSrc(abs);
      if (path.startsWith("test/headlessAuthor/stepDrivers/")) continue;
      for (const imp of namedValueImports(abs)) {
        if (proposals.has(`${imp.name}@${imp.module}`)) offenders.push(`${path}: ${imp.name} from ${imp.module}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
