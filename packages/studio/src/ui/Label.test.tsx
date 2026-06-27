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

describe("Label — as='span' variant", () => {
  it("renders a <span> when as='span'", () => {
    const { container } = render(<Label as="span">Group heading</Label>);
    expect(container.querySelector("span")).not.toBeNull();
    expect(container.querySelector("label")).toBeNull();
  });

  it("renders children in the span", () => {
    render(<Label as="span">My heading</Label>);
    expect(screen.getByText("My heading")).toBeDefined();
  });

  it("span carries the id prop", () => {
    const { container } = render(
      <Label as="span" id="label-q1">
        Heading
      </Label>
    );
    const el = container.querySelector("span") as HTMLElement;
    expect(el.id).toBe("label-q1");
  });

  it("required=true renders asterisk marker inside span", () => {
    render(
      <Label as="span" required>
        Required group
      </Label>
    );
    const marker = screen.getByLabelText("required");
    expect(marker.textContent).toBe("*");
  });

  it("span uses the same base styles as label (fontSize 13, fontWeight 600)", () => {
    const { container } = render(<Label as="span">Styled</Label>);
    const el = container.querySelector("span") as HTMLElement;
    expect(el.style.fontSize).toBe("13px");
    expect(el.style.fontWeight).toBe("600");
  });

  it("default as='label' still renders <label> element", () => {
    const { container } = render(<Label>Default</Label>);
    expect(container.querySelector("label")).not.toBeNull();
    expect(container.querySelector("span")).toBeNull();
  });
});
