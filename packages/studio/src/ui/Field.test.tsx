// Field.test.tsx — vitest + @testing-library/react
//
// Label.tsx is created by a sibling agent in this cycle. To keep this test
// self-contained we vi.mock("./Label.tsx") with a minimal stub that renders
// the same <label> element Label produces in reality.
// The component file imports the real ./Label.tsx unconditionally.
//
// No @testing-library/jest-dom — DOM APIs used directly, matching
// TextField.test.tsx / Badge.test.tsx pattern.
//
// jsdom hex normalizations:
//   #8b949e → rgb(139, 148, 158)  (TEXT_DIM / HELP_STYLE color)
//   #f0a0a0 → rgb(240, 160, 160)  (ERROR_TEXT / error slot color)
//   #e74c3c → rgb(231, 76, 60)    (required marker from Label stub)

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Stub Label before importing Field so the module graph resolves cleanly.
// The stub matches the API and DOM output the real Label.tsx will produce.
// ---------------------------------------------------------------------------
vi.mock("./Label.tsx", () => ({
  Label: ({
    children,
    htmlFor,
    required,
    style,
  }: {
    children?: React.ReactNode;
    htmlFor?: string;
    required?: boolean;
    style?: React.CSSProperties;
  }) => (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: 13,
        color: "#e6edf3",
        fontWeight: 600,
        marginBottom: 6,
        ...style,
      }}
    >
      {children}
      {required === true && (
        <span
          aria-label="required"
          style={{ color: "#e74c3c", marginLeft: 4 }}
        >
          *
        </span>
      )}
    </label>
  ),
}));

import { Field } from "./Field.tsx";

afterEach(() => {
  cleanup();
});

describe("Field — container element", () => {
  it("renders a <div> container", () => {
    const { container } = render(<Field />);
    expect(container.querySelector("div")).not.toBeNull();
  });

  it("container has flex-column layout", () => {
    const { container } = render(<Field />);
    const div = container.querySelector("div") as HTMLElement;
    expect(div.style.display).toBe("flex");
    expect(div.style.flexDirection).toBe("column");
  });

  it("container has gap 4px", () => {
    const { container } = render(<Field />);
    const div = container.querySelector("div") as HTMLElement;
    expect(div.style.gap).toBe("4px");
  });
});

describe("Field — label slot", () => {
  it("renders a <label> element when label prop is provided", () => {
    const { container } = render(<Field label="Display name" fieldId="dn" />);
    expect(container.querySelector("label")).not.toBeNull();
  });

  it("label has htmlFor matching fieldId", () => {
    const { container } = render(<Field label="Display name" fieldId="dn" />);
    const label = container.querySelector("label") as HTMLLabelElement;
    expect(label.getAttribute("for")).toBe("dn");
  });

  it("label contains the label text", () => {
    const { container } = render(<Field label="Display name" fieldId="dn" />);
    expect(container.querySelector("label")?.textContent).toContain(
      "Display name",
    );
  });

  it("renders required marker when required=true", () => {
    const { container } = render(
      <Field label="Name" fieldId="name" required />,
    );
    const marker = container.querySelector("[aria-label='required']");
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toBe("*");
  });

  it("does not render required marker when required=false (default)", () => {
    const { container } = render(<Field label="Name" fieldId="name" />);
    expect(container.querySelector("[aria-label='required']")).toBeNull();
  });

  it("renders a ReactNode label as-is (no Label wrapper, avoids nested-<label>)", () => {
    const { container } = render(
      <Field label={<strong>Bold label</strong>} fieldId="x" />,
    );
    // Non-string ReactNode is rendered directly — no extra <label> wrapper.
    expect(container.querySelector("strong")).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("Bold label");
    // No <label> element should be auto-generated for a non-string label.
    expect(container.querySelector("label")).toBeNull();
  });

  it("does not render a <label> element when label prop is omitted", () => {
    const { container } = render(
      <Field>
        <input id="x" />
      </Field>,
    );
    expect(container.querySelector("label")).toBeNull();
  });
});

