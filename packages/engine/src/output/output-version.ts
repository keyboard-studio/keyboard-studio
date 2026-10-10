// output-version — the one place a release version is decided at output
// (spec 094 research R1, contracts C1).
//
// Two answers come from here:
//   resolvePublishVersion   — the version a download or submission ships at.
//   resolveTestBuildVersion — the version test build N ships at.
//
// Every test-build version sorts strictly below the publish version (so the
// release upgrades a tester's install) and, on an adaptation, strictly above
// the version being replaced. Keyman's package compiler allows at most three
// parts, so a three-part adapt base has no room between a.b.c and a.b.(c+1):
// once it has test builds it publishes at a.(b+1).0 instead. Every other case
// publishes exactly as it did before test builds existed.

import { bumpKeyboardVersion } from "./adapt-staging.js";

export type OutputVersionMode = "new-from-base" | "adapt-existing";

/** kmc-package's `isValidVersionNumber`: one to three plain integer parts, no leading zeros. */
const PLAIN_VERSION_RE = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,2}$/;

/** Plain-integer segments of `version`, or null when it is not a version kmc-package accepts. */
function plainSegments(version: string): bigint[] | null {
  const trimmed = version.trim();
  if (!PLAIN_VERSION_RE.test(trimmed)) return null;
  return trimmed.split(".").map((s) => BigInt(s));
}

/**
 * The version a download or submission ships at.
 *
 * - Copy (`new-from-base`): the copied keyboard's own version, unchanged.
 * - Adapt with no test builds: `bumpKeyboardVersion`, exactly as before.
 * - Adapt with test builds and a plain three-part base a.b.c: a.(b+1).0.
 */
export function resolvePublishVersion(input: {
  mode: OutputVersionMode;
  rawVersion: string;
  hasTestBuilds: boolean;
}): string {
  const { mode, rawVersion, hasTestBuilds } = input;
  if (mode !== "adapt-existing") return rawVersion;
  if (hasTestBuilds) {
    const segments = plainSegments(rawVersion);
    if (segments !== null && segments.length === 3) {
      return `${segments[0]}.${segments[1]! + 1n}.0`;
    }
  }
  return bumpKeyboardVersion(rawVersion);
}

export type TestBuildVersionResult =
  | { ok: true; version: string }
  | { ok: false; reason: "versionUnsupported" };

/**
 * The version test build `buildNumber` (1, 2, 3, ...) ships at, or
 * `versionUnsupported` when no version fits below the publish version.
 *
 * - Adapt, V of one or two parts: V.N.
 * - Adapt, V = a.b.c: a.b.(c+N).
 * - Copy, P's first segment >= 1: 0.N.
 * - Copy, P = 0.b[.c] with b >= 1: 0.(b-1).N.
 * - Copy, P = 0, 0.0 or 0.0.x, or any version that is not plain dotted
 *   integers of at most three parts: unsupported.
 */
export function resolveTestBuildVersion(input: {
  mode: OutputVersionMode;
  rawVersion: string;
  buildNumber: number;
}): TestBuildVersionResult {
  const { mode, rawVersion, buildNumber } = input;
  if (!Number.isInteger(buildNumber) || buildNumber < 1) {
    throw new RangeError(`test build number must be an integer >= 1, got ${buildNumber}`);
  }
  const n = BigInt(buildNumber);
  const segments = plainSegments(rawVersion);
  if (segments === null) return { ok: false, reason: "versionUnsupported" };

  if (mode === "adapt-existing") {
    if (segments.length === 3) {
      return { ok: true, version: `${segments[0]}.${segments[1]}.${segments[2]! + n}` };
    }
    return { ok: true, version: `${segments.join(".")}.${n}` };
  }

  const [major, minor] = segments as [bigint, bigint | undefined];
  if (major >= 1n) return { ok: true, version: `0.${n}` };
  if (minor !== undefined && minor >= 1n) return { ok: true, version: `0.${minor - 1n}.${n}` };
  return { ok: false, reason: "versionUnsupported" };
}
