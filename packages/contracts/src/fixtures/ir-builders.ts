// Shared test builders for the pieces of a KeyboardIR: groups, rules, stores,
// and touch layouts. Pair with makeTestIR (./keyboard-ir.ts) for the whole IR.
//
// Every builder takes one object parameter so a call site names what it sets
// and leaves the rest at a documented default. Optional IR fields are only
// written when given, so a built node has exactly the keys a hand-written
// literal with the same values would have.

import type {
  ContextElement,
  IRGroup,
  IRRule,
  IRStore,
  OutputElement,
  StoreItem,
  TouchKeyIR,
  TouchLayoutIR,
} from "../keyboard-ir.js";
import { charItems } from "./keyboard-ir.js";

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface IRGroupInput {
  /** Defaults to `group#${name}`. */
  nodeId?: string;
  /** Defaults to "main". */
  name?: string;
  /** Defaults to []. */
  rules?: IRRule[];
  /** Defaults to true (`group(x) using keys`). */
  usingKeys?: boolean;
  /** Defaults to false. */
  readonly?: boolean;
  sourceLine?: number;
}

/** Build an IRGroup: a writable `using keys` group named "main" unless told otherwise. */
export function irGroup(input: IRGroupInput = {}): IRGroup {
  const name = input.name ?? "main";
  const group: IRGroup = {
    nodeId: input.nodeId ?? `group#${name}`,
    name,
    usingKeys: input.usingKeys ?? true,
    rules: input.rules ?? [],
    readonly: input.readonly ?? false,
  };
  if (input.sourceLine !== undefined) group.sourceLine = input.sourceLine;
  return group;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Rule fields that are not context/output; each is written only when given. */
export type IRRuleExtras = Pick<
  IRRule,
  "trailingComment" | "ownedByPattern" | "matchKind" | "targetSelector" | "sourceLine"
>;

/** A rule output: a string becomes a single `char` element holding the whole string. */
export type RuleOutputInput = string | OutputElement[];

let autoRuleSeq = 0;

function toOutput(output: RuleOutputInput): OutputElement[] {
  return typeof output === "string" ? [{ kind: "char", value: output }] : output;
}

function withRuleExtras(rule: IRRule, extras: IRRuleExtras): IRRule {
  if (extras.trailingComment !== undefined) rule.trailingComment = extras.trailingComment;
  if (extras.ownedByPattern !== undefined) rule.ownedByPattern = extras.ownedByPattern;
  if (extras.matchKind !== undefined) rule.matchKind = extras.matchKind;
  if (extras.targetSelector !== undefined) rule.targetSelector = extras.targetSelector;
  if (extras.sourceLine !== undefined) rule.sourceLine = extras.sourceLine;
  return rule;
}

export interface VkeyRuleInput extends IRRuleExtras {
  /** Defaults to a fresh unique id (`rule#auto-N`) for tests that never look at it. */
  nodeId?: string;
  /** Defaults to "K_A". */
  vkey?: string;
  /** Defaults to []. */
  modifiers?: string[];
  output: RuleOutputInput;
}

/**
 * Build a `+ [MODS VKEY] > output` rule: context is the single vkey element.
 * `vkeyRule({ nodeId: "r1", vkey: "K_E", output: "é" })`.
 */
export function vkeyRule(input: VkeyRuleInput): IRRule {
  return withRuleExtras(
    {
      nodeId: input.nodeId ?? `rule#auto-${++autoRuleSeq}`,
      context: [{ kind: "vkey", name: input.vkey ?? "K_A", modifiers: input.modifiers ?? [] }],
      output: toOutput(input.output),
    },
    input,
  );
}

export interface CharRuleInput extends IRRuleExtras {
  /** Defaults to a fresh unique id (`rule#auto-N`) for tests that never look at it. */
  nodeId?: string;
  /** A string becomes a single `char` context element holding the whole string. */
  context: string | ContextElement[];
  output: RuleOutputInput;
}

/**
 * Build a rule from an explicit context. A string context is one `char`
 * element, so `charRule({ context: "x", output: "y" })` is `'x' > 'y'`.
 */
export function charRule(input: CharRuleInput): IRRule {
  const context: ContextElement[] =
    typeof input.context === "string" ? [{ kind: "char", value: input.context }] : input.context;
  return withRuleExtras(
    {
      nodeId: input.nodeId ?? `rule#auto-${++autoRuleSeq}`,
      context,
      output: toOutput(input.output),
    },
    input,
  );
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export interface CharStoreInput {
  /** Defaults to `store#${name}`. */
  nodeId?: string;
  name: string;
  /**
   * The store's characters. A string is split per code point (see charItems);
   * an array gives one `char` item per element, verbatim. Ignored when `items`
   * is given. Defaults to no items.
   */
  chars?: string | readonly string[];
  /** Explicit items, for stores that hold more than plain characters. */
  items?: StoreItem[];
  /** Defaults to false. */
  isSystem?: boolean;
  targetSelector?: IRStore["targetSelector"];
  sourceLine?: number;
  trailingComment?: string;
}

/** Build a (by default non-system) IRStore from characters or explicit items. */
export function charStore(input: CharStoreInput): IRStore {
  const items: StoreItem[] =
    input.items ??
    (typeof input.chars === "string"
      ? charItems(input.chars)
      : (input.chars ?? []).map((value) => ({ kind: "char" as const, value })));
  const store: IRStore = {
    nodeId: input.nodeId ?? `store#${input.name}`,
    name: input.name,
    items,
    isSystem: input.isSystem ?? false,
  };
  if (input.targetSelector !== undefined) store.targetSelector = input.targetSelector;
  if (input.sourceLine !== undefined) store.sourceLine = input.sourceLine;
  if (input.trailingComment !== undefined) store.trailingComment = input.trailingComment;
  return store;
}

// ---------------------------------------------------------------------------
// Touch layouts
// ---------------------------------------------------------------------------

/** Build a TouchKeyIR. `nodeId` defaults to `node_${id}`; every other field is passed through. */
export function touchKey(input: { id: string; nodeId?: string } & Partial<Omit<TouchKeyIR, "id" | "nodeId">>): TouchKeyIR {
  const { id, nodeId, ...rest } = input;
  return { nodeId: nodeId ?? `node_${id}`, id, ...rest };
}

type TouchPlatform = TouchLayoutIR["platforms"][number];
type TouchLayer = TouchPlatform["layers"][number];

/** A layer given either in full (`rows`) or as one row of keys (`keys`). */
export type TouchLayerInput = TouchLayer | { id: string; keys: readonly TouchKeyIR[] };

export interface TouchLayoutInput {
  /** Defaults to "phone". */
  platform?: TouchPlatform["id"];
  /** The platform's layers. Ignored when `keys` is given. */
  layers?: readonly TouchLayerInput[];
  /** Shorthand for a single one-row layer holding these keys. */
  keys?: readonly TouchKeyIR[];
  /** Layer id for the `keys` shorthand. Defaults to "default". */
  layerId?: string;
  /** Defaults to []. */
  nodeIds?: TouchLayoutIR["nodeIds"];
}

function toLayer(layer: TouchLayerInput): TouchLayer {
  return "keys" in layer ? { id: layer.id, rows: [{ keys: [...layer.keys] }] } : layer;
}

/**
 * Build a single-platform TouchLayoutIR (phone unless told otherwise).
 * `touchLayout({ keys: [touchKey({ id: "K_A", text: "a" })] })` is one phone
 * "default" layer with one row.
 */
export function touchLayout(input: TouchLayoutInput = {}): TouchLayoutIR {
  const layers =
    input.keys !== undefined
      ? [toLayer({ id: input.layerId ?? "default", keys: input.keys })]
      : (input.layers ?? []).map(toLayer);
  return {
    platforms: [{ id: input.platform ?? "phone", layers }],
    nodeIds: input.nodeIds ?? [],
  };
}
