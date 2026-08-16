/**
 * touchKeyRuleJoin — the single reduced, deliberately DEFECTIVE
 * Cameroon-derived fixture behind the touch key↔rule join (spec 063).
 *
 * ## Why it is built inline rather than read from disk
 *
 * `@keyboard-studio/contracts` is the dependency root and must stay I/O-free and
 * browser-safe, so it cannot read `../keyboards`. More importantly the fixture
 * needs defects the real `sil_cameroon_qwerty.kmn` does not have — an orphan
 * rule pair, an in-layer duplicate id, a stranded layer. The real corpus files
 * are still used, as skip-if-absent canaries in engine and studio; those pin
 * real-world numbers, this pins semantics.
 *
 * ## Why there is exactly ONE fixture
 *
 * It feeds three otherwise-separate suites — the role matrix, the reachability
 * view, and the applier-twin equivalence test — deliberately. A second fixture
 * for the appliers would let the twins agree with each other while disagreeing
 * with the structure the join reasons about, which is precisely the drift the
 * twin test exists to catch. Add cases here; do not fork it.
 *
 * ## What it carries, and which obligation each item serves
 *
 * | Structure | Serves |
 * |---|---|
 * | `T_0300` + its `any(diablock) … > context` guard | guard-then-producing role order; the mark-key under-credit shape |
 * | `[SHIFT T_0301]` guard + producing pair | modifier capture on a doubled mark key |
 * | `T_FCFA > "FCFA"` | multi-char `producedText` |
 * | `T_CAM > nul` **with** a `nextlayer` | `suppresses` is wired-not-dead; the 0x092 nextlayer exemption |
 * | `T_GO > use(other)` | `transitions` |
 * | `T_OPAQUE > <raw>` + a `RawKmnFragment` | `opaque`; a non-zero `opaqueFragmentCount` |
 * | `T_IDX > index(…)` / `T_OUTS > outs(…)` | store-driven production ⇒ `producedText` absent |
 * | `K_QUOTE > U+0300` under a `◌̀` keycap | the `K_` half of the same under-credit defect |
 * | `T_CaseTest` in the layout vs `T_CASETEST` in the rule | case normalization + as-written spelling capture |
 * | `T_BLANK` (sp 9), `*Shift*` frame key | ruleless keys that must NOT read as dead |
 * | `T_NORULE` | the one key that genuinely IS dead |
 * | `U_00A1` / `U_203D` longpresses under `T_0021` | sub-key descent; `U_` ids self-output |
 * | `T_DUP` twice in one layer | the duplicate-id finding |
 * | `T_LAYERDUP` twice, disambiguated by `layer` | the duplicate-id EXEMPTION that needs `TouchKeyIR.layer` |
 * | `T_03B1` rule pair, layout carries only `U_03B1` | THE INJECTED AZERTY ORPHAN (absent, with a near-miss) |
 * | `T_STRANDED` on an unreachable layer | orphaned-by-unreachable-layer, told apart from absent |
 * | a `tablet` platform carrying `T_0300` | reachability is unioned across platforms |
 *
 * Every builder returns FRESH, deeply-independent objects on each call: the
 * appliers mutate what they are given, so a shared frozen constant would let one
 * test's edit leak into the next.
 */

import type {
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
  RawKmnFragment,
  TouchKeyIR,
  TouchLayoutIR,
} from "../keyboard-ir.js";

// ---------------------------------------------------------------------------
// Named ids — assertions reference these rather than re-typing string literals,
// so a rename here cannot leave a test silently asserting on a key that no
// longer exists (it would fail to compile instead).
// ---------------------------------------------------------------------------

