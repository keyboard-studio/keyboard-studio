// Fixture keyboards for the spec 095 documentation tests: one per input
// mechanism the derived docs describe, plus a touch layout, a keyboard with no
// touch layout, and one large enough to switch the typing guide to its summary.
// Inline `.kmn` sources parsed to IR, so no keyboard outside the repo is
// referenced. Shared by docContent, the output-level forms and inherited-docs
// tests, and the Layer C docs-lint test.

import type { KeyboardIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { parseKmn, parseTouchLayout } from "@keyboard-studio/engine";

export interface DocFixture {
  id: string;
  kmn: string;
  ir: KeyboardIR;
  touchLayout: TouchLayoutIR | null;
  /** Raw `.keyman-touch-layout` JSON, for tests that stage the file in a VFS. */
  touchLayoutJson: string | null;
}

function kmnSource(id: string, rules: readonly string[]): string {
  return [
    `store(&NAME) '${id}'`,
    "store(&VERSION) '10.0'",
    "store(&KEYBOARDVERSION) '2.3'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    ...rules,
    "",
  ].join("\n");
}

function fixture(id: string, rules: readonly string[], touchLayoutJson: string | null = null): DocFixture {
  const kmn = kmnSource(id, rules);
  return {
    id,
    kmn,
    ir: parseKmn(kmn, id).ir,
    touchLayout: touchLayoutJson !== null ? parseTouchLayout(touchLayoutJson) : null,
    touchLayoutJson,
  };
}

/** Acute deadkey on the apostrophe key, in the corpus store fan-out shape: ' then e gives é. */
export const DEADKEY_FIXTURE = fixture("doc_deadkey", [
  "store(acuteBase) 'ea'",
  "store(acuteOut) U+00E9 U+00E1",
  "+ [K_QUOTE] > dk(1)",
  "dk(1) + any(acuteBase) > index(acuteOut, 2)",
]);

/** Right-Alt layer: AltGr+N gives ŋ, AltGr+E gives ɛ. */
export const RIGHT_ALT_FIXTURE = fixture("doc_ralt", [
  "+ [RALT K_N] > U+014B",
  "+ [RALT K_E] > U+025B",
]);

/** Deadkey and right-Alt together: the US2 Independent Test keyboard. */
export const DEADKEY_RIGHT_ALT_FIXTURE = fixture("doc_deadkey_ralt", [
  "store(acuteBase) 'e'",
  "store(acuteOut) U+00E9",
  "+ [K_QUOTE] > dk(1)",
  "dk(1) + any(acuteBase) > index(acuteOut, 2)",
  "+ [RALT K_N] > U+014B",
]);

/** Repeat-to-cycle (rota): ; gives ɛ, a second ; turns it into ɔ. */
export const ROTA_FIXTURE = fixture("doc_rota", [
  "+ [K_COLON] > U+025B",
  "U+025B + [K_COLON] > U+0254",
]);

/** Combining marks typed after the base letter. */
export const COMBINING_FIXTURE = fixture("doc_combining", [
  "+ [RALT K_1] > U+0301",
  "+ [RALT K_2] > U+0300",
]);

const TOUCH_LAYOUT_JSON = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [
          {
            id: 1,
            key: [
              {
                id: "K_N",
                text: "n",
                sk: [{ id: "U_014B", text: "ŋ" }],
              },
              {
                id: "K_E",
                text: "e",
                flick: { n: { id: "U_025B", text: "ɛ" } },
              },
            ],
          },
        ],
      },
    ],
  },
});

/** Right-Alt keyboard with a phone layout carrying a long-press and a flick. */
export const TOUCH_FIXTURE = fixture(
  "doc_touch",
  ["+ [RALT K_N] > U+014B", "+ [RALT K_E] > U+025B"],
  TOUCH_LAYOUT_JSON,
);

/** Plain ASCII keyboard with no touch layout: no guide rows, no mechanisms. */
export const NO_TOUCH_FIXTURE = fixture("doc_plain", ["+ [K_A] > 'a'", "+ [K_1] > '1'"]);

/** More than 200 non-ASCII characters (Cyrillic and Greek blocks via two-letter mnemonics), so the guide switches to its summary. */
export const LARGE_FIXTURE = fixture(
  "doc_large",
  Array.from({ length: 210 }, (_, i) => {
    const first = String.fromCharCode(0x61 + Math.floor(i / 26));
    const second = String.fromCharCode(0x61 + (i % 26));
    const cp = (0x0400 + i).toString(16).toUpperCase().padStart(4, "0");
    return `'${first}' + '${second}' > U+${cp}`;
  }),
);

export const DOC_FIXTURES: readonly DocFixture[] = [
  DEADKEY_FIXTURE,
  RIGHT_ALT_FIXTURE,
  DEADKEY_RIGHT_ALT_FIXTURE,
  ROTA_FIXTURE,
  COMBINING_FIXTURE,
  TOUCH_FIXTURE,
  NO_TOUCH_FIXTURE,
  LARGE_FIXTURE,
];
