// Touch classification (rows 5.1-5.15; task T072).
import { describe, expect, it } from "vitest";
import { parse } from "../../codec/index.js";
import { key, layout, platform } from "../__fixtures__/touchLayouts.js";
import { US_BASE } from "../__fixtures__/us-base.js";
import { resolveLdmlProfile } from "../profiles/resolve.js";
import type { CompatibilityItem, LdmlClassification } from "../types.js";
import { classifyForLdml } from "./classify.js";

const KMN = `store(&NAME) 'T'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'x'
`;

function classify(touch: ReturnType<typeof layout>): LdmlClassification {
  const { ir } = parse(KMN, "t");
  return classifyForLdml({ ir, touchLayout: touch, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"), { languages: ["en"] });
}

const row = (c: LdmlClassification, id: string): CompatibilityItem[] => c.items.filter((i) => i.rowId === id);

describe("classifyTouch", () => {
  const c = classify(
    layout(
      platform(
        "phone",
        {
          default: [[key("K_Q", { sk: [key("U_00E9"), key("K_E", { font: "Foo" })] }), key("K_E", { sk: [key("U_00E8")] }), key("K_BKSP"), key("K_SHIFT", { nextlayer: "shift" }), key("", { sp: 10, pad: 50 })]],
          shift: [[key("K_Q")]],
        },
        { font: "Charis", defaultHint: "dot" },
      ),
      platform("desktop", { default: [[key("K_A")]] }),
    ),
  );

  it("every phone key gets an item keyed touch:<platform>/<layer>/<key>", () => {
    for (const k of ["touch:phone/default/K_Q", "touch:phone/default/K_E", "touch:phone/shift/K_Q", "touch:phone/default/K_BKSP"]) {
      expect(c.items.some((i) => i.nodeKey === k && i.side === "touch"), k).toBe(true);
    }
  });

  it("5.3 desktop platform is a hint and exports nothing", () => {
    const i = row(c, "5.3")[0];
    expect(i?.code).toBe("KM_LINT_LDML_TOUCH_PRESENTATION");
    expect(i?.severity).toBe("hint");
    expect(c.items.some((x) => x.nodeKey.startsWith("touch:desktop/default"))).toBe(false);
  });

  it("5.8 gestures on a gesture target are a hint", () => {
    expect(row(c, "5.8").map((i) => i.nodeKey)).toEqual(["touch:phone/default/K_E"]);
  });

  it("5.11 font, hint and dk are hints", () => {
    const keys = row(c, "5.11").map((i) => i.nodeKey);
    expect(keys).toContain("touch:phone/-/-");
    expect(keys).toContain("touch:phone/default/K_Q");
    expect(row(c, "5.11").every((i) => i.severity === "hint" && i.code === "KM_LINT_LDML_TOUCH_PRESENTATION")).toBe(true);
  });

  it("5.13 backspace is an A hint; 5.12 layer key and 5.9 spacer map", () => {
    const bk = row(c, "5.13")[0];
    expect(bk?.status).toBe("A");
    expect(bk?.code).toBe("KM_LINT_LDML_TOUCH_SPECIAL_KEY");
    expect(bk?.severity).toBe("hint");
    expect(row(c, "5.12")[0]?.status).toBe("M");
    expect(row(c, "5.9")[0]?.status).toBe("M");
  });

  it("5.15 is one K item, stated once", () => {
    expect(row(c, "5.15")).toHaveLength(1);
    expect(row(c, "5.15")[0]?.status).toBe("K");
    expect(c.touchPresent).toBe(true);
  });

  it("a desktop-only layout has no touch form and no 5.15", () => {
    const d = classify(layout(platform("desktop", { default: [[key("K_A")]] })));
    expect(d.touchPresent).toBe(false);
    expect(row(d, "5.15")).toHaveLength(0);
  });
});
