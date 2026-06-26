// Card.test.tsx — vitest + @testing-library/react
// Asserts element/role, CARD_BASE vs CARD_SELECTED styles, selected toggle,
// and pass-through behavior.
//
// No @testing-library/jest-dom — DOM style properties accessed directly,
// matching the TextField.test.tsx / Badge.test.tsx pattern.
//
// jsdom hex normalizations:
//   #161b22 → rgb(22, 27, 34)    (BG_CARD / CARD_BASE background)
//   #0d1f38 → rgb(13, 31, 56)    (CARD_SELECTED background)
//   #30363d → rgb(48, 54, 61)    (BORDER / CARD_BASE border)
//   #6ea8fe → rgb(110, 168, 254) (ACCENT / CARD_SELECTED border)
//   #e6edf3 → rgb(230, 237, 243) (TEXT_MAIN)

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Card } from "./Card.tsx";

afterEach(() => {
  cleanup();
});

describe("Card — default element (as=button)", () => {
  it("renders a <button> element by default", () => {
    const { container } = render(<Card>Option</Card>);
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("defaults type to button", () => {
    const { container } = render(<Card>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.type).toBe("button");
  });

  it("renders children as text content", () => {
    const { container } = render(<Card>Track 1</Card>);
    expect(container.textContent).toBe("Track 1");
  });
});

describe("Card — as=div", () => {
  it("renders a <div> when as=div", () => {
    const { container } = render(<Card as="div">Content</Card>);
    expect(container.querySelector("div")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders children inside the div", () => {
    const { container } = render(<Card as="div">Display only</Card>);
    expect(container.textContent).toBe("Display only");
  });
});

describe("Card — CARD_BASE styles (selected=false)", () => {
  it("applies CARD_BASE background (#161b22)", () => {
    const { container } = render(<Card>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("rgb(22, 27, 34)");
  });

  it("applies CARD_BASE border color (#30363d)", () => {
    const { container } = render(<Card>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.borderColor).toBe("rgb(48, 54, 61)");
  });

  it("applies flex-column layout", () => {
    const { container } = render(<Card>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.display).toBe("flex");
    expect(btn.style.flexDirection).toBe("column");
  });

  it("applies border-radius 8px", () => {
    const { container } = render(<Card>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.borderRadius).toBe("8px");
  });

  it("applies cursor:pointer", () => {
    const { container } = render(<Card>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.cursor).toBe("pointer");
  });

  it("applies text-align:left", () => {
    const { container } = render(<Card>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.textAlign).toBe("left");
  });
});

describe("Card — CARD_SELECTED styles (selected=true)", () => {
  it("applies CARD_SELECTED background (#0d1f38)", () => {
    const { container } = render(<Card selected>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("rgb(13, 31, 56)");
  });

  it("applies accent border color (#6ea8fe)", () => {
    const { container } = render(<Card selected>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.borderColor).toBe("rgb(110, 168, 254)");
  });
});

describe("Card — selected toggle via prop change", () => {
  it("switches from CARD_BASE to CARD_SELECTED background when selected becomes true", () => {
    const { container, rerender } = render(<Card selected={false}>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("rgb(22, 27, 34)");

    rerender(<Card selected={true}>Option</Card>);
    expect(btn.style.background).toBe("rgb(13, 31, 56)");
  });

  it("switches back from CARD_SELECTED to CARD_BASE when selected becomes false", () => {
    const { container, rerender } = render(<Card selected={true}>Option</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.background).toBe("rgb(13, 31, 56)");

    rerender(<Card selected={false}>Option</Card>);
    expect(btn.style.background).toBe("rgb(22, 27, 34)");
  });
});

describe("Card — role and aria pass-through (TrackStep pattern)", () => {
  it("forwards role='radio' prop", () => {
    render(<Card role="radio">Copy</Card>);
    expect(screen.getByRole("radio", { name: "Copy" })).not.toBeNull();
  });

  it("forwards aria-checked='true'", () => {
    const { container } = render(
      <Card role="radio" aria-checked={true}>
        Copy
      </Card>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.getAttribute("aria-checked")).toBe("true");
  });

  it("forwards aria-checked='false'", () => {
    const { container } = render(
      <Card role="radio" aria-checked={false}>
        Adapt
      </Card>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.getAttribute("aria-checked")).toBe("false");
  });
});

describe("Card — onClick", () => {
  it("calls onClick when clicked", () => {
    const handler = vi.fn();
    const { container } = render(<Card onClick={handler}>Copy</Card>);
    fireEvent.click(container.querySelector("button")!);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("Card — style and className pass-through", () => {
  it("merges caller style over base card styles", () => {
    const { container } = render(
      <Card style={{ padding: "20px 24px" }}>Custom</Card>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.style.padding).toBe("20px 24px");
  });

  it("forwards className to the element", () => {
    const { container } = render(<Card className="my-card">Click</Card>);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.className).toBe("my-card");
  });
});

describe("Card — complex children", () => {
  it("renders nested span children", () => {
    const { container } = render(
      <Card>
        <span>Title</span>
        <span>Description</span>
      </Card>,
    );
    const spans = container.querySelectorAll("span");
    expect(spans).toHaveLength(2);
    expect(spans[0]?.textContent).toBe("Title");
    expect(spans[1]?.textContent).toBe("Description");
  });
});
