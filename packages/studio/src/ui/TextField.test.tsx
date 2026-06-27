// Unit tests for the TextField primitive (packages/studio/src/ui/TextField.tsx).
//
// Coverage:
//   1. Renders an <input type="text"> element.
//   2. Passed props (value, onChange, disabled, placeholder) work.
//   3. The error variant applies ERROR_BORDER (#7a2a2a) as border color.
//   4. The mono variant applies CSS_FONT_MONO (var(--app-font-mono)) as fontFamily.
//   5. style override passes through (merges over base styles).
//   6. className override passes through.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { TextField } from "./TextField.tsx";
import { CSS_FONT_MONO } from "./theme.ts";

// jsdom always normalizes hex colors to rgb() in computed/inline styles.
// These are the jsdom-serialized equivalents of ERROR_BORDER (#7a2a2a) and
// BORDER (#30363d) — verified by inspection of the rgb() expansion.
const ERROR_BORDER_RGB = "rgb(122, 42, 42)";
const BORDER_RGB = "rgb(48, 54, 61)";

afterEach(() => {
  cleanup();
});

describe("TextField — element", () => {
  it("renders an <input> with type=text", () => {
    render(<TextField />);
    const el = screen.getByRole("textbox");
    expect(el.tagName).toBe("INPUT");
    expect((el as HTMLInputElement).type).toBe("text");
  });
});

describe("TextField — prop passthrough", () => {
  it("forwards value prop", () => {
    render(<TextField value="hello" onChange={() => undefined} />);
    const el = screen.getByRole<HTMLInputElement>("textbox");
    expect(el.value).toBe("hello");
  });

  it("calls onChange when the value changes", () => {
    const handler = vi.fn();
    render(<TextField value="" onChange={handler} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("respects disabled prop", () => {
    render(<TextField disabled />);
    expect((screen.getByRole<HTMLInputElement>("textbox")).disabled).toBe(true);
  });

  it("respects placeholder prop", () => {
    render(<TextField placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeDefined();
  });
});

describe("TextField — error variant", () => {
  it("applies ERROR_BORDER (#7a2a2a) when error=true", () => {
    render(<TextField error />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    // jsdom normalizes hex to rgb(); compare against the known rgb() expansion.
    expect(el.style.borderColor).toBe(ERROR_BORDER_RGB);
  });

  it("applies normal BORDER (#30363d) when error is not set", () => {
    render(<TextField />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.style.borderColor).toBe(BORDER_RGB);
  });
});

describe("TextField — mono variant", () => {
  it("applies CSS_FONT_MONO when mono=true", () => {
    render(<TextField mono />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.style.fontFamily).toBe(CSS_FONT_MONO);
  });

  it("applies FONT (system-ui stack) when mono is not set", () => {
    render(<TextField />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    // jsdom may normalize single quotes in font-family to double quotes.
    // Assert on the presence of the primary font token rather than exact string.
    expect(el.style.fontFamily).toContain("system-ui");
  });
});

describe("TextField — style and className override", () => {
  it("merges caller style over base styles", () => {
    render(<TextField style={{ color: "red" }} />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.style.color).toBe("red");
  });

  it("forwards className", () => {
    render(<TextField className="my-class" />);
    const el = screen.getByRole("textbox") as HTMLInputElement;
    expect(el.className).toBe("my-class");
  });
});
