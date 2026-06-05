import { describe, it, expect } from "vitest";
import {
  _createOracle,
  _createOracleWithLoader,
  validateWithOracle,
} from "./oracle.js";
import { OracleLoadError } from "./OracleLoadError.js";
import type { WasmOracleHandle, RawWasmFinding } from "./wasmLoader.js";
import type { GroupName } from "./types.js";

// Mock handle factory — returns a WasmOracleHandle that emits a scripted
// set of RawWasmFindings on every call. Records the (source, groups)
// pairs it received for assertion.
function mockHandle(
  emit: RawWasmFinding[] | ((groups: readonly GroupName[]) => RawWasmFinding[])
): {
  handle: WasmOracleHandle;
  calls: Array<{ source: string; groups: readonly GroupName[] }>;
} {
  const calls: Array<{ source: string; groups: readonly GroupName[] }> = [];
  const handle: WasmOracleHandle = {
    async lintWasmGroups(source, groups) {
      calls.push({ source, groups });
      return typeof emit === "function" ? emit(groups) : emit;
    },
    dispose() {
      /* no-op */
    },
  };
  return { handle, calls };
}

// A small known-bad source. The TS-portable checks (currently the
// `lexical` group) need something to actually flag — `store(bad name)`
// triggers KM_ERROR_INVALID_IDENTIFIER and double-`store(MyStore)`
// triggers KM_ERROR_DUPLICATE_STORE.
const knownBadSource = [
  'store(MyStore) "a"',
  'store(MyStore) "b"',
  "group(bad name)",
].join("\n");

