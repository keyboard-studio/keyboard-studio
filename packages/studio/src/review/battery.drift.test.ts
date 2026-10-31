// battery.drift.test — the /review battery's auto-update guard.
//
// The battery is computed by scripts/generate-review-battery.mjs from the
// single sources of truth (criteria catalog, IMPLEMENTED_LINT_CODES,
// PRECERTIFIED_LINT_CODES, check-source `code:` literals). This test
// regenerates it in-memory and diffs against the checked-in
// battery.generated.json. Adding a consistency check later fails this test
// until the JSON is regenerated — the battery can never silently go stale.
//
// To update after a legitimate change:
//   node scripts/generate-review-battery.mjs

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../../..");
const CHECKED_IN = join(here, "battery.generated.json");

function regenerate(): Record<string, unknown> {
  const out = execFileSync(
    "node",
    [join(ROOT, "scripts/generate-review-battery.mjs"), "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

describe("review battery drift", () => {
  it("matches the checked-in generated battery", () => {
    const fresh = regenerate();
    const checked = JSON.parse(readFileSync(CHECKED_IN, "utf8"));
    // generatedAt is a timestamp, not content.
    const { generatedAt: _fresh, ...freshRest } = fresh;
    const { generatedAt: _checked, ...checkedRest } = checked;
    expect(freshRest).toEqual(checkedRest);
  });

  it("covers every catalog criterion exactly once", () => {
    const fresh = regenerate() as { catalogSize: number; criteria: Array<{ id: string }> };
    expect(fresh.catalogSize).toBe(188);
    const ids = fresh.criteria.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
