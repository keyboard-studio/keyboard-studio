// facet-transform test fixtures — compilable KeyboardIR builders (spec 039).
//
// IRs are built by PARSING real `.kmn` source (via parseKmn), so every fixture is
// a genuine, compilable keyboard — not a hand-assembled IR that might diverge from
// what the codec produces. Touch layouts are attached via parseTouchLayout.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse as parseKmn } from "../../codec/parse.js";
import { parseTouchLayout } from "../../codec/parse-touch.js";

/** Parse `.kmn` source into a KeyboardIR keyed by `keyboardId`. */
export function parseKeyboard(kmn: string, keyboardId: string): KeyboardIR {
  return parseKmn(kmn, keyboardId).ir;
}

// ---------------------------------------------------------------------------
// US1 — a small, mixed-encoding, behavior-preserving-friendly keyboard
// ---------------------------------------------------------------------------

/** Mixed encoding: one output as a quoted literal, one as U+ notation. */
export const MIXED_ENCODING_KMN = `c mixed encoding fixture
store(&NAME) 'MixedEncoding'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'x'
+ [K_B] > U+0079
`;

// ---------------------------------------------------------------------------
// US1 — split-modifier rules for the modifier-fold precondition test (T013)
// ---------------------------------------------------------------------------

/** Two split-modifier rules with IDENTICAL output → foldable to one CTRL rule. */
export const SPLIT_SHIFT_FOLDABLE_KMN = `c split-modifier foldable fixture
store(&NAME) 'SplitCtrl'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [LCTRL K_A] > 'X'
+ [RCTRL K_A] > 'X'
`;

/** Split-modifier rules whose outputs DIFFER → fold must be refused per-site. */
export const SPLIT_SHIFT_UNFOLDABLE_KMN = `c split-modifier unfoldable fixture
store(&NAME) 'SplitCtrlDiff'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [LCTRL K_A] > 'X'
+ [RCTRL K_A] > 'Y'
`;

// ---------------------------------------------------------------------------
// US3 — NFD base with a matching two-codepoint backspace override
// ---------------------------------------------------------------------------

/** Emits decomposed `a + U+0301`; a backspace override targets that pair. */
export const NFD_WITH_BACKSPACE_KMN = `c nfd + backspace override fixture
store(&NAME) 'NfdBackspace'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a' U+0301
'a' U+0301 + [K_BKSP] > beep
`;

// ---------------------------------------------------------------------------
// Opaque fixture — an SMP literal the codec preserves as a RawKmnFragment
// ---------------------------------------------------------------------------

export const OPAQUE_FRAGMENT_KMN = `c opaque fragment fixture
store(&NAME) 'OpaqueFrag'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a' U+0301
+ [K_Z] > U+10330
`;

// ---------------------------------------------------------------------------
// Compile-breaking fixture — references an undefined group (oracle error)
// ---------------------------------------------------------------------------

export const COMPILE_BREAKING_KMN = `c compile-breaking fixture
store(&NAME) 'BrokenGroup'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a' U+0301
+ [K_B] > use(ghost)
`;

// ---------------------------------------------------------------------------
// Touch-layout builder (US2) — dominant longpress + principled-split + gap + over-budget
// ---------------------------------------------------------------------------

/**
 * Build a phone touch layout JSON with four sk-bearing keys:
 *   - `k_dom`  : a dominant longpress key (2 sub-keys) — should convert.
 *   - `k_split`: a principled-split key (2 sub-keys) — preserved by default.
 *   - `k_over` : an over-budget key (9 sub-keys) — refused per-site.
 *   - `k_gap`  : a key that is a gap-omission exception (2 sub-keys).
 */
export function buildTouchLayoutJson(): string {
  const sk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `sub_${i}`, text: String.fromCharCode(97 + i) }));
  const layout = {
    phone: {
      font: "Arial",
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "k_dom", text: "d", sk: sk(2) },
                { id: "k_split", text: "s", sk: sk(2) },
                { id: "k_over", text: "o", sk: sk(9) },
                { id: "k_gap", text: "g", sk: sk(2) },
              ],
            },
          ],
        },
      ],
    },
  };
  return JSON.stringify(layout);
}

/** Parse `buildTouchLayoutJson()` and attach it to `ir` (copy). */
export function attachTouchLayout(ir: KeyboardIR): KeyboardIR {
  return { ...ir, touchLayout: parseTouchLayout(buildTouchLayoutJson()) };
}

/** Find a touch key's IR nodeId by its wire `id` (for building measurements). */
export function touchKeyNodeId(ir: KeyboardIR, keyId: string): string {
  const layout = ir.touchLayout;
  if (layout === undefined) throw new Error("touchKeyNodeId: ir has no touchLayout");
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (key.id === keyId) return key.nodeId;
        }
      }
    }
  }
  throw new Error(`touchKeyNodeId: key "${keyId}" not found`);
}
