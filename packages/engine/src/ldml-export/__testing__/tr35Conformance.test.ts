import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tr35Conformance } from "./tr35Conformance.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const sample = (name: string): string =>
  readFileSync(join(HERE, "fixtures", "cldr-samples", name), "utf8");

interface Parts {
  keys?: string;
  flicks?: string;
  displays?: string;
  layers?: string;
}

const BASE_ROW = '<layer id="base"><row keys="a"/></layer>';

function doc(p: Parts): string {
  return `<?xml version="1.0"?>
<keyboard3 locale="en" conformsTo="46">
<displays>${p.displays ?? ""}</displays>
<keys>${p.keys ?? '<key id="a" output="a"/>'}</keys>
<flicks>${p.flicks ?? ""}</flicks>
${p.layers ?? `<layers formId="touch" minDeviceWidth="1">${BASE_ROW}</layers>`}
</keyboard3>`;
}

const touch = (attrs: string, layers: string): string =>
  `<layers formId="touch" ${attrs}>${layers}</layers>`;

const NEGATIVES: [string, string, Parts][] = [
  ["gap-key", "gap key with output", { keys: '<key id="g" gap="true" output="x"/>' }],
  ["gap-key", "gap key with layerId", { keys: '<key id="g" gap="true" layerId="base"/>' }],
  [
    "gap-key",
    "gap key with flickId",
    { keys: '<key id="g" gap="true" flickId="f"/>', flicks: '<flick id="f"/>' },
  ],
  [
    "gap-key",
    "gap key with longPressKeyIds",
    { keys: '<key id="a"/><key id="g" gap="true" longPressKeyIds="a"/>' },
  ],
  [
    "gap-key",
    "gap key with longPressDefaultKeyId",
    { keys: '<key id="a"/><key id="g" gap="true" longPressDefaultKeyId="a"/>' },
  ],
  [
    "gap-key",
    "gap key with multiTapKeyIds",
    { keys: '<key id="a"/><key id="g" gap="true" multiTapKeyIds="a"/>' },
  ],
  [
    "gap-key-display",
    "display of a gap key",
    { keys: '<key id="g" gap="true"/>', displays: '<display keyId="g" display="x"/>' },
  ],
  [
    "touch-base-layer",
    "touch form without base",
    { layers: touch('minDeviceWidth="1"', '<layer id="other"><row keys="a"/></layer>') },
  ],
  [
    "touch-layer-id",
    "touch layer without id",
    { layers: touch('minDeviceWidth="1"', `${BASE_ROW}<layer><row keys="a"/></layer>`) },
  ],
  [
    "touch-layer-modifiers",
    "touch layer with modifiers",
    { layers: touch('minDeviceWidth="1"', '<layer id="base" modifiers="shift"><row keys="a"/></layer>') },
  ],
  [
    "hardware-layer-modifiers",
    "hardware layer without modifiers",
    { layers: '<layers formId="iso"><layer><row keys="a"/></layer></layers>' },
  ],
  [
    "hardware-layer-id",
    "hardware layer with id",
    { layers: '<layers formId="iso"><layer id="x" modifiers="none"><row keys="a"/></layer></layers>' },
  ],
  ["layer-id-unresolved", "layerId naming no layer", { keys: '<key id="a" layerId="nope"/>' }],
  ["flick-id-unresolved", "flickId naming no flick", { keys: '<key id="a" flickId="nope"/>' }],
  ["gesture-key-unresolved", "longPressKeyIds naming no key", { keys: '<key id="a" longPressKeyIds="zz"/>' }],
  [
    "gesture-key-unresolved",
    "flick segment naming no key",
    { flicks: '<flick id="f"><flickSegment directions="n" keyId="zz"/></flick>' },
  ],
  [
    "gesture-target-gesture",
    "gesture target with its own gesture",
    { keys: '<key id="a" longPressKeyIds="b"/><key id="b" multiTapKeyIds="a"/>' },
  ],
  [
    "min-device-width-range",
    "minDeviceWidth 0",
    { layers: touch('minDeviceWidth="0"', BASE_ROW) },
  ],
  [
    "min-device-width-range",
    "minDeviceWidth 1000",
    { layers: touch('minDeviceWidth="1000"', BASE_ROW) },
  ],
  [
    "min-device-width-distinct",
    "minDeviceWidth repeated in one form",
    { layers: touch('minDeviceWidth="150"', BASE_ROW) + touch('minDeviceWidth="150"', BASE_ROW) },
  ],
  ["width-range", "key width 0", { keys: '<key id="a" width="0"/>' }],
  ["width-range", "key width 101", { keys: '<key id="a" width="101"/>' }],
  [
    "row-spacing",
    "row with a double space",
    { layers: touch('minDeviceWidth="1"', '<layer id="base"><row keys="a  a"/></layer>') },
  ],
  [
    "row-spacing",
    "row with a newline separator",
    { layers: touch('minDeviceWidth="1"', '<layer id="base"><row keys="a\na"/></layer>') },
  ],
];

describe("tr35Conformance (H4)", () => {
  it("accepts a minimal conforming document", () => {
    expect(tr35Conformance(doc({}))).toEqual([]);
  });

  it("accepts the T003 touch sample", () => {
    expect(tr35Conformance(sample("fr-t-k0-test.xml"))).toEqual([]);
  });

  it("accepts the T003 hardware sample", () => {
    expect(tr35Conformance(sample("fr.xml"))).toEqual([]);
  });

  it.each(NEGATIVES)("flags %s: %s", (rule, _label, parts) => {
    const rules = tr35Conformance(doc(parts)).map((v) => v.rule);
    expect(rules).toContain(rule);
  });
});
