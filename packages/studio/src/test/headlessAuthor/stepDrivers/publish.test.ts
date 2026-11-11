// Publish step driver (spec 113): finishes without submitting a managed PR
// — the headless walk never performs a real network submission to the
// author's GitHub account — so `submitted` is false.

import { describe, expect, it } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { Case } from "../caseTypes.ts";
import { createRunReport } from "../runReport.ts";
import { publishDrivers } from "./publish.ts";

describe("publish driver", () => {
  it("finishes without submitting (submitted: false)", async () => {
    const report = createRunReport("publish-driver");
    const result = await publishDrivers["publish"]!({
      case: {} as Case,
      startIr: makeTestIR([]),
      report,
    });
    expect(result).toEqual({ submitted: false });
  });
});
