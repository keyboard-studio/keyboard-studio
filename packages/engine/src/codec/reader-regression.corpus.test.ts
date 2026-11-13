/**
 * Holds the .kmn reader to the numbers of the final reader comparison
 * (specs/116-ng-parser-adoption/evidence/reader-differential.md),
 * so later drift fails. Over every corpus .kmn (root: env KS_KEYBOARDS, else
 * the sibling `keyboards` checkout) and every engine `.kmn` fixture:
 *   1. the fragment count per opaque reason equals the report's "Phase 6 (US3)" After column
 *      (the final comparison's New column, moved by the typed members of spec 116 phase 6);
 *   2. the comment count per anchor equals the report's "Phase 6 (US3)" After column;
 *   3. every rule line the grammar rejects is an allow-list.json entry, and
 *      every entry is still used;
 *   4. no file fails to import.
 * A change that moves a count on purpose updates the report in the same commit.
 * Without the corpus only check 3 runs, on the fixtures, with a [WARN].
 * With a PARTIAL corpus (CI checks out release/ only) check 3 runs over the
 * files actually walked — an entry for a file the checkout does not contain
 * cannot be used, so it is skipped, not failed — and checks 1-2 are skipped
 * with a [WARN]: the report's Phase 6 numbers cover the full release +
 * experimental corpus, so a release-only walk cannot match them. A full
 * local corpus checkout runs every check.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { lowerDetailed } from "./lower.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));
// CI's corpus checkout is release/ only (see .github/workflows/ci.yml:
// "Checkout keyboard-studio/keyboards corpus (pinned, release/ only,
// shallow)"), while the report's Phase 6 numbers cover release +
// experimental. The count checks below only run on a complete corpus.
const experimentalExists = fs.existsSync(path.join(ROOT, "experimental"));
const corpusComplete = rootExists && experimentalExists;
const EVIDENCE_DIR = path.resolve(__dir, "../../../../specs/116-ng-parser-adoption/evidence");
const ENGINE_SRC = path.resolve(__dir, "..");

if (!rootExists) {
  console.warn(`[WARN] keyboards corpus not found at ${ROOT}; checking engine fixtures' rejected lines only`);
}

const allowList = JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, "allow-list.json"), "utf8")) as {
  entries: Array<{ file: string; line: number }>;
};
const report = fs.readFileSync(path.join(EVIDENCE_DIR, "reader-differential.md"), "utf8");

/** The last column of the report table under the heading line `heading` (hashes included), keyed by its first column. */
function reportColumn(heading: string): Map<string, number> {
  const section = report.split(`\n${heading}\n`)[1]?.split("\n#")[0] ?? "";
  const out = new Map<string, number>();
  for (const m of section.matchAll(/^\| `([^`]+)` \| \d+ \| (\d+) \|$/gm)) {
    if (m[2] !== "0") out.set(m[1]!, Number(m[2]));
  }
  return out;
}

function* walkKmn(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "build" && e.name !== "dist") yield* walkKmn(full);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".kmn")) {
      yield full;
    }
  }
}

function sources(): Array<{ key: string; file: string }> {
  const out: Array<{ key: string; file: string }> = [];
  if (rootExists) {
    for (const tree of ["release", "experimental"]) {
      for (const f of walkKmn(path.join(ROOT, tree))) out.push({ key: path.relative(ROOT, f).split(path.sep).join("/"), file: f });
    }
  }
  for (const f of walkKmn(ENGINE_SRC)) {
    if (f.split(path.sep).includes("__fixtures__")) {
      out.push({ key: `fixture:${path.relative(ENGINE_SRC, f).split(path.sep).join("/")}`, file: f });
    }
  }
  return out;
}

const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1);
const sorted = (m: Map<string, number>): Array<[string, number]> => [...m].sort(([a], [b]) => (a < b ? -1 : 1));

describe(".kmn reader holds the final comparison's numbers (corpus and fixtures)", () => {
  it("matches the report's fragment and comment counts and rejects only allow-listed lines", () => {
    const failures: string[] = [];
    const reasons = new Map<string, number>();
    const anchors = new Map<string, number>();
    const entries = new Set(allowList.entries.map((e) => `${e.file}:${e.line}`));
    const used = new Set<string>();
    // Files actually walked: on a partial corpus (release/ only) an
    // allow-list entry for an unwalked file cannot be used, and must not
    // fail — its file simply is not in this checkout (main CI run
    // 43140522180 failed the two experimental/gff entries this way).
    const walked = new Set<string>();

    for (const { key, file } of sources()) {
      walked.add(key);
      let r: ReturnType<typeof lowerDetailed>;
      try {
        r = lowerDetailed(fs.readFileSync(file, "utf8"), "kbd");
      } catch (e) {
        failures.push(`${key}: import fails: ${String(e)}`);
        continue;
      }
      for (const f of r.ir.raw) bump(reasons, f.reason);
      for (const c of r.ir.comments) bump(anchors, c.anchor);
      for (const line of r.rejectedLines) {
        const k = `${key}:${line}`;
        if (entries.has(k)) used.add(k);
        else failures.push(`${k}: grammar rejects a line that is not in allow-list.json`);
      }
    }
    for (const e of allowList.entries) {
      const k = `${e.file}:${e.line}`;
      // Fixture entries are always checked: fixtures live in-repo, so a
      // missing one is a stale entry, not a partial corpus.
      if ((walked.has(e.file) || e.file.startsWith("fixture:")) && !used.has(k)) {
        failures.push(`allow-list entry unused: ${k}`);
      }
    }

    expect(failures).toEqual([]);
    if (corpusComplete) {
      expect(sorted(reasons)).toEqual(sorted(reportColumn("### Phase 6 fragment reasons")));
      expect(sorted(anchors)).toEqual(sorted(reportColumn("### Phase 6 comments by anchor")));
    } else if (rootExists) {
      console.warn(
        `[WARN] experimental/ not in the corpus at ${ROOT}; skipping the report's fragment/comment count checks (their Phase 6 numbers cover the full release + experimental corpus)`,
      );
    }
  }, 900_000);
});
