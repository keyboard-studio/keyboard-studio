import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixTouchModifierKeysRaw } from "./fixTouchModifierKeys.js";

type Key = Record<string, unknown>;
const layout = (layers: Record<string, Key[]>): string =>
  JSON.stringify({
    tablet: { layer: Object.entries(layers).map(([id, key]) => ({ id, row: [{ id: 1, key }] })) },
  });
const keysOf = (json: string, layerId: string): Key[] => {
  const raw = JSON.parse(json) as { tablet: { layer: Array<{ id: string; row: Array<{ key: Key[] }> }> } };
  return raw.tablet.layer.find((l) => l.id === layerId)!.row.flatMap((r) => r.key);
};

describe("fixTouchModifierKeysRaw", () => {
  it("returns the same string when every modifier key is already consistent", () => {
    const text = layout({
      default: [{ id: "K_RALT", text: "*RAlt*", sp: "1", nextlayer: "rightalt" }, { id: "K_Q", text: "q" }],
      rightalt: [{ id: "K_RALT", text: "*RAlt*", sp: 2, nextlayer: "default" }],
    });
    expect(fixTouchModifierKeysRaw(text)).toEqual({ json: text, changed: false });
  });

  it("turns a legacy RAlt key into K_RALT *RAlt* and the layer's own key into the active style", () => {
    const res = fixTouchModifierKeysRaw(
      layout({
        default: [{ id: "K_LCONTROL", text: "*Alt*", sp: "1", nextlayer: "rightalt" }],
        rightalt: [{ id: "K_LCONTROL", text: "default", sp: "1", nextlayer: "default" }],
      }),
    );
    expect(res.changed).toBe(true);
    expect(keysOf(res.json, "default")).toEqual([{ id: "K_RALT", text: "*RAlt*", sp: "1", nextlayer: "rightalt" }]);
    expect(keysOf(res.json, "rightalt")).toEqual([{ id: "K_RALT", text: "*RAlt*", sp: 2, nextlayer: "default" }]);
  });

  it("sends RAlt on shift and caps to the shifted and caps right-alt layers when they exist", () => {
    const res = fixTouchModifierKeysRaw(
      layout({
        default: [{ id: "K_LCONTROL", text: "rightalt", sp: "1", nextlayer: "rightalt" }],
        shift: [{ id: "K_LCONTROL", text: "rightalt", sp: "1", nextlayer: "rightalt" }],
        caps: [{ id: "K_LCONTROL", text: "default", sp: "1" }],
        rightalt: [],
        "rightalt-shift": [{ id: "K_LCONTROL", text: "default", sp: "1" }],
        "rightalt-caps": [{ id: "K_LCONTROL", text: "default", sp: "1" }],
      }),
    );
    expect(keysOf(res.json, "shift")[0]).toMatchObject({ id: "K_RALT", nextlayer: "rightalt-shift" });
    // No rightalt-caps source on caps -> falls back to rightalt-caps because it exists.
    expect(keysOf(res.json, "caps")[0]).toMatchObject({ id: "K_RALT", text: "*RAlt*", nextlayer: "rightalt-caps" });
    expect(keysOf(res.json, "rightalt-shift")[0]).toMatchObject({ id: "K_RALT", sp: 2 });
  });

  it("labels Ctrl and gives the ctrl layer's own key the active style", () => {
    const res = fixTouchModifierKeysRaw(
      layout({
        default: [{ id: "K_LCONTROL", text: "ctrl", sp: "1", nextlayer: "default" }],
        shift: [{ id: "K_LCONTROL", text: "ctrl", sp: "1" }],
        ctrl: [{ id: "K_LCONTROL", text: "default", sp: "1", nextlayer: "default" }],
        "ctrl-shift": [{ id: "K_Q", text: "Q" }],
      }),
    );
    expect(keysOf(res.json, "default")[0]).toMatchObject({ text: "*Ctrl*", nextlayer: "ctrl" });
    expect(keysOf(res.json, "shift")[0]).toMatchObject({ text: "*Ctrl*", nextlayer: "ctrl-shift" });
    expect(keysOf(res.json, "ctrl")[0]).toMatchObject({ text: "*Ctrl*", sp: 2, nextlayer: "default" });
  });

  it("leaves blank keys, other labels and unrelated keys alone", () => {
    const text = layout({
      default: [
        { id: "K_LCONTROL", text: "", sp: "9" },
        { id: "K_LCONTROL", text: "*123*", sp: "1", nextlayer: "numeric" },
        { id: "K_Q", text: "ctrl" },
      ],
    });
    expect(fixTouchModifierKeysRaw(text)).toEqual({ json: text, changed: false });
  });

  it("fixes modifier keys inside sk and multitap", () => {
    const res = fixTouchModifierKeysRaw(
      layout({ default: [{ id: "K_Q", text: "q", sk: [{ id: "K_ALT", text: "RALT", nextlayer: "rightalt" }] }] }),
    );
    expect((keysOf(res.json, "default")[0]!["sk"] as Key[])[0]).toMatchObject({ id: "K_RALT", text: "*RAlt*" });
  });

  it("is idempotent", () => {
    const once = fixTouchModifierKeysRaw(
      layout({
        default: [{ id: "K_LCONTROL", text: "SRA", sp: "1" }, { id: "K_LCONTROL", text: "RALT", sp: "1" }],
        rightalt: [{ id: "K_LCONTROL", text: "S RALT", sp: "1" }],
      }),
    );
    expect(fixTouchModifierKeysRaw(once.json)).toEqual({ json: once.json, changed: false });
  });

  it("returns malformed JSON unchanged", () => {
    expect(fixTouchModifierKeysRaw("{")).toEqual({ json: "{", changed: false });
  });
});

// Opt-in corpus check: over the keyboards fork's release/basic touch layouts the
// fixer settles after one pass and only ever changes Ctrl/RAlt keys.
const BASIC = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../keyboards/release/basic");
describe.skipIf(!existsSync(BASIC))("fixTouchModifierKeysRaw over the fork's basic keyboards", () => {
  it("is idempotent and touches only modifier keys", () => {
    let changed = 0;
    for (const id of readdirSync(BASIC)) {
      const f = join(BASIC, id, "source", `${id}.keyman-touch-layout`);
      if (!existsSync(f)) continue;
      const text = readFileSync(f, "utf8");
      const once = fixTouchModifierKeysRaw(text);
      if (once.changed) changed += 1;
      expect(fixTouchModifierKeysRaw(once.json).changed, id).toBe(false);
      if (!once.changed) continue;
      const before = JSON.parse(text) as Record<string, { layer: Array<{ id: string; row: Array<{ key: Key[] }> }> }>;
      const after = JSON.parse(once.json) as typeof before;
      for (const [p, v] of Object.entries(after)) {
        for (const l of v.layer) {
          const was = before[p]!.layer.find((x) => x.id === l.id)!.row.flatMap((r) => r.key);
          for (const [i, k] of l.row.flatMap((r) => r.key).entries()) {
            const w = was[i]!;
            if (JSON.stringify(w) !== JSON.stringify(k)) {
              expect(String(w["id"]), `${id} ${l.id}`).toMatch(/^K_(L|R)?(CONTROL|ALT)$/);
            }
          }
        }
      }
    }
    expect(changed).toBeGreaterThan(0);
  });
});
