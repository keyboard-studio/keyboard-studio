import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadLdml, type LdmlKeystroke } from "./ldmlInterpreter.js";

const NS = "https://schemas.unicode.org/cldr/49/keyboard3";

function doc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<keyboard3 xmlns="${NS}" locale="en" conformsTo="49">${body}</keyboard3>`;
}

const k = (vkey: string, modifiers: readonly string[] = [], caps = false): LdmlKeystroke => ({
  vkey,
  modifiers,
  caps,
});

const HW = `
<keys>
  <key id="a" output="a"/><key id="A" output="A"/><key id="b" output="b"/>
  <key id="e" output="e"/><key id="o" output="o"/><key id="dot" output="."/>
  <key id="grave" output="\`"/><key id="acute" output="\\u{B4}"/>
  <key id="cap-a" output="\\u{C5}"/>
</keys>
<layers formId="us">
  <layer modifiers="none">
    <row keys="grave"/>
    <row keys="gap gap e gap gap gap gap gap o"/>
    <row keys="a gap gap gap gap gap gap gap gap gap acute"/>
    <row keys="gap gap gap gap b"/>
    <row keys="space"/>
  </layer>
  <layer modifiers="shift">
    <row keys="gap"/>
    <row keys="gap"/>
    <row keys="A"/>
  </layer>
  <layer modifiers="none caps">
    <row keys="gap"/>
    <row keys="gap"/>
    <row keys="cap-a"/>
  </layer>
  <layer modifiers="alt">
    <row keys="gap"/>
    <row keys="gap"/>
    <row keys="dot"/>
  </layer>
</layers>`;

describe("ldmlInterpreter: hardware key map", () => {
  const x = loadLdml(doc(HW));
  it("maps positions by layer with exact modifier match", () => {
    expect(x.type([k("K_A")])).toBe("a");
    expect(x.type([k("K_A", ["shift"])])).toBe("A");
    expect(x.type([k("K_A", ["altR"])])).toBe(".");
    expect(x.type([k("K_A", ["ctrl"])])).toBe("");
    expect(x.type([k("K_SPACE")])).toBe(" ");
  });
  it("selects caps layers", () => {
    expect(x.type([k("K_A", [], true)])).toBe("\u00C5");
  });
  it("types nothing for gaps and unmatched positions", () => {
    expect(x.type([k("K_Q"), k("K_Z")])).toBe("");
  });
  it("resolves the iso grid (K_OE2 and K_BKSLASH)", () => {
    const iso = loadLdml(
      doc(`<keys><key id="x" output="x"/><key id="y" output="y"/></keys>
      <layers formId="iso"><layer modifiers="none">
        <row keys="gap"/><row keys="gap"/>
        <row keys="gap gap gap gap gap gap gap gap gap gap gap y"/>
        <row keys="x"/>
      </layer></layers>`),
    );
    expect(iso.type([k("K_oE2"), k("K_BKSLASH")])).toBe("xy");
  });
});

describe("ldmlInterpreter: simple transforms", () => {
  it("applies the first matching transform per group, groups in order", () => {
    const x = loadLdml(
      doc(`${HW}
      <transforms type="simple">
        <transformGroup>
          <transform from="ab" to="X"/>
          <transform from="b" to="Y"/>
        </transformGroup>
        <transformGroup>
          <transform from="X" to="Z"/>
        </transformGroup>
      </transforms>`),
    );
    expect(x.type([k("K_A"), k("K_B")])).toBe("Z"); // group 1 ab->X, group 2 X->Z
    expect(x.type([k("K_B")])).toBe("Y");
  });

  it("runs the groups after each outputting key", () => {
    const x = loadLdml(
      doc(`${HW}
      <transforms type="simple"><transformGroup>
        <transform from="a" to="b"/>
      </transformGroup></transforms>`),
    );
    expect(x.type([k("K_A"), k("K_A")])).toBe("bb");
  });

  it("uses ${str} variables in from and to", () => {
    const x = loadLdml(
      doc(`${HW}
      <variables><string id="g" value="\`"/><string id="out" value="\\u{E0}"/></variables>
      <transforms type="simple"><transformGroup>
        <transform from="\${g}a" to="\${out}"/>
      </transformGroup></transforms>`),
    );
    expect(x.type([k("K_BKQUOTE"), k("K_A")])).toBe("\u00E0");
  });

  it("supports $[set] and $[1:set] mapping", () => {
    const x = loadLdml(
      doc(`${HW}
      <variables>
        <set id="v" value="a e o"/><set id="gv" value="\\u{E0} \\u{E8} \\u{F2}"/>
      </variables>
      <transforms type="simple"><transformGroup>
        <transform from="\`($[v])" to="$[1:gv]"/>
      </transformGroup></transforms>`),
    );
    expect(x.type([k("K_BKQUOTE"), k("K_E")])).toBe("\u00E8");
    expect(x.type([k("K_BKQUOTE"), k("K_O")])).toBe("\u00F2");
    expect(x.type([k("K_BKQUOTE"), k("K_B")])).toBe("`b");
  });

  it("supports classes, negated classes and numbered captures", () => {
    const x = loadLdml(
      doc(`${HW}
      <transforms type="simple"><transformGroup>
        <transform from="([ae])b" to="$1$1"/>
        <transform from="([^ae])\\u{B4}" to="[$1]"/>
      </transformGroup></transforms>`),
    );
    expect(x.type([k("K_E"), k("K_B")])).toBe("ee");
    expect(x.type([k("K_B"), k("K_A", [], false)])).toBe("ba");
    const y = loadLdml(
      doc(`${HW}
      <transforms type="simple"><transformGroup>
        <transform from="([^ae])\\u{B4}" to="[$1]"/>
      </transformGroup></transforms>`),
    );
    expect(y.type([k("K_B"), k("K_BKQUOTE")])).toBe("b`");
    expect(y.type([], "b\u00B4")).toBe("b\u00B4"); // only runs after an outputting key
    expect(y.type([k("K_SPACE")], "b\u00B4")).toBe("b\u00B4 ");
  });

  it("escapes $ in to", () => {
    const x = loadLdml(
      doc(`${HW}
      <transforms type="simple"><transformGroup>
        <transform from="b" to="$$1"/>
      </transformGroup></transforms>`),
    );
    expect(x.type([k("K_B")])).toBe("$1");
  });
});

