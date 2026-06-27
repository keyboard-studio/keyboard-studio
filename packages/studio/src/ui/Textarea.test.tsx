// Unit tests for the Textarea primitive (packages/studio/src/ui/Textarea.tsx).
//
// Coverage:
//   1. Renders a <textarea> element.
//   2. Passed props (value, onChange, disabled, placeholder, rows) work.
//   3. The error variant applies ERROR_BORDER (#7a2a2a) as border color.
//   4. Default border is BORDER (#30363d) when error is not set.
//   5. resize:vertical is always applied.
//   6. style override passes through (merges over base styles).
//   7. className override passes through.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { Textarea } from "./Textarea.tsx";

// jsdom always normalizes hex colors to rgb() in inline styles.
const ERROR_BORDER_RGB = "rgb(122, 42, 42)"; // #7a2a2a
const BORDER_RGB = "rgb(48, 54, 61)";        // #30363d

afterEach(() => {
  cleanup();
});

describe("Textarea — element", () => {
  it("renders a <textarea> element", () => {
    render(<Textarea />);
    const el = screen.getByRole("textbox");
    expect(el.tagName).toBe("TEXTAREA");
  });
});

describe("Textarea — prop passthrough", () => {
  it("forwards value prop", () => {
    render(<Textarea value="hello" onChange={() => undefined} />);
    const el = screen.getByRole<HTMLTextAreaElement>("textbox");
    expect(el.value).toBe("hello");
  });

  it("calls onChange when the value changes", () => {
    const handler = vi.fn();
    render(<Textarea value="" onChange={handler} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("respects disabled prop", () => {
    render(<Textarea disabled />);
    expect((screen.getByRole<HTMLTextAreaElement>("textbox")).disabled).toBe(true);
  });

  it("respects placeholder prop", () => {
    render(<Textarea placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeDefined();
  });

  it("respects rows prop", () => {
    render(<Textarea rows={8} />);
    const el = screen.getByRole<HTMLTextAreaElement>("textbox");
    expect(el.rows).toBe(8);
  });
});

describe("Textarea — error variant", () => {
  it("applies ERROR_BORDER (#7a2a2a) when error=true", () => {
    render(<Textarea error />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    // jsdom normalizes hex to rgb(); compare against the known rgb() expansion.
    expect(el.style.borderColor).toBe(ERROR_BORDER_RGB);
  });

  it("applies normal BORDER (#30363d) when error is not set", () => {
    render(<Textarea />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(el.style.borderColor).toBe(BORDER_RGB);
  });
});

describe("Textarea — resize", () => {
  it("always applies resize:vertical", () => {
    render(<Textarea />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(el.style.resize).toBe("vertical");
  });
});

describe("Textarea — style and className override", () => {
  it("merges caller style over base styles", () => {
    render(<Textarea style={{ color: "blue" }} />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(el.style.color).toBe("blue");
  });

  it("forwards className", () => {
    render(<Textarea className="ta-class" />);
    const el = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(el.className).toBe("ta-class");
  });
});
