// Unit tests for ui/ErrorText.tsx
//
// Assertions:
//   1. Renders a <div> element.
//   2. tone="error" → role="alert".
//   3. tone="warning" → role="alert".
//   4. tone="hint" → role="status".
//   5. Error tone applies ERROR_TEXT color (var(--app-danger-text)).
//   6. Warning tone applies WARNING color (var(--app-warning-text)).
//   7. Hint tone applies CSS_TEXT_MUTED (var(--app-text-muted)).
//   8. Children appear as text content.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ErrorText } from "./ErrorText.tsx";

afterEach(() => {
  cleanup();
});

describe("ErrorText — element and children", () => {
  it("renders a div element", () => {
    const { container } = render(<ErrorText tone="error">msg</ErrorText>);
    expect(container.querySelector("div")).not.toBeNull();
  });

  it("renders children as text content", () => {
    const { container } = render(
      <ErrorText tone="error">Invalid keyboard id</ErrorText>
    );
    expect(container.textContent).toBe("Invalid keyboard id");
  });
});

describe("ErrorText — tone→role mapping", () => {
  it("tone='error' → role='alert'", () => {
    const { container } = render(<ErrorText tone="error">err</ErrorText>);
    const el = container.querySelector("div");
    expect(el?.getAttribute("role")).toBe("alert");
  });

  it("tone='warning' → role='alert'", () => {
    const { container } = render(<ErrorText tone="warning">warn</ErrorText>);
    const el = container.querySelector("div");
    expect(el?.getAttribute("role")).toBe("alert");
  });

  it("tone='hint' → role='status'", () => {
    const { container } = render(<ErrorText tone="hint">hint text</ErrorText>);
    const el = container.querySelector("div");
    expect(el?.getAttribute("role")).toBe("status");
  });
});

describe("ErrorText — tone colors", () => {
  it("error tone uses ERROR_TEXT (var(--app-danger-text))", () => {
    const { container } = render(<ErrorText tone="error">err</ErrorText>);
    const el = container.querySelector("div") as HTMLElement;
    // CSS vars are not resolved in jsdom; the raw string is preserved.
    expect(el.style.color).toBe("var(--app-danger-text)");
  });

  it("warning tone uses WARNING (var(--app-warning-text))", () => {
    const { container } = render(<ErrorText tone="warning">warn</ErrorText>);
    const el = container.querySelector("div") as HTMLElement;
    expect(el.style.color).toBe("var(--app-warning-text)");
  });

  it("hint tone uses CSS_TEXT_MUTED (var(--app-text-muted))", () => {
    const { container } = render(<ErrorText tone="hint">hint</ErrorText>);
    const el = container.querySelector("div") as HTMLElement;
    // CSS vars are not resolved in jsdom; the raw string is preserved.
    expect(el.style.color).toBe("var(--app-text-muted)");
  });
});
