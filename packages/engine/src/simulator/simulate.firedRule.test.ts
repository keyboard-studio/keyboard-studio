/**
 * simulate() fired-rule enrichment tests (spec 082, Track A FR-002).
 *
 * Compiles the firedrule.kmn fixture once and asserts that every simulated
 * keystroke reports WHICH RULE FIRED via `SimulationStep.firedRule`:
 * a plain key→output rule, a context rule (`any(x) + [key]`), a blocking
 * rule (`> nul`), deadkey set/match rules, a `use()` delegation (innermost
 * rule wins), and the absent case (default-output fall-through).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CompileResult, SimKeyInput } from "@keyboard-studio/contracts";
import { compile } from "../compiler/index.js";
import { simulate } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const firedruleKmn = readFileSync(resolve(here, "__fixtures__", "firedrule.kmn"), "utf8");

const NOMATCH_KMN = `store(&NAME) 'NomatchProbe'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
store(&COPYRIGHT) 'test fixture'

begin Unicode > use(main)

group(main) using keys
+ [K_A] > 'a'
nomatch > nul
`;

function key(vkey: string): SimKeyInput {
  return { vkey, modifiers: [], caps: false };
}

describe("simulate() — firedRule enrichment", () => {
  let compiled: CompileResult;
  let nomatchCompiled: CompileResult;

  beforeAll(async () => {
    const vfs = createVirtualFS([
      { path: "source/firedrule.kmn", content: firedruleKmn, isBinary: false },
    ]);
    compiled = await compile(vfs, "firedrule");
    expect(compiled.success, "firedrule.kmn must compile").toBe(true);

    const vfs2 = createVirtualFS([
      { path: "source/nomatch.kmn", content: NOMATCH_KMN, isBinary: false },
    ]);
    nomatchCompiled = await compile(vfs2, "nomatch");
    expect(nomatchCompiled.success, "nomatch probe must compile").toBe(true);
  }, 60_000);

  it("identifies a plain key→output rule (main, rule 0)", () => {
    const result = simulate(compiled, [key("K_A")]);
    const step = result.trace[0]!;
    expect(step.outputAfter).toBe("a");
    expect(step.firedRule).toEqual({
      group: "main",
      ruleIndex: 0,
      matchedContext: "",
      emittedOutput: "a",
    });
  });

  it("identifies a context rule (main, rule 1) with matched context", () => {
    // K_A emits 'a'; K_B with 'a' in context fires any(vowel) + [K_B] > 'X'.
    const result = simulate(compiled, [key("K_A"), key("K_B")]);
    const step = result.trace[1]!;
    expect(step.outputAfter).toBe("X");
    expect(step.firedRule).toEqual({
      group: "main",
      ruleIndex: 1,
      matchedContext: "a",
      emittedOutput: "X",
    });
  });

  it("identifies a blocking rule (main, rule 2) emitting nothing", () => {
    const result = simulate(compiled, [key("K_C")]);
    const step = result.trace[0]!;
    expect(step.outputAfter).toBe("");
    expect(step.firedRule).toEqual({
      group: "main",
      ruleIndex: 2,
      matchedContext: "",
      emittedOutput: "",
    });
  });

  it("identifies deadkey set and deadkey-match rules (main, rules 4 and 3)", () => {
    // NOTE: kmc hoists the deadkey-match rule above the deadkey-setting rule
    // in the compiled group (see fixture header), so the ordinals are 4/3.
    const result = simulate(compiled, [key("K_E"), key("K_D")]);
    const setStep = result.trace[0]!;
    expect(setStep.pendingDeadkeys).toHaveLength(1);
    expect(setStep.firedRule).toMatchObject({ group: "main", ruleIndex: 4 });
    expect(setStep.firedRule!.emittedOutput).toBe("");

    const matchStep = result.trace[1]!;
    expect(matchStep.outputAfter).toBe("é");
    // The rule consumed a deadkey, not text, so matchedContext is empty —
    // deadkey matches carry no text context (documented limitation).
    expect(matchStep.firedRule).toEqual({
      group: "main",
      ruleIndex: 3,
      matchedContext: "",
      emittedOutput: "é",
    });
  });

  it("reports the innermost rule on use() delegation (second, rule 0)", () => {
    const result = simulate(compiled, [key("K_F")]);
    const step = result.trace[0]!;
    expect(step.outputAfter).toBe("F2");
    expect(step.firedRule).toEqual({
      group: "second",
      ruleIndex: 0,
      matchedContext: "",
      emittedOutput: "F2",
    });
  });

  it("leaves firedRule absent when no rule fires (default-output fall-through)", () => {
    const result = simulate(compiled, [key("K_Z")]);
    const step = result.trace[0]!;
    expect(step.outputAfter).toBe("z");
    expect(step.firedRule).toBeUndefined();
  });

  it("identifies a nomatch blocking rule (main, rule 1)", () => {
    const result = simulate(nomatchCompiled, [key("K_Z")]);
    const step = result.trace[0]!;
    expect(step.outputAfter).toBe("");
    expect(step.firedRule).toEqual({
      group: "main",
      ruleIndex: 1,
      matchedContext: "",
      emittedOutput: "",
    });
  });

  it("keeps firedRule per-step across a mixed sequence", () => {
    const result = simulate(compiled, [key("K_A"), key("K_C"), key("K_Z")]);
    expect(result.trace[0]!.firedRule).toMatchObject({ group: "main", ruleIndex: 0 });
    expect(result.trace[1]!.firedRule).toMatchObject({ group: "main", ruleIndex: 2 });
    expect(result.trace[2]!.firedRule).toBeUndefined();
    expect(result.finalOutput).toBe("az");
  });
});
