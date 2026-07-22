import { describe, expect, it } from "vitest";
import { parse } from "../codec/parse.js";

const parseKmn = (src: string) => parse(src, "uniformity_fixture");
import {
  checkNormalizationUniformity,
  MARK_NORMALIZATION_UNIFORM_CODE,
} from "./layer-b-uniformity.js";
import { validateWithOracle } from "./oracle.js";

const ACUTE = "́";

function kmn(lines: string[]): string {
  return [
    'store(&NAME) "Uniformity fixture"',
    "begin Unicode > use(main)",
    "group(main) using keys",
    ...lines,
    "",
  ].join("\n");
}

describe("checkNormalizationUniformity (FR-022)", () => {
  it("passes a keyboard whose mark-bearing output is uniformly ready-made", () => {
    const { ir } = parseKmn(kmn(['+ "a" > "é"', '+ "b" > "à"']));
    expect(checkNormalizationUniformity(ir)).toEqual([]);
  });

  it("passes a keyboard whose mark-bearing output is uniformly base-plus-mark", () => {
    const { ir } = parseKmn(kmn([`+ "a" > "e${ACUTE}"`, `+ "b" > "a${ACUTE}"`]));
    expect(checkNormalizationUniformity(ir)).toEqual([]);
  });

  it("passes a keyboard with no mark-bearing output at all", () => {
    const { ir } = parseKmn(kmn(['+ "a" > "b"']));
    expect(checkNormalizationUniformity(ir)).toEqual([]);
  });

  it("flags a keyboard that mixes the two forms (one aggregate finding, layer B)", () => {
    const { ir } = parseKmn(kmn(['+ "a" > "é"', `+ "b" > "e${ACUTE}"`]));
    const findings = checkNormalizationUniformity(ir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe(MARK_NORMALIZATION_UNIFORM_CODE);
    expect(findings[0]?.layer).toBe("B");
    expect(findings[0]?.severity).toBe("warning");
  });

  it("counts non-system store contents (stores feed outputs via index/outs)", () => {
    const { ir } = parseKmn(
      [
        'store(&NAME) "Uniformity fixture"',
        `store(accented) "é" "e${ACUTE}"`,
        "begin Unicode > use(main)",
        "group(main) using keys",
        '+ "a" > "b"',
        "",
      ].join("\n"),
    );
    expect(checkNormalizationUniformity(ir)).toHaveLength(1);
  });

  it("ignores system stores (a copyright accent is not output evidence)", () => {
    const { ir } = parseKmn(
      [
        'store(&NAME) "Café keyboard"',
        "begin Unicode > use(main)",
        "group(main) using keys",
        `+ "a" > "e${ACUTE}"`,
        "",
      ].join("\n"),
    );
    expect(checkNormalizationUniformity(ir)).toEqual([]);
  });

  it("runs inside the single validateWithOracle cycle (reference group)", async () => {
    const findings = await validateWithOracle(kmn(['+ "a" > "é"', `+ "b" > "e${ACUTE}"`]), {
      groups: ["reference"],
    });
    expect(findings.some((f) => f.code === MARK_NORMALIZATION_UNIFORM_CODE)).toBe(true);
  });
});