export const TOUCH_JOIN_IDS = {
  /** Mark key with a guard rule; keycap `◌̀`. */
  mark: "T_0300",
  /** SHIFT-doubled mark key; keycap `◌́`, lives on the `shift` layer. */
  markShift: "T_0301",
  /** Multi-char output (`"FCFA"`). */
  multiChar: "T_FCFA",
  /** `> nul` key that also carries a `nextlayer` — wired, not dead. */
  suppressed: "T_CAM",
  /** `> use(other)` group transition. */
  transition: "T_GO",
  /** Output the codec could not type. */
  opaque: "T_OPAQUE",
  /** `index()`-driven output. */
  storeIndex: "T_IDX",
  /** `outs()`-driven output. */
  storeOuts: "T_OUTS",
  /** Physical key carrying the same under-credit shape as `mark`. */
  physicalMark: "K_QUOTE",
  /** Layout spells it mixed-case; the rule spells it upper-case. */
  caseTest: "T_CaseTest",
  /** As spelled in the rule for {@link caseTest}. */
  caseTestAsWritten: "T_CASETEST",
  /** Sentinel blank (sp 9) — ruleless by design. */
  blank: "T_BLANK",
  /** Frame key with a `*`-prefixed label — ruleless by design. */
  frame: "T_FRAME",
  /** The one genuinely dead key: no rule, no nextlayer, producing sp class. */
  dead: "T_NORULE",
  /** Longpress host with `U_` sub-keys and a flick. */
  longpressHost: "T_0021",
  /** In-layer duplicate pair, NOT disambiguated. */
  duplicate: "T_DUP",
  /** In-layer duplicate pair disambiguated by a per-key `layer` override. */
  layerDuplicate: "T_LAYERDUP",
  /** Orphan: rules exist, the layout carries only the `U_` form below. */
  orphan: "T_03B1",
  /** The orphan's near-miss — a self-outputting `U_` id that bypasses the guard. */
  orphanNearMiss: "U_03B1",
  /** Carried only on a layer the `default` BFS never reaches. */
  stranded: "T_STRANDED",
} as const;

export const TOUCH_JOIN_STORES = {
  /** Cameroon's guard-shaped store: space, digits, ASCII punctuation, no letters. */
  guard: "diablock",
  /** `any()` side of the index()-driven pair. */
  indexFrom: "mc_from",
  /** Output side of the index()/outs()-driven rules. */
  indexTo: "mc_to",
} as const;

/** Layer ids the fixture's phone platform declares. */
export const TOUCH_JOIN_LAYERS = {
  default: "default",
  /** Reachable via the frame key's `nextlayer`. */
  shift: "shift",
  /** Reachable via {@link TOUCH_JOIN_IDS.suppressed}'s `nextlayer`. */
  symbol: "symbol",
  /** Declared but reachable from nothing — the unreachable-layer case. */
  stranded: "stranded",
} as const;

/** The character each producing rule emits, for assertion convenience. */
export const TOUCH_JOIN_PRODUCED = {
  mark: "̀",
  markShift: "́",
  multiChar: "FCFA",
  orphan: "α",
  stranded: "א",
  caseTest: "x",
  duplicate: "d",
  layerDuplicate: "l",
} as const;

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

function guardStoreItems(): IRStore["items"] {
  // Space + digits + a little ASCII punctuation, and deliberately NO letters —
  // the shape the guard-store-reuse detector looks for. This mirrors Cameroon's
  // own `store(diablock)`; it is that keyboard's convention, not a universal
  // one, which is why synthesis derives a fresh guard store from the keyboard's
  // own repertoire rather than copying these characters.
  const chars = [" ", ...Array.from({ length: 10 }, (_, i) => String(i)), ".", ",", "-", "'"];
  return chars.map((value) => ({ kind: "char" as const, value }));
}

