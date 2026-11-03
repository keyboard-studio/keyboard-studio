import { describe, expect, it } from "vitest";
import type { KvksIR } from "@keyboard-studio/contracts";
import { parseKvks } from "../codec/parse-kvks.js";
import { oskContinueResult } from "./complete-osk-step.js";

const MINIMAL: KvksIR = {
  kvksVersion: "10.0",
  kbdname: "test",
  layers: [{ shift: "", keys: [{ vkey: "K_A", label: "a", chars: "a" }] }],
  usealtgr: false,
  nodeIds: [],
};

describe("oskContinueResult", () => {
  it("returns undefined when kvks is null", () => {
    expect(oskContinueResult(null)).toBeUndefined();
  });

  it("returns emitKvks XML that round-trips", () => {
    const result = oskContinueResult(MINIMAL);
    expect(result).toBeDefined();
    expect(parseKvks(result!.kvksXml)).toMatchObject({
      kbdname: "test",
      layers: MINIMAL.layers,
    });
  });
});
