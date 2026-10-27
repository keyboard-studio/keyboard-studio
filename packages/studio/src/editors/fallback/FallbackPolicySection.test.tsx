// FallbackPolicySection — the keyboard-wide fallback policy surface.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { charRule, irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { FallbackPolicySection } from "./FallbackPolicySection.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});
afterEach(() => cleanup());

const store = () => useWorkingCopyStore.getState();

describe("FallbackPolicySection", () => {
  it("is a native radio group labelled by its legend, with the two draft options and neither marked recommended", () => {
    render(<FallbackPolicySection defaultOpen />);
    const group = screen.getByRole("group", { name: "When a key isn't in your keyboard" });
    expect(group.tagName).toBe("FIELDSET");
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios.every((r) => (r as HTMLInputElement).type === "radio")).toBe(true);
    expect(screen.getByRole("radio", { name: "Do nothing" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Use the computer's layout" })).toBeTruthy();
    expect(screen.queryByText(/recommended|safe|best choice/i)).toBeNull();
  });

  it("each option states its own risk via aria-describedby (A2-symmetric copy)", () => {
    render(<FallbackPolicySection defaultOpen />);
    const swallow = screen.getByRole("radio", { name: "Do nothing" });
    const pass = screen.getByRole("radio", { name: "Use the computer's layout" });
    const text = (el: HTMLElement) =>
      document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent;
    expect(text(swallow)).toBe(
      "Keys not in your keyboard do nothing. Silent on every computer — but if your typists expect a character on a key, that key will feel dead.",
    );
    expect(text(pass)).toBe(
      "Keys not in your keyboard fall through to the computer's own layout. The key types something — but what it types varies by computer.",
    );
  });

  it("defaults to Do nothing and choosing each option updates the store", () => {
    render(<FallbackPolicySection defaultOpen />);
    expect((screen.getByRole("radio", { name: "Do nothing" }) as HTMLInputElement).checked).toBe(true);
    expect(store().fallbackPolicy).toBe("swallow");

    fireEvent.click(screen.getByRole("radio", { name: "Use the computer's layout" }));
    expect(store().fallbackPolicy).toBe("pass-through");
    expect((screen.getByRole("radio", { name: "Use the computer's layout" }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Do nothing" }));
    expect(store().fallbackPolicy).toBe("swallow");
  });

  it("states the deadkey rule as a rule, not a choice", () => {
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-policy-deadkey-rule").textContent).toBe(
      "Deadkey combinations always do nothing — allowing fallback would leave the deadkey armed.",
    );
    // Still exactly two radios: deadkey handling is not an option.
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("shows the host consequence table with the honesty caption", () => {
    render(<FallbackPolicySection defaultOpen />);
    const summary = screen.getByTestId("fallback-host-summary");
    expect(within(summary).getAllByRole("row").length).toBeGreaterThan(1);
    expect(screen.getByTestId("fallback-host-caption").textContent).toMatch(/best guess/);
    expect(screen.getByTestId("fallback-host-caption").textContent).toMatch(/not sight/);
  });

  it("names a carved key as the representative undefined key", () => {
    const ir = makeTestIR({
      groups: [
        irGroup({
          nodeId: "group#main",
          rules: [
            vkeyRule({ nodeId: "r1", vkey: "K_A", output: "a" }),
            charRule({ nodeId: "r2", context: "z", output: "z" }),
          ],
        }),
      ],
    });
    useWorkingCopyStore.setState({ startIr: ir, ir, deletedNodeIds: new Set(["r1"]) });
    render(<FallbackPolicySection defaultOpen />);
    expect(screen.getByTestId("fallback-host-summary").querySelector("caption")?.textContent).toContain("A");
  });

  it("the collapsed summary names the current choice", () => {
    store().setFallbackPolicy("pass-through");
    render(<FallbackPolicySection />);
    expect(screen.getByTestId("fallback-policy-current").textContent).toBe("Use the computer's layout");
  });
});