function makeStores(): IRStore[] {
  return [
    {
      nodeId: "store#guard",
      name: TOUCH_JOIN_STORES.guard,
      items: guardStoreItems(),
      isSystem: false,
    },
    {
      nodeId: "store#from",
      name: TOUCH_JOIN_STORES.indexFrom,
      items: [
        { kind: "char", value: "a" },
        { kind: "char", value: "e" },
      ],
      isSystem: false,
    },
    {
      nodeId: "store#to",
      name: TOUCH_JOIN_STORES.indexTo,
      items: [
        { kind: "char", value: "ā" },
        { kind: "char", value: "ē" },
      ],
      isSystem: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function vkeyContext(name: string, modifiers: string[] = []): IRRule["context"] {
  return [{ kind: "vkey", name, modifiers }];
}

/** `any(<store>) + [<mods> <key>] > context` — the guard half of a Cameroon pair. */
function guardRule(nodeId: string, keyId: string, modifiers: string[] = []): IRRule {
  return {
    nodeId,
    context: [
      { kind: "any", storeRef: TOUCH_JOIN_STORES.guard },
      // The codec inserts this synthetic `+` separator; the join's struck-key
      // resolution must filter it out before taking the first vkey, which is
      // why the fixture carries it rather than a clean two-element context.
      { kind: "raw", text: "+" },
      { kind: "vkey", name: keyId, modifiers },
    ],
    output: [{ kind: "raw", text: "context" }],
  };
}

/** `+ [<mods> <key>] > <chars>` — the producing half. */
function producingRule(
  nodeId: string,
  keyId: string,
  text: string,
  modifiers: string[] = [],
): IRRule {
  return {
    nodeId,
    context: vkeyContext(keyId, modifiers),
    output: [...text].map((value) => ({ kind: "char" as const, value })),
  };
}

function makeMainGroupRules(): IRRule[] {
  return [
    // --- the mark key and its guard: order is the attested Cameroon order ---
    guardRule("rule#mark-guard", TOUCH_JOIN_IDS.mark),
    producingRule("rule#mark", TOUCH_JOIN_IDS.mark, TOUCH_JOIN_PRODUCED.mark),

    // --- the SHIFT-doubled mark key ---
    guardRule("rule#mark-shift-guard", TOUCH_JOIN_IDS.markShift, ["SHIFT"]),
    producingRule(
      "rule#mark-shift",
      TOUCH_JOIN_IDS.markShift,
      TOUCH_JOIN_PRODUCED.markShift,
      ["SHIFT"],
    ),

    // --- multi-char output: producedText is the whole leading char run ---
    producingRule("rule#multichar", TOUCH_JOIN_IDS.multiChar, TOUCH_JOIN_PRODUCED.multiChar),

    // --- `> nul`: suppresses. Wired, not dead. ---
    {
      nodeId: "rule#suppress",
      context: vkeyContext(TOUCH_JOIN_IDS.suppressed),
      output: [{ kind: "raw", text: "nul" }],
    },

    // --- `> use(other)`: transitions ---
    {
      nodeId: "rule#transition",
      context: vkeyContext(TOUCH_JOIN_IDS.transition),
      output: [{ kind: "useGroup", groupName: "other" }],
    },

    // --- output the codec could not type: opaque ---
    {
      nodeId: "rule#opaque",
      context: vkeyContext(TOUCH_JOIN_IDS.opaque),
      output: [{ kind: "raw", text: "if(opt = 'x') U+0041" }],
    },

    // --- store-driven production: producedText must be undefined for both ---
    {
      nodeId: "rule#index",
      context: [
        { kind: "any", storeRef: TOUCH_JOIN_STORES.indexFrom },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: TOUCH_JOIN_IDS.storeIndex, modifiers: [] },
      ],
      output: [{ kind: "index", storeRef: TOUCH_JOIN_STORES.indexTo, offset: 1 }],
    },
    {
      nodeId: "rule#outs",
      context: vkeyContext(TOUCH_JOIN_IDS.storeOuts),
      output: [{ kind: "outs", storeRef: TOUCH_JOIN_STORES.indexTo }],
    },

    // --- the K_ half of the same under-credit defect ---
    producingRule("rule#physical", TOUCH_JOIN_IDS.physicalMark, TOUCH_JOIN_PRODUCED.mark),

    // --- case asymmetry: rule spelled upper, layout spelled mixed ---
    producingRule(
      "rule#case",
      TOUCH_JOIN_IDS.caseTestAsWritten,
      TOUCH_JOIN_PRODUCED.caseTest,
    ),

    // --- the duplicate pairs are given rules so they are not ALSO dead keys ---
    producingRule("rule#dup", TOUCH_JOIN_IDS.duplicate, TOUCH_JOIN_PRODUCED.duplicate),
    producingRule(
      "rule#layerdup",
      TOUCH_JOIN_IDS.layerDuplicate,
      TOUCH_JOIN_PRODUCED.layerDuplicate,
    ),

    // --- THE INJECTED ORPHAN: a full guard+producing pair for an id the layout
    // carries only in its self-outputting `U_` form. This is the AZERTY defect,
    // reduced: the author's `any(diablock)` guard is bypassed entirely because
    // the key on the layout is `U_03B1`, which outputs before any rule runs.
    guardRule("rule#orphan-guard", TOUCH_JOIN_IDS.orphan),
    producingRule("rule#orphan", TOUCH_JOIN_IDS.orphan, TOUCH_JOIN_PRODUCED.orphan),

    // --- carried only on an unreachable layer: orphaned for a DIFFERENT reason ---
    producingRule("rule#stranded", TOUCH_JOIN_IDS.stranded, TOUCH_JOIN_PRODUCED.stranded),

    // --- terminal rules: synthesis must insert BEFORE these ---
    { nodeId: "rule#match", context: [], output: [{ kind: "raw", text: "use(other)" }], matchKind: "match" },
  ];
}

function makeGroups(): IRGroup[] {
  return [
    {
      nodeId: "group#main",
      name: "Main",
      usingKeys: true,
      rules: makeMainGroupRules(),
      readonly: false,
    },
    {
      // The `use(other)` target. Not a using-keys group, so `entryGroupOf` must
      // never choose it for synthesis.
      nodeId: "group#other",
      name: "other",
      usingKeys: false,
      rules: [],
      readonly: false,
    },
  ];
}

function makeRawFragments(): RawKmnFragment[] {
  // One opaque fragment, so `opaqueFragmentCount` is non-zero and every
  // consumer's degrade-on-opaque path is exercised by the default fixture. Use
  // `withoutOpaqueFragments` for the clean-IR variant.
  return [
    {
      nodeId: "raw#1",
      origin: "imported",
      sourceText: "store(opt) 'x'  c save/set/reset is not modelled",
      reason: "save/set/reset option-store",
    },
  ];
}

// ---------------------------------------------------------------------------
// Touch layout
// ---------------------------------------------------------------------------

function key(id: string, extra: Partial<Omit<TouchKeyIR, "nodeId" | "id">> = {}): TouchKeyIR {
  // nodeId is assigned by the walk below so ids stay deterministic and unique
  // without every call site having to invent one.
  return { nodeId: "", id, ...extra };
}

function makePhoneLayers(): TouchLayoutIR["platforms"][number]["layers"] {
  return [
    {
      id: TOUCH_JOIN_LAYERS.default,
      rows: [
        {
          keys: [
            // `◌̀` keycap: the U+25CC strip must additively credit U+0300 here.
            key(TOUCH_JOIN_IDS.mark, { text: "◌̀" }),
            key(TOUCH_JOIN_IDS.multiChar, { text: "FCFA" }),
            // `> nul` + nextlayer: exempt from the dead-key check twice over.
            key(TOUCH_JOIN_IDS.suppressed, { text: "CAM", nextlayer: TOUCH_JOIN_LAYERS.symbol }),
            // Same under-credit shape as the mark key, on a physical key id.
            key(TOUCH_JOIN_IDS.physicalMark, { text: "◌̀" }),
          ],
        },
        {
          keys: [
            key(TOUCH_JOIN_IDS.longpressHost, {
              text: "!",
              sk: [
                key("U_00A1", { text: "¡", default: true }),
                key("U_203D", { text: "‽" }),
              ],
              flick: { n: key("U_2049", { text: "⁉" }) },
            }),
            // Ruleless by design — sentinel blank, must not read as dead.
            key(TOUCH_JOIN_IDS.blank, { text: " ", sp: 9 }),
            // Ruleless by design — `*`-prefixed frame label + layer switch.
            key(TOUCH_JOIN_IDS.frame, {
              text: "*Shift*",
              sp: 1,
              nextlayer: TOUCH_JOIN_LAYERS.shift,
            }),
            // THE one genuinely dead key: producing sp class, no nextlayer, no rule.
            key(TOUCH_JOIN_IDS.dead, { text: "ŋ" }),
          ],
        },
        {
          keys: [
            // Duplicate id, NOT disambiguated — the finding.
            key(TOUCH_JOIN_IDS.duplicate, { text: "d" }),
            key(TOUCH_JOIN_IDS.duplicate, { text: "d" }),
            // Duplicate id disambiguated by a per-key `layer` override — the
            // exemption, and the reason TouchKeyIR.layer had to exist.
            key(TOUCH_JOIN_IDS.layerDuplicate, { text: "l" }),
            key(TOUCH_JOIN_IDS.layerDuplicate, { text: "L", layer: TOUCH_JOIN_LAYERS.shift }),
          ],
        },
        {
          keys: [
            // The orphan's near-miss: a self-outputting `U_` id where the rules
            // expect `T_03B1`.
            key(TOUCH_JOIN_IDS.orphanNearMiss, { text: "α" }),
            key(TOUCH_JOIN_IDS.transition, { text: "go" }),
            key(TOUCH_JOIN_IDS.opaque, { text: "?" }),
            key(TOUCH_JOIN_IDS.storeIndex, { text: "̄" }),
            key(TOUCH_JOIN_IDS.storeOuts, { text: "̄̄" }),
            // Layout spelling differs from the rule spelling only by case.
            key(TOUCH_JOIN_IDS.caseTest, { text: "x" }),
            // A bare dotted circle: load-bearing negative case for the U+25CC
            // strip, which must not strip this to empty. sp:1 keeps it out of
            // the dead-key check without making it non-interactive.
            key("T_DOTTED", { text: "◌", sp: 1 }),
          ],
        },
      ],
    },
    {
      // Reachable: the frame key switches here.
      id: TOUCH_JOIN_LAYERS.shift,
      rows: [{ keys: [key(TOUCH_JOIN_IDS.markShift, { text: "◌́" })] }],
    },
    {
      // Reachable: T_CAM switches here.
      id: TOUCH_JOIN_LAYERS.symbol,
      rows: [
        {
          keys: [
            key("T_SYMFRAME", {
              text: "*abc*",
              sp: 1,
              nextlayer: TOUCH_JOIN_LAYERS.default,
            }),
          ],
        },
      ],
    },
    {
      // Declared, but NOTHING switches here — so its keys are unreachable and
      // the rules keyed on them are orphaned for the unreachable-layer reason,
      // which the orphan check must tell apart from "absent".
      id: TOUCH_JOIN_LAYERS.stranded,
      rows: [{ keys: [key(TOUCH_JOIN_IDS.stranded, { text: "א" })] }],
    },
  ];
}

/**
 * Assign deterministic node ids and build the `nodeIds` index the same way the
 * canonical parser does, so a fixture-built layout and a parsed one are
 * interchangeable for addressing purposes.
 */
function indexLayout(platforms: TouchLayoutIR["platforms"]): TouchLayoutIR {
  let counter = 0;
  const nodeIds: TouchLayoutIR["nodeIds"] = [];

  const visit = (k: TouchKeyIR, prefix: string): void => {
    k.nodeId = `touchKey#${counter++}`;
    nodeIds.push([prefix, { kind: "touchKey", nodeId: k.nodeId }]);
    for (const sub of k.sk ?? []) visit(sub, `${prefix}:sk:${sub.id}`);
    for (const sub of k.multitap ?? []) visit(sub, `${prefix}:multitap:${sub.id}`);
    for (const [dir, sub] of Object.entries(k.flick ?? {})) {
      if (sub) visit(sub, `${prefix}:flick:${dir}`);
    }
  };

  for (const platform of platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const k of row.keys) visit(k, `${platform.id}:${layer.id}:${k.id}`);
      }
    }
  }

  return { platforms, nodeIds };
}

