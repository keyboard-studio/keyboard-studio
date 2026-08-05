/**
 * Unit tests for touch-mining.ts — placement-priors v2 touch (longpress)
 * mining. Fixture modeled on release/g/ghana/source/ghana.keyman-touch-layout,
 * which carries an `sk[].layer: "rightalt"` annotation on a longpress
 * sub-entry (see the module docstring for why `layerClass` does not read it).
 */

import { describe, it, expect } from "vitest";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { mineLongpressHosts, aggregateTouchHosts, touchHostsToEntries } from "./touch-mining.js";

function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `n_${id}`, id, ...overrides };
}

function makeLayout(layers: TouchLayoutIR["platforms"][number]["layers"]): TouchLayoutIR {
  return { platforms: [{ id: "phone", layers }], nodeIds: [] };
}

describe("mineLongpressHosts", () => {
  it("mines a longpress (sk[]) entry into a codepoint/vkey/layerClass observation", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_E", { text: "e", sk: [makeKey("K_E", { text: "ɛ" })] })] }],
      },
    ]);
    const observations = mineLongpressHosts(layout);
    expect(observations).toEqual([{ codepoint: "U+025B", vkey: "K_E", layerClass: "default" }]);
  });

  it("buckets the OUTER layer id: 'default' / 'shift' / anything else -> 'other'", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_E", { sk: [makeKey("K_E", { text: "ɛ" })] })] }] },
      { id: "shift", rows: [{ keys: [makeKey("K_E", { sk: [makeKey("K_E", { text: "Ɛ" })] })] }] },
      { id: "symbol", rows: [{ keys: [makeKey("K_E", { sk: [makeKey("K_E", { text: "€" })] })] }] },
    ]);
    const observations = mineLongpressHosts(layout);
    expect(observations.map((o) => o.layerClass)).toEqual(["default", "shift", "other"]);
  });

  it("ignores the sk[] sub-entry's own layerAnnotation for bucketing (ghana's 'rightalt' hint)", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_E", {
                text: "e",
                sk: [makeKey("K_E", { text: "ɛ", layerAnnotation: "rightalt" })],
              }),
            ],
          },
        ],
      },
    ]);
    // Outer layer is "default" — the sk's own "rightalt" annotation must not
    // override that bucketing.
    expect(mineLongpressHosts(layout)).toEqual([
      { codepoint: "U+025B", vkey: "K_E", layerClass: "default" },
    ]);
  });

  it("skips multitap and flick entries (longpress only)", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_E", {
                text: "e",
                multitap: [makeKey("K_E", { text: "è" })],
                flick: { n: makeKey("K_E", { text: "ê" }) },
              }),
            ],
          },
        ],
      },
    ]);
    expect(mineLongpressHosts(layout)).toEqual([]);
  });

  it("drops non-K_ host vkeys (T_/U_ touch-specific ids are not standard suggestable keys)", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("T_sp", { sk: [makeKey("K_E", { text: "ɛ" })] })] }],
      },
    ]);
    expect(mineLongpressHosts(layout)).toEqual([]);
  });

  it("skips a spacer-class host key (sp:8/10)", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_E", { sp: 8, sk: [makeKey("K_E", { text: "ɛ" })] })] }],
      },
    ]);
    expect(mineLongpressHosts(layout)).toEqual([]);
  });

  it("skips an sk sub-entry with no char-producing field", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_E", { sk: [makeKey("K_LAYER", { nextlayer: "shift" })] })] }],
      },
    ]);
    expect(mineLongpressHosts(layout)).toEqual([]);
  });

  it("skips a multi-codepoint sk char (not a single codepoint)", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_E", { sk: [makeKey("K_E", { text: "ab" })] })] }],
      },
    ]);
    expect(mineLongpressHosts(layout)).toEqual([]);
  });
});

describe("aggregateTouchHosts / touchHostsToEntries", () => {
  it("one vote per (codepoint, vkey, layerClass) PER KEYBOARD, even across platforms", () => {
    // Same keyboard, same host repeated on two platforms — still one vote.
    const perKeyboard = [
      [
        { codepoint: "U+025B", vkey: "K_E", layerClass: "default" as const },
        { codepoint: "U+025B", vkey: "K_E", layerClass: "default" as const },
      ],
    ];
    const entries = touchHostsToEntries(aggregateTouchHosts(perKeyboard));
    expect(entries).toEqual([
      { codepoint: "U+025B", hosts: [{ vkey: "K_E", layerClass: "default", priorCount: 1 }] },
    ]);
  });

  it("counts one vote per independent keyboard across the corpus", () => {
    const perKeyboard = [
      [{ codepoint: "U+025B", vkey: "K_E", layerClass: "default" as const }],
      [{ codepoint: "U+025B", vkey: "K_E", layerClass: "default" as const }],
      [{ codepoint: "U+025B", vkey: "K_3", layerClass: "other" as const }],
    ];
    const entries = touchHostsToEntries(aggregateTouchHosts(perKeyboard));
    expect(entries).toEqual([
      {
        codepoint: "U+025B",
        hosts: [
          { vkey: "K_E", layerClass: "default", priorCount: 2 },
          { vkey: "K_3", layerClass: "other", priorCount: 1 },
        ],
      },
    ]);
  });

  it("sorts entries by codepoint and hosts by descending priorCount", () => {
    const perKeyboard = [
      [
        { codepoint: "U+0021", vkey: "K_1", layerClass: "default" as const },
        { codepoint: "U+0020", vkey: "K_SPACE", layerClass: "default" as const },
      ],
    ];
    const entries = touchHostsToEntries(aggregateTouchHosts(perKeyboard));
    expect(entries.map((e) => e.codepoint)).toEqual(["U+0020", "U+0021"]);
  });
});
