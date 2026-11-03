// Unit tests for the Code tab's lint pipeline (touchCodeLint.ts).
//
// Coverage:
//  1. Syntax error → a single JSON_SYNTAX error marker (offset-mapped).
//  2. Valid JSON with a non-object shape → TOUCH_LAYOUT_SHAPE error marker.
//  3. One test per 18-x check in the pipeline → its finding code surfaces as
//     a marker (proves the wiring, not the check logic itself — the checks
//     have their own suites).
//  4. A clean layout → no markers, parsed: true.
//  5. Markers are file-level (the checks carry no source positions).

import { describe, expect, it } from "vitest";
import {
  jsonErrorPosition,
  lintTouchLayoutText,
} from "./touchCodeLint.ts";

function layer(
  id: string,
  rows: string[][],
  extraKeyJson: (keyId: string) => string = () => "",
): string {
  const rowJson = rows
    .map(
      (keys, i) =>
        `{"id": ${i + 1}, "key": [${keys
          .map((k) => `{"id": "${k}", "text": "${k}"${extraKeyJson(k)}}`)
          .join(", ")}]}`,
    )
    .join(", ");
  return `{"id": "${id}", "row": [${rowJson}]}`;
}

// Warning-free base: phone/default, 4 rows, required keys present, unique
// ids, no longpress, no nextlayer.
const CLEAN = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              { id: "K_Q", text: "q" },
              { id: "K_W", text: "w" },
              { id: "K_LOPT", text: "*" },
              { id: "K_BKSP", text: "bksp" },
            ],
          },
          {
            id: 2,
            key: [
              { id: "K_A", text: "a" },
              { id: "K_ENTER", text: "enter" },
            ],
          },
          { id: 3, key: [{ id: "K_Z", text: "z" }] },
          { id: 4, key: [{ id: "K_SPACE", text: " " }] },
        ],
      },
    ],
  },
});

function withPhoneLayers(layersJson: string): string {
  return `{"phone": {"layer": [${layersJson}]}}`;
}

