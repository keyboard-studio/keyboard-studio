// Tests for the output version resolver (spec 094 research R1, contracts C1).
//
// Coverage:
//   - every row of the R1 table, for both tracks and every base shape;
//   - the unsupported shapes (P = 0.0[.x], non-integer, more than three parts);
//   - 1000 consecutive builds per shape: strictly increasing, all valid for
//     kmc-package, each above the replaced version and below the publish
//     version once test builds exist;
//   - `hasTestBuilds: false` reproduces today's publish behaviour exactly.

import { describe, it, expect } from "vitest";
import { resolvePublishVersion, resolveTestBuildVersion, type OutputVersionMode } from "./output-version.ts";
import { bumpKeyboardVersion } from "./adapt-staging.ts";

/** kmc-package's `isValidVersionNumber`. */
const KMC_VERSION_RE = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,2}$/;

/** Segment-wise numeric comparison (missing segments count as 0), as keyboard-lint's compareVersions. */
function compare(a: string, b: string): number {
  const pa = a.split(".").map((s) => BigInt(s));
  const pb = b.split(".").map((s) => BigInt(s));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0n;
    const y = pb[i] ?? 0n;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function testVersion(mode: OutputVersionMode, rawVersion: string, buildNumber: number): string {
  const r = resolveTestBuildVersion({ mode, rawVersion, buildNumber });
  if (!r.ok) throw new Error(`unexpected unsupported for ${mode} ${rawVersion}`);
  return r.version;
}

describe("resolveTestBuildVersion — R1 table", () => {
  it.each([
    // Track 2, one or two parts: V.N
    ["adapt-existing", "2", 1, "2.1"],
    ["adapt-existing", "2.3", 1, "2.3.1"],
    ["adapt-existing", "2.3", 2, "2.3.2"],
    // Track 2, three parts: a.b.(c+N)
    ["adapt-existing", "1.2.3", 1, "1.2.4"],
    ["adapt-existing", "1.2.3", 2, "1.2.5"],
    // Track 1, first segment >= 1: 0.N
    ["new-from-base", "1.0", 1, "0.1"],
    ["new-from-base", "2.3", 2, "0.2"],
    ["new-from-base", "1.2.3", 3, "0.3"],
    // Track 1, P = 0.b[.c] with b >= 1: 0.(b-1).N
    ["new-from-base", "0.5", 1, "0.4.1"],
    ["new-from-base", "0.1.7", 2, "0.0.2"],
  ] as const)("%s %s build %i -> %s", (mode, raw, n, expected) => {
    expect(testVersion(mode, raw, n)).toBe(expected);
  });

  it.each([
    ["new-from-base", "0"],
    ["new-from-base", "0.0"],
    ["new-from-base", "0.0.4"],
    ["adapt-existing", "1.0a"],
    ["new-from-base", "1.0a"],
    ["adapt-existing", "1.2.3.4"],
    ["new-from-base", "1.2.3.4"],
    ["adapt-existing", "1.02"],
    ["adapt-existing", ""],
  ] as const)("%s %j is unsupported", (mode, raw) => {
    expect(resolveTestBuildVersion({ mode, rawVersion: raw, buildNumber: 1 })).toEqual({
      ok: false,
      reason: "versionUnsupported",
    });
  });

  it("rejects a build number below 1 or not an integer", () => {
    expect(() => resolveTestBuildVersion({ mode: "adapt-existing", rawVersion: "2.3", buildNumber: 0 })).toThrow();
    expect(() => resolveTestBuildVersion({ mode: "adapt-existing", rawVersion: "2.3", buildNumber: 1.5 })).toThrow();
  });
});

describe("resolvePublishVersion", () => {
  it.each(["1.0", "1.0.2", "2.0", "2", "1.2.3", "not-a-version", "1.0.", "1.09", "10.4.99"])(
    "adapt %j without test builds equals bumpKeyboardVersion",
    (raw) => {
      expect(resolvePublishVersion({ mode: "adapt-existing", rawVersion: raw, hasTestBuilds: false })).toBe(
        bumpKeyboardVersion(raw),
      );
    },
  );

  it.each(["1.0", "2.3", "1.2.3", "0.0", "1.0a"])("copy %j passes through, with or without test builds", (raw) => {
    expect(resolvePublishVersion({ mode: "new-from-base", rawVersion: raw, hasTestBuilds: false })).toBe(raw);
    expect(resolvePublishVersion({ mode: "new-from-base", rawVersion: raw, hasTestBuilds: true })).toBe(raw);
  });

  it("bumps the middle segment of a tested three-part adapt base", () => {
    expect(resolvePublishVersion({ mode: "adapt-existing", rawVersion: "1.2.3", hasTestBuilds: true })).toBe("1.3.0");
    expect(resolvePublishVersion({ mode: "adapt-existing", rawVersion: "1.2.3", hasTestBuilds: false })).toBe("1.2.4");
  });

  it("leaves one- and two-part adapt bases as today even with test builds", () => {
    expect(resolvePublishVersion({ mode: "adapt-existing", rawVersion: "2.3", hasTestBuilds: true })).toBe("2.4");
    expect(resolvePublishVersion({ mode: "adapt-existing", rawVersion: "2", hasTestBuilds: true })).toBe("3");
  });
});

describe("1000 consecutive builds per shape", () => {
  const shapes: Array<[OutputVersionMode, string]> = [
    ["adapt-existing", "2"],
    ["adapt-existing", "2.3"],
    ["adapt-existing", "1.2.3"],
    ["adapt-existing", "0.0.9"],
    ["new-from-base", "1.0"],
    ["new-from-base", "7.4.2"],
    ["new-from-base", "0.3"],
    ["new-from-base", "0.1.7"],
  ];

  it.each(shapes)("%s %s: valid, strictly increasing, between V and P", (mode, raw) => {
    const publish = resolvePublishVersion({ mode, rawVersion: raw, hasTestBuilds: true });
    expect(publish).toMatch(KMC_VERSION_RE);
    let previous: string | null = null;
    for (let n = 1; n <= 1000; n++) {
      const v = testVersion(mode, raw, n);
      expect(v).toMatch(KMC_VERSION_RE);
      expect(compare(v, publish)).toBeLessThan(0);
      if (mode === "adapt-existing") expect(compare(v, raw)).toBeGreaterThan(0);
      if (previous !== null) expect(compare(previous, v)).toBeLessThan(0);
      previous = v;
    }
  });
});