/** Build the fixture's touch layout on its own (fresh objects each call). */
export function makeTouchKeyRuleJoinLayout(): TouchLayoutIR {
  return indexLayout([
    { id: "phone", layers: makePhoneLayers() },
    {
      // A second platform carrying only the mark key, so reachability's
      // union-across-platforms behaviour is exercised rather than assumed.
      id: "tablet",
      layers: [
        {
          id: TOUCH_JOIN_LAYERS.default,
          rows: [{ keys: [key(TOUCH_JOIN_IDS.mark, { text: "◌̀" })] }],
        },
      ],
    },
  ]);
}

// ---------------------------------------------------------------------------
// The IR
// ---------------------------------------------------------------------------

export interface TouchKeyRuleJoinFixtureOptions {
  /**
   * Drop the opaque `RawKmnFragment`, so `opaqueFragmentCount === 0`.
   *
   * Needed by every test of a behaviour that DEGRADES when an opaque fragment is
   * present (the dead-key hint downgrade, the synthesis warn-and-confirm gate):
   * such a test must be able to assert the un-degraded path too, or it only ever
   * proves the degraded one.
   */
  readonly withoutOpaqueFragments?: boolean;
  /** Drop the touch layout entirely — the "everything is reachable" case. */
  readonly withoutTouchLayout?: boolean;
}

/**
 * Build the fixture IR. Fresh, deeply-independent objects on every call.
 *
 * `origin` is `"imported"` deliberately: both real canaries are imported
 * keyboards, and several checks are gated on origin, so a fixture claiming to be
 * scaffolded would exercise the wrong branch.
 */
export function makeTouchKeyRuleJoinFixture(
  options: TouchKeyRuleJoinFixtureOptions = {},
): KeyboardIR {
  const ir: KeyboardIR = {
    origin: "imported",
    header: {
      keyboardId: "touch_join_fixture",
      name: "Touch Join Fixture",
      bcp47: ["mua"],
      copyright: "",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: makeStores(),
    groups: makeGroups(),
    comments: [],
    raw: options.withoutOpaqueFragments === true ? [] : makeRawFragments(),
    recognizedPatterns: [],
  };
  if (options.withoutTouchLayout !== true) {
    ir.touchLayout = makeTouchKeyRuleJoinLayout();
  }
  return ir;
}