describe("validateWithOracle (default oracle, WASM stubbed out)", () => {
  it("AC#4: compiling a known-bad fixture surfaces at least one expected diagnostic", async () => {
    const findings = await validateWithOracle(knownBadSource);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
    expect(codes).toContain("KM_ERROR_INVALID_IDENTIFIER");
  });

  it("appends KM_WARN_ORACLE_UNAVAILABLE once when WASM load fails", async () => {
    const downOracle = _createOracle(null);
    const findings = await downOracle.lint(knownBadSource);
    const unavailable = findings.filter(
      (f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE"
    );
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]?.severity).toBe("warning");
    expect(unavailable[0]?.layer).toBe("A");
  });

  it("does not throw OracleLoadError to the caller (degraded mode swallows it)", async () => {
    await expect(
      validateWithOracle(knownBadSource)
    ).resolves.toBeDefined();
  });

  it("skips KM_WARN_ORACLE_UNAVAILABLE when only TS-only groups are requested", async () => {
    const findings = await validateWithOracle(knownBadSource, {
      groups: ["lexical"],
    });
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_WARN_ORACLE_UNAVAILABLE");
    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
  });

  it("throws TypeError for an unknown group name", async () => {
    await expect(
      validateWithOracle(knownBadSource, {
        // @ts-expect-error testing runtime guard against bad input
        groups: ["lexical", "nonsense"],
      })
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe("_createOracle with a live mock WASM handle", () => {
  it("translates known kmcmplib codes through CODE_MAP", async () => {
    const { handle } = mockHandle([
      {
        kmcmpCode: "HINT_UnreachableRule",
        line: 3,
        column: 1,
        text: "shadowed",
      },
    ]);
    const oracle = _createOracle(handle);
    const findings = await oracle.lint("group(main)\n", { groups: ["behavior"] });
    const behaviorFindings = findings.filter((f) =>
      f.code.startsWith("KM_HINT_")
    );
    expect(behaviorFindings.length).toBeGreaterThan(0);
    expect(behaviorFindings[0]?.code).toBe("KM_HINT_UNREACHABLE_RULE");
  });

  it("filters WASM findings by the requested groups", async () => {
    // Emit one finding that maps to `behavior` and one that maps to
    // `passthrough`. Caller asks only for `behavior`.
    const { handle } = mockHandle([
      { kmcmpCode: "HINT_UnreachableRule", line: 1, text: "behavior-bound" },
      { kmcmpCode: "WARN_SomethingNew", line: 2, text: "passthrough-bound" },
    ]);
    const oracle = _createOracle(handle);
    const findings = await oracle.lint("source", { groups: ["behavior"] });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_HINT_UNREACHABLE_RULE");
    expect(codes).not.toContain("KM_WARN_KMCMP_SOMETHINGNEW");
  });

  it("returns passthrough findings when group: passthrough is requested", async () => {
    const { handle } = mockHandle([
      { kmcmpCode: "WARN_SomethingNew", line: 2, text: "passthrough-bound" },
    ]);
    const oracle = _createOracle(handle);
    const findings = await oracle.lint("source", { groups: ["passthrough"] });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_WARN_KMCMP_SOMETHINGNEW");
  });

  it("calls the WASM handle once per lint() invocation", async () => {
    const { handle, calls } = mockHandle([]);
    const oracle = _createOracle(handle);
    await oracle.lint("source");
    expect(calls).toHaveLength(1);
  });

  it("does not call the WASM handle when only TS-only groups are requested", async () => {
    const { handle, calls } = mockHandle([
      { kmcmpCode: "HINT_UnreachableRule", line: 1, text: "x" },
    ]);
    const oracle = _createOracle(handle);
    await oracle.lint("source", { groups: ["lexical"] });
    expect(calls).toHaveLength(0);
  });

  it("merges TS-portable findings with WASM findings, sorted by severity", async () => {
    const { handle } = mockHandle([
      { kmcmpCode: "HINT_UnreachableRule", line: 5, text: "hint-finding" },
    ]);
    const oracle = _createOracle(handle);
    const findings = await oracle.lint(knownBadSource);
    expect(findings[0]?.severity).toBe("error");
    const severities = findings.map((f) => f.severity);
    expect(severities).toContain("error");
    expect(severities).toContain("hint");
    // Errors must come before hints in the sorted output.
    const firstHintIdx = severities.indexOf("hint");
    const firstErrorIdx = severities.indexOf("error");
    expect(firstErrorIdx).toBeLessThan(firstHintIdx);
  });

  it("does not append KM_WARN_ORACLE_UNAVAILABLE when WASM is up", async () => {
    const { handle } = mockHandle([]);
    const oracle = _createOracle(handle);
    const findings = await oracle.lint(knownBadSource);
    const codes = findings.map((f) => f.code);
    expect(codes).not.toContain("KM_WARN_ORACLE_UNAVAILABLE");
  });
});

describe("_createOracle(null) — simulating WASM-down", () => {
  it("returns TS-only findings plus KM_WARN_ORACLE_UNAVAILABLE", async () => {
    const oracle = _createOracle(null);
    const findings = await oracle.lint(knownBadSource);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
    expect(codes).toContain("KM_WARN_ORACLE_UNAVAILABLE");
    expect(
      findings.filter((f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE")
    ).toHaveLength(1);
  });
});

describe("_createOracleWithLoader — loader rejection path", () => {
  // Exercises the `.catch` in makeOracle()'s lazy init: a LoadHandle that
  // rejects with a typed OracleLoadError must be absorbed (no throw to
  // caller) and must flip the oracle into degraded mode (TS-only findings
  // + KM_WARN_ORACLE_UNAVAILABLE).
  it("absorbs OracleLoadError from a failing loader and degrades to TS-only + KM_WARN_ORACLE_UNAVAILABLE", async () => {
    const failingLoader = () =>
      Promise.reject<WasmOracleHandle>(
        new OracleLoadError(
          "synthetic: kmcmplib module unavailable",
          "wasm-load-failed"
        )
      );
    const oracle = _createOracleWithLoader(failingLoader);

    // Should not throw — degraded mode swallows OracleLoadError.
    const findings = await oracle.lint(knownBadSource);

    const codes = findings.map((f) => f.code);
    expect(codes).toContain("KM_WARN_ORACLE_UNAVAILABLE");
    // TS-portable findings still flow through.
    expect(codes).toContain("KM_ERROR_DUPLICATE_STORE");
    // Exactly one degraded-mode warning per call.
    expect(
      findings.filter((f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE")
    ).toHaveLength(1);
  });
});
