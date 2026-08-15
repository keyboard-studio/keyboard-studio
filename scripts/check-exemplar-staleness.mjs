#!/usr/bin/env node
/**
 * Reports (never applies) when the exemplar source pins have fallen behind
 * upstream: a newer `cldr-misc-full` release on npm, or a newer commit on
 * `silnrsi/sldr`.
 *
 * Deliberately NOT part of the `prebuild` chain. If a staleness check could
 * change the pins, a routine `pnpm build` could silently regenerate the index
 * from different data underneath a review — the exact non-determinism the
 * pinning exists to prevent. Run it on purpose:
 *
 *   pnpm run check-exemplar-staleness
 *
 * Exit code is 0 whether or not a pin is stale — this is a report, not a gate.
 * A network failure is also non-fatal (reported as [WARN]); the check must
 * never be the reason an offline machine cannot work.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { httpGet } from "./lib/http-get.cjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLDR_PIN = join(HERE, "cldr-version.json");
const SLDR_PIN = join(HERE, "sldr-version.json");

async function getJson(url) {
  const buf = await httpGet(url, {
    redirects: true,
    headers: { "User-Agent": "keyboard-studio/check-exemplar-staleness", Accept: "application/json" },
  });
  return JSON.parse(buf.toString("utf8"));
}

let stale = 0;

// --- CLDR -------------------------------------------------------------------

const cldrPin = JSON.parse(readFileSync(CLDR_PIN, "utf8"));
try {
  const meta = await getJson(`https://registry.npmjs.org/${cldrPin.package}/latest`);
  if (meta.version === cldrPin.version) {
    console.log(`[OK] ${cldrPin.package} pinned at ${cldrPin.version} — current.`);
  } else {
    stale++;
    console.log(
      `[WARN] ${cldrPin.package} pinned at ${cldrPin.version}; npm latest is ${meta.version}.`,
    );
    console.log(
      `       To bump: edit scripts/cldr-version.json, set the same version in ` +
        `packages/engine/package.json, then pnpm install && pnpm run codegen-exemplars.`,
    );
  }
} catch (err) {
  console.warn(`[WARN] could not reach the npm registry: ${err.message}`);
}

// --- SLDR -------------------------------------------------------------------

const sldrPin = JSON.parse(readFileSync(SLDR_PIN, "utf8"));
try {
  const head = await getJson(`https://api.github.com/repos/${sldrPin.repo}/commits/master`);
  if (head.sha === sldrPin.commit) {
    console.log(`[OK] ${sldrPin.repo} pinned at ${sldrPin.commit.slice(0, 12)} — current.`);
  } else {
    stale++;
    console.log(
      `[WARN] ${sldrPin.repo} pinned at ${sldrPin.commit.slice(0, 12)}; ` +
        `master is ${String(head.sha).slice(0, 12)} (${head.commit?.author?.date ?? "unknown date"}).`,
    );
    console.log(
      `       To bump: set "commit" in scripts/sldr-version.json, then ` +
        `node scripts/fetch-sldr.mjs --compute-sha && pnpm run fetch-sldr && ` +
        `pnpm run codegen-exemplars. Review the index diff before committing.`,
    );
  }
} catch (err) {
  console.warn(`[WARN] could not reach the GitHub API: ${err.message}`);
}

console.log(
  stale === 0
    ? "[OK] exemplar pins are up to date."
    : `[WARN] ${stale} exemplar pin(s) behind upstream — nothing was changed.`,
);
