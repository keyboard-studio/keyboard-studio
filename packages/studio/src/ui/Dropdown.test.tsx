import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Dropdown } from "./Dropdown.tsx";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("Dropdown", () => {
  it("renders a <select> element (role=combobox)", () => {
    render(<Dropdown options={OPTIONS} />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("renders the placeholder option", () => {
    render(<Dropdown options={OPTIONS} />);
    const placeholder = screen.getByRole("option", { name: "— Select one —" });
    expect(placeholder).toBeDefined();
  });

  it("renders all provided options", () => {
    render(<Dropdown options={OPTIONS} />);
    expect(screen.getByRole("option", { name: "Alpha" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Beta" })).toBeDefined();
  });

  it("reflects the current value via value prop", () => {
    render(<Dropdown options={OPTIONS} value="a" onChange={() => undefined} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("a");
  });

  it("calls onChange with the selected value string", () => {
    const onChange = vi.fn();
    render(<Dropdown options={OPTIONS} value="" onChange={onChange} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("applies base styles matching SelectField verbatim", () => {
    render(<Dropdown options={OPTIONS} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.style.cursor).toBe("pointer");
    // jsdom normalises hex → rgb; the values below confirm the verbatim hex was applied
    expect(select.style.background).toBe("rgb(13, 17, 23)");   // #0d1117
    expect(select.style.color).toBe("rgb(230, 237, 243)");     // #e6edf3
    expect(select.style.border).toBe("1px solid rgb(48, 54, 61)"); // #30363d
  });

  it("merges caller-supplied style overrides without losing base styles", () => {
    render(<Dropdown options={OPTIONS} style={{ opacity: "0.5" }} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.style.opacity).toBe("0.5");
    // jsdom normalises hex → rgb
    expect(select.style.background).toBe("rgb(13, 17, 23)"); // #0d1117 preserved
  });

  it("passes through native select attributes (id, aria-required)", () => {
    render(
      <Dropdown options={OPTIONS} id="my-select" aria-required={true} />
    );
    const select = screen.getByRole("combobox");
    expect(select.id).toBe("my-select");
    expect(select.getAttribute("aria-required")).toBe("true");
  });

  it("does not throw when no onChange handler provided", () => {
    render(<Dropdown options={OPTIONS} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "a" } });
  });
});
