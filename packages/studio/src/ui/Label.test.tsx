// Unit tests for ui/Label.tsx
//
// Assertions:
//   1. Renders a <label> element.
//   2. Children appear as label text.
//   3. required=true renders the asterisk marker with aria-label="required".
//   4. required=false (default) does NOT render the asterisk marker.
//   5. Native HTML props (htmlFor, id, style) pass through to the element.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Label } from "./Label.tsx";

afterEach(() => {
  cleanup();
});

describe("Label", () => {
  it("renders a label element", () => {
    const { container } = render(<Label>Script</Label>);
    const el = container.querySelector("label");
    expect(el).not.toBeNull();
  });

  it("renders children as label text", () => {
    render(<Label>Keyboard ID</Label>);
    expect(screen.getByText("Keyboard ID")).toBeDefined();
  });

  it("required=true renders the asterisk marker with aria-label='required'", () => {
    render(<Label required>Display name</Label>);
    const marker = screen.getByLabelText("required");
    expect(marker).toBeDefined();
    expect(marker.textContent).toBe("*");
  });

  it("required marker uses the exact #e74c3c color", () => {
    render(<Label required>Label</Label>);
    const marker = screen.getByLabelText("required");
    expect((marker as HTMLElement).style.color).toBe("rgb(231, 76, 60)");
  });

  it("required is false by default — no asterisk rendered", () => {
    render(<Label>Optional field</Label>);
    expect(screen.queryByLabelText("required")).toBeNull();
  });

  it("passes htmlFor to the underlying <label>", () => {
    const { container } = render(<Label htmlFor="my-input">My label</Label>);
    const el = container.querySelector("label");
    expect(el?.getAttribute("for")).toBe("my-input");
  });

  it("merges caller style with base style", () => {
    const { container } = render(
      <Label style={{ marginBottom: 12 }}>Merged</Label>
    );
    const el = container.querySelector("label") as HTMLElement;
    // Base style sets fontSize 13 and caller overrides marginBottom.
    expect(el.style.fontSize).toBe("13px");
    expect(el.style.marginBottom).toBe("12px");
  });
});
