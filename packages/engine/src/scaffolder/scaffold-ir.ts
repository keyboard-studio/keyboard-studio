// IR-native scaffolder operations — see spec.md §8 step 3.
//
// These operate directly on the KeyboardIR (header, IRStore, IRRule.context)
// rather than on raw .kmn text. The text-based scaffold path in index.ts is
// implemented in terms of parse → scaffoldIR → emit so every session goes
// through the same IR-native pipeline (issue #238).

import type {
  KeyboardIR,
  IRStore,
  IRRule,
  ContextElement,
  StoreItem,
  RoutingGroup,
} from "@keyboard-studio/contracts";

export interface ScaffoldIRIdentity {
  keyboardId: string;
  displayName: string;
  bcp47?: string[];
  version?: string;
  copyright?: string;
}

export interface ScaffoldIROptions {
  identity: ScaffoldIRIdentity;
  group: RoutingGroup;
}

// Year used for the &COPYRIGHT directive when not supplied. Pulled out so
// callers in deterministic tests can monkey-patch via Date if needed.
function currentYear(): number {
  return new Date().getFullYear();
}

// Replace C0/C1 control chars (incl. newlines, nulls) with spaces, collapse and trim.
function sanitizeDisplayName(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F-\x9F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// In KMN, single-quoted strings have no escape sequence; U+2019 is the typographic equivalent.
function kmnStringEscape(s: string): string {
  return s.replace(/'/g, "’");
}

function stringToStoreItems(s: string): StoreItem[] {
  return [...s].map((ch) => ({ kind: "char", value: ch }) satisfies StoreItem);
}

function setSystemStore(ir: KeyboardIR, name: string, value: string): void {
  const upper = name.toUpperCase();
  const existing = ir.stores.find(
    (s) => s.isSystem && s.name.toUpperCase() === upper
  );
  if (existing !== undefined) {
    existing.items = stringToStoreItems(value);
    return;
  }
  ir.stores.push({
    nodeId: `store:${name}`,
    name: name,
    isSystem: true,
    items: stringToStoreItems(value),
  });
}

function hasSystemStore(ir: KeyboardIR, name: string): boolean {
  const upper = name.toUpperCase();
  return ir.stores.some(
    (s) => s.isSystem && s.name.toUpperCase() === upper
  );
}

/**
 * Reset the IR's identity fields to the new keyboard's identity. Operates on
 * `ir.header` (the typed propagation point) and also rewrites the matching
 * &NAME / &COPYRIGHT / &VERSION / &KEYBOARDVERSION system stores so the
 * emitted .kmn matches.
 */
export function resetIdentity(ir: KeyboardIR, identity: ScaffoldIRIdentity): void {
  const displayName = sanitizeDisplayName(identity.displayName);
  // &VERSION is the KMN file-format version — minimum 14.0 for &CasedKeys support.
  // It is NOT the human-visible keyboard release version.
  const fileFormatVersion = "14.0";
  // &KEYBOARDVERSION is the human-visible keyboard release version.
  const keyboardVersion = identity.version ?? "1.0";
  const copyright =
    identity.copyright ?? `Copyright © ${currentYear()} ${displayName}`;
  const bcp47 = identity.bcp47 ?? [];

  ir.header.keyboardId = identity.keyboardId;
  ir.header.name = displayName;
  ir.header.bcp47 = bcp47;
  ir.header.copyright = copyright;
  ir.header.version = keyboardVersion;

  setSystemStore(ir, "NAME", kmnStringEscape(displayName));
  setSystemStore(ir, "COPYRIGHT", kmnStringEscape(copyright));
  setSystemStore(ir, "VERSION", fileFormatVersion);
  setSystemStore(ir, "KEYBOARDVERSION", keyboardVersion);
}

function ruleHasModifier(rule: IRRule, modifier: string): boolean {
  for (const el of rule.context) {
    if (el.kind === "vkey" && el.modifiers.includes(modifier)) return true;
  }
  return false;
}

/**
 * Strip rules whose context relies on the NCAPS or CAPS modifier — these
 * carry the legacy "caps-aware" behaviour the new keyboard replaces with a
 * &CasedKeys directive. Matches the v1.0 line-based filter behaviour
 * (`[CAPS …]` rules removed; the NCAPS keyword used to be stripped before
 * the line filter, so NCAPS-prefixed rules are dropped too).
 */
export function stripCapsRules(ir: KeyboardIR): void {
  for (const group of ir.groups) {
    if (group.readonly) continue;
    group.rules = group.rules.filter(
      (r) => !ruleHasModifier(r, "CAPS") && !ruleHasModifier(r, "NCAPS")
    );
  }
}

/**
 * Remove any residual `CAPS` / `NCAPS` modifier tokens from vkey context
 * elements. The rule-removal pass in {@link stripCapsRules} catches whole
 * rules; this pass cleans any vkey element that happens to carry a CAPS
 * modifier alongside other state (defensive — should be a no-op after
 * stripCapsRules in practice).
 */
export function removeCapsContextElements(ir: KeyboardIR): void {
  for (const group of ir.groups) {
    if (group.readonly) continue;
    for (const rule of group.rules) {
      rule.context = rule.context.map((el): ContextElement => {
        if (el.kind !== "vkey") return el;
        const modifiers = el.modifiers.filter(
          (m) => m !== "CAPS" && m !== "NCAPS"
        );
        return { ...el, modifiers };
      });
    }
  }
}

const CASED_KEYS_QWERTY = "[K_A]..[K_Z]";
const CASED_KEYS_AZERTY =
  "[K_A]..[K_Z] [K_0]..[K_9] [K_HYPHEN] [K_EQUAL] [K_LBRKT] [K_RBRKT] [K_BKSLASH] [K_QUOTE] [K_COMMA] [K_PERIOD] [K_SLASH] [K_COLON]";

/**
 * Insert a `&CasedKeys` system store if missing. Skipped for non-Roman
 * keyboards (caps state is meaningless there). Per spec §14 Decision 2,
 * AZERTY keyboards get the extended range; QWERTY/QWERTZ get A–Z only.
 */
export function ensureCasedKeysStore(ir: KeyboardIR, group: RoutingGroup): void {
  if (group === "non-roman") return;
  if (hasSystemStore(ir, "CASEDKEYS")) return;

  const value = group === "azerty" ? CASED_KEYS_AZERTY : CASED_KEYS_QWERTY;
  const store: IRStore = {
    nodeId: "store:CasedKeys",
    name: "CasedKeys",
    isSystem: true,
    items: [{ kind: "raw", text: value }],
  };
  ir.stores.push(store);
}

/**
 * Run the full IR-native template-cleanup + identity-propagation pipeline.
 * Returns the same IR instance, mutated in place — matches the §8 step 3
 * contract that the scaffolder is an IR→IR transform.
 */
export function scaffoldIR(ir: KeyboardIR, opts: ScaffoldIROptions): KeyboardIR {
  stripCapsRules(ir);
  removeCapsContextElements(ir);
  ensureCasedKeysStore(ir, opts.group);
  resetIdentity(ir, opts.identity);
  return ir;
}
