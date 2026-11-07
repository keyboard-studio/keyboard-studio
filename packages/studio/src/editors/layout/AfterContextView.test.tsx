// AfterContextView, deadkey mode (spec 113 T078): every key shows what typing it after the chosen
// deadkey produces, from `simulateEach` seeded with `pendingDeadkeys`; a key with no row shows what
// actually happens instead; chains are followed; a named deadkey (which cannot be seeded) shows
// nothing rather than a guess.

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import type { SimKeyInput, SimulationStep, SimulatorContextSeed } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { makeIdleRulesDemoArtifact, makeReadyRulesDemoArtifact } from "../../stores/rulesDemoArtifactStore.ts";
import { AfterContextView } from "./AfterContextView.tsx";
import type { SimulateEach } from "./useLayoutAttribution.ts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(dk_3000_bases) 'e'
store(dk_3000_output) U+00E9
begin Unicode > use(main)
group(main) using keys
+ [K_E] > 'e'
+ [K_A] > 'a'
+ [K_Y] > 'y'
+ [K_D] > dk(3000)
+ [K_Q] > dk(3001)
dk(3000) + any(dk_3000_bases) > index(dk_3000_output, 2)
dk(3000) + [K_D] > U+00B4
dk(3000) + [K_Y] > dk(3001)
dk(3000) + [K_Z] > any(dk_3000_bases)
`;

const ir = parseKmn(KMN, "t").ir;
const VKEYS = ["K_E", "K_A", "K_Y", "K_D"];
const BYTES = new TextEncoder().encode("// compiled");

const seeds: Array<SimulatorContextSeed | undefined> = [];

/** The compiled keyboard: what a key types with dk(3000) pending, and plainly. The compiler numbers
 * deadkeys by first mention, so dk(3000) is 0 and dk(3001) is 1. */
const simulateEach: SimulateEach = (_c, inputs: readonly SimKeyInput[], seed) => {
  seeds.push(seed);
  const pending = seed?.pendingDeadkeys?.some((p) => p.id === 0) === true;
  return inputs.map((input): SimulationStep => {
    const base = { input, beep: false } as const;
    if (!pending) return { ...base, outputAfter: input.vkey.replace("K_", "").toLowerCase(), pendingDeadkeys: [] };
    switch (input.vkey) {
      case "K_E":
        return { ...base, outputAfter: "é", pendingDeadkeys: [], firedRule: { group: "main", ruleIndex: 0 } };
      case "K_D":
        return { ...base, outputAfter: "´", pendingDeadkeys: [], firedRule: { group: "main", ruleIndex: 1 } };
      case "K_Y":
        return { ...base, outputAfter: "", pendingDeadkeys: [{ id: 1, position: 0 }], firedRule: { group: "main", ruleIndex: 2 } };
      default:
        // No row: the deadkey is dropped and the key types its own letter.
        return { ...base, outputAfter: input.vkey.replace("K_", "").toLowerCase(), pendingDeadkeys: [] };
    }
  });
};

const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
};

function view(deadkeyId = "3000", ready = true) {
  const onFollow = vi.fn();
  const onViewInCode = vi.fn();
  const onClose = vi.fn();
  render(
    <AfterContextView
      deadkeyId={deadkeyId}
      layer={[]}
      displayChar={"´"}
      onFollow={onFollow}
      onViewInCode={onViewInCode}
      onClose={onClose}
      options={{
        ir,
        vkeys: VKEYS,
        jsBytes: BYTES,
        simulateEach,
        artifact: ready ? makeReadyRulesDemoArtifact("blob:after", "t") : makeIdleRulesDemoArtifact(),
      }}
    />,
  );
  return { onFollow, onViewInCode, onClose };
}

const keyRow = (vkey: string): HTMLElement =>
  screen.getAllByTestId("after-context-key").find((e) => e.getAttribute("data-vkey") === vkey)!;

afterEach(() => {
  cleanup();
  seeds.length = 0;
});

describe("AfterContextView (deadkey mode)", () => {
  it("shows, for every key, what typing it after the deadkey produces, simulated with a pendingDeadkeys seed", async () => {
    view();
    await flush();
    expect(seeds.some((s) => s?.pendingDeadkeys?.some((p) => p.id === 0))).toBe(true);
    expect(keyRow("K_E").textContent).toContain("types é");
    expect(keyRow("K_D").textContent).toContain("types ´");
    expect(screen.getAllByTestId("after-context-key")).toHaveLength(VKEYS.length);
  });

  it("a key with no row shows what actually happens instead", async () => {
    view();
    await flush();
    expect(keyRow("K_A").textContent).toContain("no combination; types a instead");
  });

  it("follows a chain: a key whose result is a deadkey links to after that deadkey", async () => {
    const { onFollow } = view();
    await flush();
    expect(keyRow("K_Y").textContent).toContain("starts deadkey 3001");
    fireEvent.click(keyRow("K_Y").querySelector("[data-testid=after-context-follow]")!);
    expect(onFollow).toHaveBeenCalledWith("3001");
  });

  it("says so, and shows no keys, until the keyboard has compiled", async () => {
    view("3000", false);
    await flush();
    expect(screen.getByTestId("after-context-status").textContent).toContain("has not compiled");
    expect(screen.queryAllByTestId("after-context-key")).toHaveLength(0);
  });

  it("does not guess for a named deadkey, which cannot be seeded", async () => {
    view("acute");
    await flush();
    expect(screen.getByTestId("after-context-status").textContent).toContain("name rather than a number");
    expect(screen.queryAllByTestId("after-context-key")).toHaveLength(0);
  });

  it("goes back to the grid", async () => {
    const { onClose } = view();
    await flush();
    fireEvent.click(screen.getByTestId("after-context-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