describe("ldmlInterpreter: markers", () => {
  const body = `${HW}
  <keys><key id="dk" output="\\m{acc}"/></keys>
  <transforms type="simple"><transformGroup>
    <transform from="\\m{acc}a" to="\\u{E0}"/>
    <transform from="\\m{acc}e" to="\\u{E8}"/>
  </transformGroup></transforms>`;
  // dk is not on a layer in HW; add a layer position via a second doc.
  const x = loadLdml(
    doc(
      body.replace(
        '<row keys="grave"/>',
        '<row keys="dk"/>',
      ),
    ),
  );
  it("matches a marker followed by a key and consumes it", () => {
    expect(x.type([k("K_BKQUOTE"), k("K_A")])).toBe("\u00E0");
    expect(x.type([k("K_BKQUOTE"), k("K_E")])).toBe("\u00E8");
  });
  it("never leaves a marker in the output", () => {
    expect(x.type([k("K_BKQUOTE"), k("K_B")])).toBe("b");
    expect(x.type([k("K_BKQUOTE")])).toBe("");
  });
});

describe("ldmlInterpreter: backspace", () => {
  const x = loadLdml(
    doc(`${HW}
    <transforms type="backspace"><transformGroup>
      <transform from="\\u{C5}" to="a"/>
    </transformGroup></transforms>`),
  );
  it("applies a backspace transform on K_BKSP", () => {
    expect(x.type([k("K_BKSP")], "\u00C5")).toBe("a");
  });
  it("falls back to deleting one code point", () => {
    expect(x.type([k("K_A"), k("K_B"), k("K_BKSP")])).toBe("a");
    expect(x.type([k("K_BKSP")])).toBe("");
  });
});

describe("ldmlInterpreter: normalization", () => {
  it("matches NFD and outputs NFC", () => {
    const x = loadLdml(
      doc(`${HW}
      <transforms type="simple"><transformGroup>
        <transform from="a\\u{301}" to="X"/>
      </transformGroup></transforms>`),
    );
    // Precomposed a-acute in the context matches the decomposed from.
    expect(x.type([k("K_B")], "\u00E1")).toBe("\u00E1b");
    expect(x.type([k("K_A")], "")).toBe("a");
    const y = loadLdml(
      doc(`${HW}
      <keys><key id="comb" output="\\u{301}"/></keys>`.replace('<row keys="grave"/>', "")),
    );
    expect(y.type([], "a\u0301")).toBe("\u00E1");
  });
});

describe("ldmlInterpreter: touch", () => {
  const x = loadLdml(
    doc(`
    <keys>
      <key id="a" output="a"/><key id="b" output="b"/><key id="shift" layerId="shift"/>
      <key id="A" output="A"/><key id="gp" gap="true"/>
    </keys>
    <layers formId="touch" minDeviceWidth="50">
      <layer id="base"><row keys="a shift"/></layer>
    </layers>
    <layers formId="touch" minDeviceWidth="150">
      <layer id="base"><row keys="b shift"/></layer>
      <layer id="shift"><row keys="A gp"/></layer>
    </layers>
    <transforms type="simple"><transformGroup>
      <transform from="ab" to="X"/>
    </transformGroup></transforms>`),
  );
  it("selects the touch form by minDeviceWidth", () => {
    expect(x.tapTouch(60, "base", "a")).toBe("a");
    expect(x.tapTouch(200, "base", "b")).toBe("b");
    expect(() => x.tapTouch(60, "shift", "A")).toThrow();
  });
  it("applies output then transforms, using the context", () => {
    expect(x.tapTouch(200, "base", "b", "a")).toBe("X");
  });
  it("types nothing for layer-switch and gap keys", () => {
    expect(x.tapTouch(200, "base", "shift", "q")).toBe("q");
    expect(x.tapTouch(200, "shift", "gp", "q")).toBe("q");
  });
  it("rejects a key that is not on the layer", () => {
    expect(() => x.tapTouch(200, "base", "a")).toThrow(/not in touch layer/);
  });
});

describe("ldmlInterpreter: CLDR sample", () => {
  it("loads the French sample and applies its accent transforms", () => {
    const xml = readFileSync(
      new URL("./fixtures/cldr-samples/fr.xml", import.meta.url),
      "utf8",
    );
    const x = loadLdml(xml);
    expect(x.type([k("K_Q")])).toBe("a");
    expect(x.type([k("K_Q", ["shift"])])).toBe("A");
  });
});
