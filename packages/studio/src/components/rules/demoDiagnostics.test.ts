import { describe, expect, it } from "vitest";
import type { CompilerDiagnostic } from "@keyboard-studio/contracts";
import {
  CODE_UNREACHABLE_RULE,
  groupDemoDiagnostics,
  totalDemoDiagnostics,
} from "./demoDiagnostics.ts";

function diag(
  code: CompilerDiagnostic["code"],
  severity: CompilerDiagnostic["severity"],
  line?: number,
  message = "msg",
): CompilerDiagnostic {
  return {
    code,
    severity,
    layer: "A",
    message,
    ...(line !== undefined ? { location: { file: "a.kmn", line } } : {}),
  };
}

const HINT = CODE_UNREACHABLE_RULE;
const INFO = "KM_INFO_KMCMP_2125830";

describe("demoDiagnostics", () => {
  it("drops info severity but keeps errors in the 0x7000 namespace", () => {
    const groups = groupDemoDiagnostics([
      diag(INFO, "info"),
      diag("KM_ERROR_KMCMP_5271044", "error"),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["KM_ERROR_KMCMP_5271044"]);
  });

  it("includes info when asked", () => {
    expect(groupDemoDiagnostics([diag(INFO, "info")], { includeInfo: true })).toHaveLength(1);
  });

  it("groups identical codes with a count and sorted distinct lines", () => {
    const input = [
      ...Array.from({ length: 353 }, (_, i) => diag(HINT, "hint", 353 - i)),
      diag(INFO, "info"),
    ];
    const groups = groupDemoDiagnostics(input);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(353);
    expect(groups[0]?.lines.slice(0, 3)).toEqual([1, 2, 3]);
    expect(totalDemoDiagnostics(groups)).toBe(353);
  });

  it("counts the desktop and web compiler passes once", () => {
    const once = Array.from({ length: 20 }, (_, i) => diag(HINT, "hint", i + 1));
    const groups = groupDemoDiagnostics([...once, ...once]);
    expect(groups[0]?.count).toBe(20);
    expect(groups[0]?.lines).toHaveLength(20);
  });

  it("keeps the first diagnostic as the representative", () => {
    const groups = groupDemoDiagnostics([
      diag("KM_WARN_KMCMP_4000001", "warning", undefined, "first"),
      diag("KM_WARN_KMCMP_4000001", "warning", undefined, "second"),
    ]);
    expect(groups[0]).toMatchObject({ count: 2, lines: [] });
    expect(groups[0]?.representative.message).toBe("first");
  });
});
