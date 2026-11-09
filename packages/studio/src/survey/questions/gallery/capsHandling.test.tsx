// capsHandling module tests (spec 112 T019): the module contract, the seed
// (cased alphabet -> cased-keys, provenance "default"; caseless -> nothing),
// which modes are offered, and the rendered summary.

import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseKmn } from "@keyboard-studio/engine";
import { render } from "../../../test/renderWithI18n.tsx";
import capsHandling, { capsModesOffered, isCasedAlphabet } from "./capsHandling.ts";
import { CapsHandlingView } from "../../caps/CapsHandlingRenderer.tsx";
import { runLiveExtraction, type LiveExtractionStore } from "../../../decisions/liveExtraction.ts";
import type { QuestionModule } from "../../types.ts";
import type { Decision, DecisionId, DecisionSet } from "../../../decisions/decisionTypes.ts";
import type { ExtractContext } from "../../../decisions/extractContext.ts";

// Vitest runs with the package root as cwd; the fixtures live with the engine's caps code.
const fx = (p: string) =>
  readFileSync(resolve(process.cwd(), "../engine/src/caps/__fixtures__", p), "utf8");
const irOf = (p: string, id: string) => parseKmn(fx(p), id).ir;
const AZ = Array.from({ length: 26 }, (_, i) => `K_${String.fromCharCode(65 + i)}`);

function inventory(chars: string[]): Decision {
  return { id: "character-inventory", value: { chars }, provenance: "asked" };
}

function fakeStore(initial: DecisionSet): LiveExtractionStore & { decisions: DecisionSet } {
  const state = { decisions: { ...initial } as DecisionSet };
  return {
    get decisions() {
      return state.decisions;
    },
    recordAll(rs: readonly Decision[]) {
      const next: Record<string, Decision<unknown>> = { ...state.decisions };
      for (const r of rs) next[r.id] = r as Decision<unknown>;
      state.decisions = next;
    },
  };
}

const CTX: ExtractContext = { ir: null, catalog: null };

// Providers of the module's requires, so the derived order resolves.
const stub = (id: string, provides: DecisionId): QuestionModule => ({
  definition: { id, type: "text" },
  fixtures: { valid: [{ value: "x" }], invalid: [] },
  inputs: [],
  writes: [],
  provides: [provides],
});
const PROVIDERS = [stub("inv", "character-inventory"), stub("wl", "windows-layout")];

afterEach(cleanup);

describe("capsHandling module contract", () => {
  it("provides caps-handling on the layout screen after the alphabet and the layout", () => {
    expect(capsHandling.provides).toEqual(["caps-handling"]);
    expect(capsHandling.screen).toBe("layout");
    expect(capsHandling.requires).toEqual(["character-inventory", "windows-layout"]);
    expect(capsHandling.writes).toEqual([]);
    expect(capsHandling.apply?.(undefined, {} as never)).toEqual({});
  });
});

describe("capsHandling seed", () => {
  it("a cased alphabet seeds { mode: cased-keys } with provenance default", () => {
    const store = fakeStore({ "character-inventory": inventory(["a", "b", "ŋ", "Ŋ"]) });
    runLiveExtraction({ modules: [...PROVIDERS, capsHandling], ctx: CTX, store });
    expect(store.decisions["caps-handling"]).toMatchObject({
      id: "caps-handling",
      value: { mode: "cased-keys" },
      provenance: "default",
    });
  });

  it("a caseless alphabet seeds no decision", () => {
    const store = fakeStore({ "character-inventory": inventory(["ก", "ข", "ค"]) });
    runLiveExtraction({ modules: [...PROVIDERS, capsHandling], ctx: CTX, store });
    expect(store.decisions["caps-handling"]).toBeUndefined();
  });

  it("isCasedAlphabet reads case pairs, locale-aware", () => {
    expect(isCasedAlphabet(["ŋ"])).toBe(true);
    expect(isCasedAlphabet(["1", "-", "ก"])).toBe(false);
    expect(isCasedAlphabet([])).toBe(false);
    expect(isCasedAlphabet(["i"], "tr")).toBe(true);
  });
});

describe("capsHandling modes offered", () => {
  it("explicit-rules only when the copied keyboard carries CAPS/NCAPS rules", () => {
    const withRules = irOf("upstream_basic_kbdus/basic_kbdus.kmn", "basic_kbdus");
    const without = irOf("no_caps.kmn", "no_caps");
    expect(capsModesOffered(withRules)).toEqual(["cased-keys", "explicit-rules", "none"]);
    expect(capsModesOffered(without)).toEqual(["cased-keys", "none"]);
  });
});

describe("CapsHandlingView", () => {
  const ir = irOf("eng_ralt.kmn", "eng_ralt");

  it("renders nothing for a caseless alphabet", () => {
    const { container } = render(
      <CapsHandlingView value={undefined} onChange={() => {}} ir={ir} alphabet={["ก"]} floor={AZ} />,
    );
    expect(container.textContent).toBe("");
  });

  it("lists the extra keys it also covers", () => {
    render(
      <CapsHandlingView
        value={{ mode: "cased-keys" }}
        onChange={() => {}}
        ir={ir}
        alphabet={["a", "ŋ"]}
        floor={AZ}
      />,
    );
    expect(screen.getByTestId("caps-also-covers").textContent).toContain("K_LBRKT");
  });

  it("lists conflicts as information", () => {
    render(
      <CapsHandlingView
        value={{ mode: "cased-keys" }}
        onChange={() => {}}
        ir={irOf("conflict.kmn", "conflict")}
        alphabet={["a", "ŋ"]}
        floor={AZ}
      />,
    );
    expect(screen.getByTestId("caps-conflicts").textContent).toContain("K_E");
  });

  it("is a radio group and reports the picked mode", () => {
    const onChange = vi.fn();
    render(
      <CapsHandlingView
        value={{ mode: "cased-keys" }}
        onChange={onChange}
        ir={irOf("upstream_basic_kbdus/basic_kbdus.kmn", "basic_kbdus")}
        alphabet={["a"]}
        floor={AZ}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect((screen.getByRole("radio", { name: /cased keys/i }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /explicit/i }));
    expect(onChange).toHaveBeenCalledWith({ mode: "explicit-rules" });
  });

  it("offers no explicit-rules radio when the copy has no caps rules", () => {
    render(
      <CapsHandlingView
        value={{ mode: "cased-keys" }}
        onChange={() => {}}
        ir={irOf("no_caps.kmn", "no_caps")}
        alphabet={["a"]}
        floor={AZ}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
