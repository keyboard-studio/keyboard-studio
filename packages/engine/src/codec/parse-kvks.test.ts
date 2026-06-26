import { describe, it, expect } from "vitest";
import { parseKvks } from "./parse-kvks.js";

const MINIMAL_KVKS = `<?xml version="1.0" encoding="utf-8"?>
<visualkeyboard>
  <header>
    <version>10.0</version>
    <flags>
      <usealtgr/>
    </flags>
  </header>
  <encoding name="unicode" fontname="Arial" fontsize="-12">
    <layer shift="">
      <key vkey="K_A">a</key>
      <key vkey="K_B">b</key>
    </layer>
    <layer shift="S">
      <key vkey="K_A">A</key>
      <key vkey="K_B">B</key>
    </layer>
  </encoding>
</visualkeyboard>`;

const NO_ALTGR_KVKS = `<?xml version="1.0"?>
<visualkeyboard>
  <header><flags/></header>
  <encoding name="unicode">
    <layer shift=""><key vkey="K_C">c</key></layer>
  </encoding>
</visualkeyboard>`;

const XML_ENTITIES_KVKS = `<?xml version="1.0"?>
<visualkeyboard>
  <header><flags><usealtgr/></flags></header>
  <encoding name="unicode">
    <layer shift="">
      <key vkey="K_oE2">&lt;</key>
      <key vkey="K_AMPER">&amp;</key>
    </layer>
  </encoding>
</visualkeyboard>`;

describe("parseKvks", () => {
  it("returns KvksIR with correct layer count", () => {
    const ir = parseKvks(MINIMAL_KVKS);
    expect(ir.layers.length).toBe(2);
  });

  it("detects usealtgr flag", () => {
    const ir = parseKvks(MINIMAL_KVKS);
    expect(ir.usealtgr).toBe(true);
  });

  it("returns usealtgr false when flag absent", () => {
    const ir = parseKvks(NO_ALTGR_KVKS);
    expect(ir.usealtgr).toBe(false);
  });

  it("first layer has shift empty string", () => {
    const ir = parseKvks(MINIMAL_KVKS);
    expect(ir.layers[0]?.shift).toBe("");
  });

  it("second layer has shift 'S'", () => {
    const ir = parseKvks(MINIMAL_KVKS);
    expect(ir.layers[1]?.shift).toBe("S");
  });

  it("extracts key vkey and label text", () => {
    const ir = parseKvks(MINIMAL_KVKS);
    const layer0 = ir.layers[0];
    expect(layer0?.keys[0]).toMatchObject({ vkey: "K_A", label: "a" });
    expect(layer0?.keys[1]).toMatchObject({ vkey: "K_B", label: "b" });
  });

  it("unescapes XML entities in key label", () => {
    const ir = parseKvks(XML_ENTITIES_KVKS);
    const lt = ir.layers[0]?.keys.find(k => k.vkey === "K_oE2");
    const amp = ir.layers[0]?.keys.find(k => k.vkey === "K_AMPER");
    expect(lt?.label).toBe("<");
    expect(amp?.label).toBe("&");
  });

  it("populates nodeIds array", () => {
    const ir = parseKvks(MINIMAL_KVKS);
    expect(ir.nodeIds.length).toBeGreaterThan(0);
    // Each nodeIds entry is a [string, IRNodeRef] pair
    const [key, ref] = ir.nodeIds[0] ?? [];
    expect(typeof key).toBe("string");
    expect(ref?.kind).toBe("kvksKey");
    expect(typeof ref?.nodeId).toBe("string");
  });

  it("extracts the OSK font family from <encoding fontname=...> (refs #357)", () => {
    const ir = parseKvks(MINIMAL_KVKS);
    expect(ir.fontFamily).toBe("Arial");
  });

  it("leaves fontFamily undefined when <encoding> has no fontname", () => {
    const ir = parseKvks(NO_ALTGR_KVKS);
    expect(ir.fontFamily).toBeUndefined();
  });
});