describe("lintTouchLayoutText", () => {
  it("maps a JSON syntax error to an error marker at the failure offset", () => {
    const bad = `{"phone": {"layer": [`;
    const result = lintTouchLayoutText(bad);
    expect(result.parsed).toBe(false);
    expect(result.markers).toHaveLength(1);
    const [m] = result.markers;
    expect(m!.code).toBe("JSON_SYNTAX");
    expect(m!.severity).toBe("error");
    // The marker sits at the end of the truncated text (offset-mapped).
    expect(m!.startLineNumber).toBe(1);
    expect(m!.startColumn).toBe(bad.length + 1);
  });

  it("maps a mid-text syntax error to its line and column", () => {
    // Newer V8 omits the position from the message: the marker falls back
    // to the end of the text (line 5 here).
    const bad = `{\n"phone": {\n"layer": [1,\n}\n}`;
    const result = lintTouchLayoutText(bad);
    expect(result.parsed).toBe(false);
    const [m] = result.markers;
    expect(m!.code).toBe("JSON_SYNTAX");
    expect(m!.startLineNumber).toBe(5);
  });

  it("jsonErrorPosition maps an 'at position N' message to line/column", () => {
    // "ab\ncd": position 4 is 'd' — line 2, column 2.
    expect(
      jsonErrorPosition("ab\ncd", "Unexpected token } in JSON at position 4"),
    ).toEqual({ line: 2, column: 2 });
    // Positions past the end clamp to the text length.
    expect(
      jsonErrorPosition("ab", "Unexpected token } in JSON at position 99"),
    ).toEqual({ line: 1, column: 3 });
  });

  it("surfaces valid JSON with a non-layout shape as a shape error", () => {
    const result = lintTouchLayoutText(`[1, 2, 3]`);
    expect(result.parsed).toBe(false);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]!.code).toBe("TOUCH_LAYOUT_SHAPE");
    expect(result.markers[0]!.severity).toBe("error");
  });

  it("returns no markers for a clean layout", () => {
    const result = lintTouchLayoutText(CLEAN);
    expect(result.parsed).toBe(true);
    expect(result.markers).toHaveLength(0);
  });

  it("surfaces an oversize longpress menu (18.1)", () => {
    const sk = Array.from({ length: 9 }, (_, i) => `{"id": "K_LP${i}", "text": "x"}`).join(
      ", ",
    );
    const text = withPhoneLayers(
      layer("default", [["K_Q", "K_LOPT", "K_BKSP", "K_ENTER"]], (k) =>
        k === "K_Q" ? `, "sk": [${sk}]` : "",
      ),
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_LONGPRESS_OVERSIZE");
  });

  it("surfaces a phone layer with too few rows (18.2)", () => {
    const text = withPhoneLayers(
      layer("default", [["K_Q", "K_LOPT", "K_BKSP"], ["K_ENTER"]]),
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_TOUCH_ROW_COUNT");
  });

  it("surfaces a row with too many keys (18.3)", () => {
    const many = Array.from({ length: 11 }, (_, i) => `K_K${i}`);
    const text = withPhoneLayers(
      layer("default", [many, ["K_LOPT"], ["K_BKSP"], ["K_ENTER"]]),
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_TOUCH_KEYS_PER_ROW");
  });

  it("surfaces control-key drift across layers (18.4a)", () => {
    const text = withPhoneLayers(
      [
        layer(
          "default",
          [["K_BKSP", "K_LOPT", "K_ENTER"], ["K_Q"], ["K_A"], ["K_Z"]],
        ),
        layer(
          "shift",
          [["K_Q"], ["K_BKSP", "K_LOPT", "K_ENTER"], ["K_A"], ["K_Z"]],
        ),
      ].join(", "),
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_CONTROL_KEY_DRIFT");
  });

  it("surfaces a duplicated key id (18.4b)", () => {
    const text = withPhoneLayers(
      layer(
        "default",
        [["K_Q", "K_Q", "K_LOPT", "K_BKSP"], ["K_ENTER"], ["K_A"], ["K_Z"]],
      ),
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_TOUCH_DUPLICATE_KEY_ID");
  });

  it("surfaces a missing required key (18.4c)", () => {
    const text = withPhoneLayers(
      layer("default", [["K_Q", "K_LOPT", "K_BKSP"], ["K_A"], ["K_Z"], ["K_X"]]),
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_TOUCH_MISSING_REQUIRED_KEY");
  });

  it("surfaces a layer switch with no return (18.5a)", () => {
    const text = withPhoneLayers(
      [
        `{"id": "default", "row": [{"id": 1, "key": [{"id": "K_Q", "text": "q", "nextlayer": "shift"}, {"id": "K_LOPT", "text": "*"}, {"id": "K_BKSP", "text": "b"}, {"id": "K_ENTER", "text": "e"}]}, {"id": 2, "key": []}, {"id": 3, "key": []}, {"id": 4, "key": []}]}`,
        layer("shift", [["K_A", "K_LOPT", "K_BKSP", "K_ENTER"], ["K_Q"], ["K_Z"], ["K_X"]]),
      ].join(", "),
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_LAYER_SWITCH_NO_RETURN");
  });

  it("surfaces a nextlayer pointing at a missing layer (18.5b)", () => {
    const text = withPhoneLayers(
      `{"id": "default", "row": [{"id": 1, "key": [{"id": "K_Q", "text": "q", "nextlayer": "nosuchlayer"}, {"id": "K_LOPT", "text": "*"}, {"id": "K_BKSP", "text": "b"}, {"id": "K_ENTER", "text": "e"}]}, {"id": 2, "key": []}, {"id": 3, "key": []}, {"id": 4, "key": []}]}`,
    );
    const codes = lintTouchLayoutText(text).markers.map((m) => m.code);
    expect(codes).toContain("KM_WARN_TOUCH_MISSING_LAYER");
  });

  it("emits file-level markers (the checks carry no source positions)", () => {
    const text = withPhoneLayers(
      layer("default", [["K_Q", "K_LOPT", "K_BKSP"], ["K_ENTER"]]),
    );
    const result = lintTouchLayoutText(text);
    expect(result.markers.length).toBeGreaterThan(0);
    for (const m of result.markers) {
      expect(m.startLineNumber).toBe(1);
      expect(m.message).toContain(`[${m.code}]`);
    }
  });
});
