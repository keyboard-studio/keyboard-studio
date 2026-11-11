// AfterContextView, deadkey mode (spec 117 T078): every key shows what typing it after the chosen
// deadkey produces, from `simulateEach` seeded with `pendingDeadkeys`; a key with no row shows what
// actually happens instead; chains are followed; a named deadkey (which cannot be seeded) shows
// nothing rather than a guess. Literal-context mode (T117, US4): the context list, a new context
// (an unreachable one flagged before confirm), a "becomes" edit that writes exactly the entered
// text, and a never-fires duplicate shown read-only.

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KmnEditsValue, SimKeyInput, SimulationStep, SimulatorContextSeed } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { makeIdleRulesDemoArtifact, makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
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

// ---------------------------------------------------------------------------
// Literal-context mode (spec 117 US4)
// ---------------------------------------------------------------------------

const LIT_KMN = `store(&VERSION) '10.0'
store(&NAME) 'lit'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [K_N] > 'n'
+ [K_G] > 'g'
+ [K_A] > 'a'
+ [K_E] > 'e'
+ [K_D] > dk(0001)
dk(0001) + [K_E] > U+00E9
'n' + [K_G] > U+014B
'n' + [K_G] > U+0272
`;
const LIT_VKEYS = ["K_N", "K_G", "K_A", "K_E", "K_D"];

/** The compiled literal keyboard: with "n" typed, G gives eng; everything else appends its letter. */
const litSimulate: SimulateEach = (_c, inputs: readonly SimKeyInput[], seed) => {
  seeds.push(seed);
  const before = seed?.text ?? "";
  return inputs.map((input): SimulationStep => {
    const base = { input, beep: false, pendingDeadkeys: [] } as const;
    if (before === "n" && input.vkey === "K_G") return { ...base, outputAfter: "ŋ", firedRule: { group: "main", ruleIndex: 0 } };
    return { ...base, outputAfter: before + input.vkey.replace("K_", "").toLowerCase() };
  });
};

const kmnEdits = (): KmnEditsValue | undefined =>
  useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;

function seedLiteral(): void {
  const lit = parseKmn(LIT_KMN, "lit").ir;
  useWorkingCopyStore.setState({ ir: lit, startIr: lit, undoStack: [], desktopLocked: false, deadkeyOverlay: { ops: [] } });
  useDecisionStore.getState().reset();
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:lit", "lit"));
}

function literalView() {
  const onFollow = vi.fn();
  const onViewInCode = vi.fn();
  render(
    <AfterContextView
      layer={[]}
      layers={[[]]}
      onFollow={onFollow}
      onViewInCode={onViewInCode}
      onClose={vi.fn()}
      options={{ vkeys: LIT_VKEYS, jsBytes: BYTES, simulateEach: litSimulate }}
    />,
  );
  return { onFollow, onViewInCode };
}

async function chooseContext(label: string): Promise<void> {
  const choice = screen.getAllByTestId("after-context-choice").find((e) => e.textContent?.startsWith(label))!;
  fireEvent.click(choice);
  await flush();
}

async function useNewContext(text: string): Promise<void> {
  fireEvent.change(screen.getByTestId("after-context-new-input"), { target: { value: text } });
  fireEvent.click(screen.getByTestId("after-context-new-use"));
  await flush();
}

const editButton = (vkey: string): Element => keyRow(vkey).querySelector("[data-testid=after-context-edit]")!;

describe("AfterContextView (literal-context mode)", () => {
  beforeEach(seedLiteral);

  it("lists the contexts the keyboard uses, literal contexts and deadkeys, with key counts", () => {
    literalView();
    const labels = screen.getAllByTestId("after-context-choice").map((e) => e.textContent);
    expect(labels.some((l) => l?.startsWith("n") && l.includes("1 key"))).toBe(true);
    expect(labels.some((l) => l?.includes("0001") && l.includes("1 key"))).toBe(true);
  });

  it("choosing a deadkey from the list follows it into deadkey mode", () => {
    const { onFollow } = literalView();
    fireEvent.click(screen.getAllByTestId("after-context-choice").find((e) => e.textContent?.includes("0001"))!);
    expect(onFollow).toHaveBeenCalledWith("0001");
  });

  it("choosing a literal context shows every key after it, simulated with that text before", async () => {
    literalView();
    await chooseContext("n");
    expect(seeds.some((s) => s?.text === "n")).toBe(true);
    expect(keyRow("K_G").textContent).toContain("types ŋ");
    expect(keyRow("K_A").textContent).toContain("no combination; types a instead");
  });

  it("flags a new context no listed layer can type before it is used, and not a reachable one", () => {
    literalView();
    fireEvent.change(screen.getByTestId("after-context-new-input"), { target: { value: "ə" } });
    expect(screen.getByTestId("after-context-unreachable")).toBeTruthy();
    fireEvent.change(screen.getByTestId("after-context-new-input"), { target: { value: "a" } });
    expect(screen.queryByTestId("after-context-unreachable")).toBeNull();
  });

  it("a new context is used when entered", async () => {
    literalView();
    await useNewContext("a");
    expect(seeds.some((s) => s?.text === "a")).toBe(true);
    expect(screen.getAllByTestId("after-context-key").length).toBeGreaterThan(0);
  });

  it("a becomes edit writes exactly the entered text as one set-row entry and one undo step", async () => {
    literalView();
    await useNewContext("a");
    fireEvent.click(editButton("K_E"));
    fireEvent.change(screen.getByTestId("becomes-input"), { target: { value: "æ" } });
    fireEvent.click(screen.getByTestId("becomes-set"));
    expect(kmnEdits()?.entries).toHaveLength(1);
    expect(kmnEdits()?.entries[0]).toMatchObject({
      op: "set-row",
      vkey: "K_E",
      layer: [],
      context: [{ kind: "text", text: "a" }],
      becomes: [{ kind: "text", text: "æ" }],
    });
    expect(emitKmn(useWorkingCopyStore.getState().ir!)).toContain("U+0061 + [K_E] > U+00E6");
    const stack = useWorkingCopyStore.getState().undoStack;
    expect(stack[stack.length - 1]?.k).toBe("l");
  });

  it("a becomes edit can add a deadkey after the text", async () => {
    literalView();
    await useNewContext("a");
    fireEvent.click(editButton("K_E"));
    fireEvent.change(screen.getByTestId("becomes-input"), { target: { value: "x" } });
    fireEvent.change(screen.getByTestId("becomes-deadkey"), { target: { value: "0001" } });
    fireEvent.click(screen.getByTestId("becomes-set"));
    expect(kmnEdits()?.entries[0]).toMatchObject({
      op: "set-row",
      becomes: [
        { kind: "text", text: "x" },
        { kind: "deadkey", deadkeyId: "0001" },
      ],
    });
  });

  it("removing an existing row writes a remove-row entry", async () => {
    literalView();
    await chooseContext("n");
    fireEvent.click(editButton("K_G"));
    fireEvent.click(screen.getByTestId("becomes-remove"));
    expect(kmnEdits()?.entries[0]).toMatchObject({ op: "remove-row", vkey: "K_G", layer: [], context: [{ kind: "text", text: "n" }] });
  });

  it("two rules for one context and key: the firing one editable, the other never fires, read-only, with view in code", async () => {
    const { onViewInCode } = literalView();
    await chooseContext("n");
    const row = keyRow("K_G");
    expect(row.querySelectorAll("[data-testid=after-context-edit]")).toHaveLength(1);
    const never = row.querySelector("[data-testid=after-context-never-fires]")!;
    expect(never.textContent).toContain("never fires");
    fireEvent.click(never.querySelector("[data-testid=after-context-view-in-code]")!);
    expect(onViewInCode).toHaveBeenCalledTimes(1);
  });

  it("refuses an edit while the keyboard does not compile, and says so", async () => {
    literalView();
    await useNewContext("a");
    fireEvent.click(editButton("K_A"));
    useRulesDemoArtifactStore.getState().setArtifact(makeIdleRulesDemoArtifact());
    fireEvent.change(screen.getByTestId("becomes-input"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("becomes-set"));
    expect(screen.getByTestId("becomes-problem").textContent).toContain("not compiled");
    expect(kmnEdits()?.entries ?? []).toHaveLength(0);
  });
});