describe("Field — help slot", () => {
  it("renders help text when help prop is provided", () => {
    const { container } = render(
      <Field help="This is help text">
        <input />
      </Field>,
    );
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe("This is help text");
  });

  it("renders help text as a <p> element", () => {
    const { container } = render(
      <Field help="Help here">
        <input />
      </Field>,
    );
    expect(container.querySelector("p")).not.toBeNull();
  });

  it("help <p> has HELP_STYLE color (#8b949e)", () => {
    const { container } = render(
      <Field help="Some hint">
        <input />
      </Field>,
    );
    const p = container.querySelector("p") as HTMLElement;
    expect(p.style.color).toBe("rgb(139, 148, 158)");
  });

  it("help <p> has fontSize 12px", () => {
    const { container } = render(
      <Field help="hint">
        <input />
      </Field>,
    );
    const p = container.querySelector("p") as HTMLElement;
    expect(p.style.fontSize).toBe("12px");
  });

  it("does not render a <p> when help prop is omitted", () => {
    const { container } = render(
      <Field label="Name">
        <input />
      </Field>,
    );
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("Field — children (control slot)", () => {
  it("renders a text input child", () => {
    const { container } = render(
      <Field label="ID" fieldId="id">
        <input id="id" type="text" />
      </Field>,
    );
    expect(container.querySelector("input[type='text']")).not.toBeNull();
  });

  it("renders multiple radio children", () => {
    const { container } = render(
      <Field label="Options" fieldId="opts">
        <input type="radio" id="opt-a" name="opts" />
        <input type="radio" id="opt-b" name="opts" />
      </Field>,
    );
    const radios = container.querySelectorAll("input[type='radio']");
    expect(radios).toHaveLength(2);
  });

  it("renders no children when none are provided", () => {
    const { container } = render(<Field label="Empty" />);
    // Only the label element should be present (no input/textarea/etc.)
    expect(container.querySelector("input")).toBeNull();
  });
});

describe("Field — error slot", () => {
  it("renders error text when error prop is provided", () => {
    const { container } = render(
      <Field error="This field is required">
        <input />
      </Field>,
    );
    const alert = container.querySelector("[role='alert']");
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe("This field is required");
  });

  it("error node has role=alert for screen reader announcement", () => {
    const { container } = render(
      <Field error="Bad input">
        <input />
      </Field>,
    );
    expect(container.querySelector("[role='alert']")).not.toBeNull();
  });

  it("does not render a role=alert node when error prop is omitted", () => {
    const { container } = render(
      <Field label="Name">
        <input />
      </Field>,
    );
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("error text applies ERROR_TEXT color (#f0a0a0)", () => {
    const { container } = render(
      <Field error="Invalid">
        <input />
      </Field>,
    );
    const alert = container.querySelector("[role='alert']") as HTMLElement;
    expect(alert.style.color).toBe("rgb(240, 160, 160)");
  });

  it("error text has fontSize 12px", () => {
    const { container } = render(
      <Field error="Invalid">
        <input />
      </Field>,
    );
    const alert = container.querySelector("[role='alert']") as HTMLElement;
    expect(alert.style.fontSize).toBe("12px");
  });
});

describe("Field — document order: label → help → children → error", () => {
  it("slots appear in the correct order", () => {
    const { container } = render(
      <Field
        label="Name"
        fieldId="n"
        help="Some help"
        error="Some error"
      >
        <input id="n" />
      </Field>,
    );
    const children = Array.from(
      container.querySelector("div")?.children ?? [],
    );
    // 0: label, 1: p (help), 2: input, 3: div[role=alert]
    expect(children[0]?.tagName).toBe("LABEL");
    expect(children[1]?.tagName).toBe("P");
    expect(children[2]?.tagName).toBe("INPUT");
    expect(children[3]?.getAttribute("role")).toBe("alert");
  });
});

describe("Field — style and className pass-through", () => {
  it("merges caller style onto the container", () => {
    const { container } = render(
      <Field style={{ marginBottom: "20px" }}>
        <input />
      </Field>,
    );
    const div = container.querySelector("div") as HTMLElement;
    expect(div.style.marginBottom).toBe("20px");
  });

  it("forwards className to the container", () => {
    const { container } = render(
      <Field className="field-row">
        <input />
      </Field>,
    );
    const div = container.querySelector("div") as HTMLElement;
    expect(div.classList.contains("field-row")).toBe(true);
  });
});
