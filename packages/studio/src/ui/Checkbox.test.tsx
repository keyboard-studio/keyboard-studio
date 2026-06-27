import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Checkbox } from "./Checkbox.tsx";

afterEach(() => {
  cleanup();
});

describe("Checkbox", () => {
  it("renders an <input type=checkbox> (role=checkbox)", () => {
    render(<Checkbox onChange={() => undefined} />);
    expect(screen.getByRole("checkbox")).toBeDefined();
  });

  it("reflects checked=true", () => {
    render(<Checkbox checked={true} onChange={() => undefined} />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it("reflects checked=false", () => {
    render(<Checkbox checked={false} onChange={() => undefined} />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it("calls onChange when clicked", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalled();
  });

  it("passes through id and aria-label attributes", () => {
    render(
      <Checkbox id="my-cb" aria-label="my checkbox" onChange={() => undefined} />
    );
    const cb = screen.getByRole("checkbox");
    expect(cb.id).toBe("my-cb");
    expect(cb.getAttribute("aria-label")).toBe("my checkbox");
  });

  it("passes through style prop", () => {
    render(
      <Checkbox style={{ accentColor: "#ff0000" }} onChange={() => undefined} />
    );
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.style.accentColor).toBe("#ff0000");
  });

  it("passes through disabled prop", () => {
    render(<Checkbox disabled onChange={() => undefined} />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.disabled).toBe(true);
  });

  it("passes through name prop", () => {
    render(<Checkbox name="agree" onChange={() => undefined} />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.name).toBe("agree");
  });

  it("renders unchecked by default when checked is undefined", () => {
    render(<Checkbox onChange={() => undefined} />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });
});
