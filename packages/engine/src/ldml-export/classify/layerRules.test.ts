// Layer-rule evaluation (rows 1.4a / 1.4b; FR-026), over the casing-template rules quoted in research R15.
import { describe, expect, it } from "vitest";
import { parse } from "../../codec/index.js";
import { buildCallGraph } from "./callGraph.js";
import { analyseLayerRules, touchLayerId, touchLayerModifiers } from "./layerRules.js";

const HEAD = `store(&NAME) 'T'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
begin NewContext > use(NewContext)
begin PostKeystroke > use(PostKeystroke)
store(sentencePunctuation) '.' '?' '!'
store(digit) '0123456789'
group(main) using keys
+ [K_A] > 'a'
group(NewContext) readonly
nomatch > use(detectStartOfSentence)
`;

// The chechen_latin casing template, reduced to its shape.
const POST = `group(PostKeystroke) readonly
if(&newLayer = "") if(&layer = 'numeric') any(digit) > context
if(&layer = 'caps') > context
if(&newLayer = "") > use(detectStartOfSentence)
group(detectStartOfSentence) readonly
nul > layer('shift')
any(sentencePunctuation) ' ' > layer('shift')
if(&layer = 'rightalt-shift') > layer('rightalt')
nomatch > layer('default')
`;

function rules(src: string, layers: string[]) {
  const { ir } = parse(HEAD + src, "t");
  return analyseLayerRules(ir, buildCallGraph(ir), layers);
}

describe("analyseLayerRules", () => {
  const r = rules(POST, ["default", "shift", "caps", "numeric", "rightalt-shift", "rightalt"]);

  it("one-shot shift: a key typed on shift returns to default", () => {
    expect(r.next("shift", "A")).toBe("default");
    expect(r.hasDecisions).toBe(true);
  });

  it("caps stays caps", () => {
    expect(r.next("caps", "A")).toBeNull();
  });

  it("numeric stays numeric after a digit, and returns to default otherwise", () => {
    expect(r.next("numeric", "5")).toBeNull();
    expect(r.next("numeric", "a")).toBe("default");
  });

  it("the default layer stays on default; rightalt-shift goes to rightalt", () => {
    expect(r.next("default", "a")).toBeNull();
    expect(r.next("rightalt-shift", "x")).toBe("rightalt");
  });

  it("text-dependent rules give one item per behaviour, named", () => {
    expect(r.behaviours.map((b) => b.name)).toEqual(["start-of-field", "start-of-sentence-shift"]);
    expect(r.behaviours[1]?.lost).toContain("start-of-sentence auto-shift");
  });

  it("a NewContext layer other than default is a loss", () => {
    const x = rules("group(PostKeystroke) readonly\nnomatch > layer('default')\n", ["default"]);
    expect(x.behaviours).toEqual([]);
    const { ir } = parse(HEAD.replace("nomatch > use(detectStartOfSentence)", "nomatch > layer('shift')") + "group(PostKeystroke) readonly\nnomatch > layer('default')\n", "t");
    const y = analyseLayerRules(ir, buildCallGraph(ir), ["default"]);
    expect(y.behaviours.map((b) => b.name)).toEqual(["focus-layer-shift"]);
  });
});

describe("touch layer names", () => {
  it("map to hardware modifiers and to LDML layer ids", () => {
    expect(touchLayerModifiers("default")).toEqual({ components: [], caps: false });
    expect(touchLayerModifiers("shift")).toEqual({ components: ["shift"], caps: false });
    expect(touchLayerModifiers("rightalt-shift")).toEqual({ components: ["altR", "shift"], caps: false });
    expect(touchLayerModifiers("caps")).toEqual({ components: [], caps: true });
    expect(touchLayerModifiers("numeric")).toEqual({ components: [], caps: false });
    expect(touchLayerId("default")).toBe("base");
    expect(touchLayerId("shift")).toBe("shift");
  });
});
