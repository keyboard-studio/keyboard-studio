import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MultiSelect } from "./MultiSelect.tsx";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
];

describe("MultiSelect", () => {
  it("renders a div with role=group", () => {
    render(<MultiSelect options={OPTIONS} selected={[]} onChange={() => undefined} />);
    expect(screen.getByRole("group")).toBeDefined();
  });

  it("renders one checkbox per option", () => {
    render(<MultiSelect options={OPTIONS} selected={[]} onChange={() => undefined} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("checks boxes whose values are in selected", () => {
    render(
      <MultiSelect options={OPTIONS} selected={["en", "de"]} onChange={() => undefined} />
    );
    const en = screen.getByLabelText("English") as HTMLInputElement;
    const fr = screen.getByLabelText("French") as HTMLInputElement;
    const de = screen.getByLabelText("German") as HTMLInputElement;
    expect(en.checked).toBe(true);
    expect(fr.checked).toBe(false);
    expect(de.checked).toBe(true);
  });

  it("calls onChange with item added when unchecked box clicked", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} selected={["en"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("French"));
    expect(onChange).toHaveBeenCalledWith(["en", "fr"]);
  });

  it("calls onChange with item removed when checked box clicked", () => {
    const onChange = vi.fn();
    render(
      <MultiSelect options={OPTIONS} selected={["en", "fr"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("French"));
    expect(onChange).toHaveBeenCalledWith(["en"]);
  });

  it("uses accentColor #6ea8fe on each checkbox", () => {
    render(<MultiSelect options={OPTIONS} selected={[]} onChange={() => undefined} />);
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    for (const cb of checkboxes) {
      expect(cb.style.accentColor).toBe("#6ea8fe");
    }
  });

  it("renders option labels as visible text", () => {
    render(<MultiSelect options={OPTIONS} selected={[]} onChange={() => undefined} />);
    expect(screen.getByText("English")).toBeDefined();
    expect(screen.getByText("French")).toBeDefined();
    expect(screen.getByText("German")).toBeDefined();
  });

  it("renders nothing in the group for an empty options array", () => {
    render(<MultiSelect options={[]} selected={[]} onChange={() => undefined} />);
    expect(screen.getByRole("group")).toBeDefined();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("calls onChange with new item when nothing was selected", () => {
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("English"));
    expect(onChange).toHaveBeenCalledWith(["en"]);
  });

  it("default idPrefix is 'multiselect-' — checkbox id is multiselect-{value}", () => {
    const { container } = render(
      <MultiSelect options={OPTIONS} selected={[]} onChange={() => undefined} />
    );
    const first = container.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(first.id).toBe("multiselect-en");
  });

  it("custom idPrefix changes the checkbox id prefix", () => {
    const { container } = render(
      <MultiSelect
        options={OPTIONS}
        selected={[]}
        onChange={() => undefined}
        idPrefix="q1-"
      />
    );
    const first = container.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(first.id).toBe("q1-en");
  });

  it("ariaLabelledby is set on the group div when provided", () => {
    render(
      <MultiSelect
        options={OPTIONS}
        selected={[]}
        onChange={() => undefined}
        ariaLabelledby="label-q1"
      />
    );
    const group = screen.getByRole("group") as HTMLElement;
    expect(group.getAttribute("aria-labelledby")).toBe("label-q1");
  });

  it("ariaLabelledby is absent when not provided (default behavior preserved)", () => {
    render(<MultiSelect options={OPTIONS} selected={[]} onChange={() => undefined} />);
    const group = screen.getByRole("group") as HTMLElement;
    expect(group.getAttribute("aria-labelledby")).toBeNull();
  });
});
