// FR-009 build-output check: the decisions demo (?demo=decisions) must be
// dev-only, so none of its code may appear in a production bundle.
//
// Slow (a full `vite build`, about a minute), so it is NOT part of the normal
// vitest run. CI runs it as an explicit step in the build job (ci.yml); run it
// locally with:
//
//   pnpm --filter @keyboard-studio/studio run verify:prod-bundle
//
// It builds into a throwaway outDir, then fails (exit 1) if any emitted file
// contains a string distinctive to DecisionsDemo.tsx. A positive control first
// proves those strings are still present in the demo source, so a rename can
// not turn this into a vacuous pass.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoSource = fs.readFileSync(
  path.join(studioRoot, "src/decisions/DecisionsDemo.tsx"),
  "utf-8",
);

const MARKERS = [
  "Decision as the only unit",
  "dependency-inspector",
  "managed-order-list",
  "managed-order-error",
];

const missing = MARKERS.filter((m) => !demoSource.includes(m));
if (missing.length > 0) {
  console.error(`[ERROR] marker(s) no longer in DecisionsDemo.tsx, update the list: ${missing.join(", ")}`);
  process.exit(1);
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-prod-bundle-"));
try {
  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "vite", "build", "--outDir", outDir, "--emptyOutDir"],
    { cwd: studioRoot, stdio: "inherit", shell: process.platform === "win32" },
  );

  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|css|html|map)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf-8");
        for (const m of MARKERS) if (text.includes(m)) hits.push(`${path.relative(outDir, full)}: ${m}`);
        if (/DecisionsDemo/i.test(entry.name)) hits.push(`${entry.name}: demo chunk emitted`);
      }
    }
  };
  walk(outDir);

  if (hits.length > 0) {
    console.error("[ERROR] decisions demo code is present in the production bundle (FR-009):");
    for (const h of hits) console.error(`  ${h}`);
    process.exit(1);
  }
  console.log("[OK] decisions demo is absent from the production bundle");
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
