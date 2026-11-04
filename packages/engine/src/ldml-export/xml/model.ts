// Internal document model for the keyboard3 writer (spec 108). It is built over
// developer-utils' LDMLKeyboard element types (type-only imports, so nothing from
// developer-utils reaches the runtime graph), adding `comment` where the output
// carries one and a `special` record for the Keyboard Studio extension.

import type { LDMLKeyboard } from "@keymanapp/developer-utils";

type Comment = { comment?: string };

/** `<transform>` plus the comment written on the line above it. */
export type LdmlTransform = LDMLKeyboard.LKTransform & Comment;

/** `<transformGroup>`; `comment` is written above the group. */
export interface LdmlTransformGroup extends Comment {
  transform?: LdmlTransform[];
  reorder?: LDMLKeyboard.LKReorder[];
}

export interface LdmlTransforms {
  type: "simple" | "backspace";
  transformGroup?: LdmlTransformGroup[];
}

/** `<info>`; `attribution` is written only by profiles that carry it. */
export interface LdmlInfo extends LDMLKeyboard.LKInfo {
  attribution?: string;
}

/** One `<ks:...>` element inside `<special>`. Attributes keep the given order. */
export interface LdmlSpecialElement {
  /** Qualified name, for example `ks:position`. */
  name: string;
  attributes: ReadonlyArray<readonly [name: string, value: string]>;
}

export interface LdmlSpecial {
  /** Namespace declarations written on `<special>`, as prefix to URI. */
  namespaces: Readonly<Record<string, string>>;
  elements: LdmlSpecialElement[];
}

export interface LdmlDocument {
  /** Comment written between the XML declaration and the root element. */
  comment?: string;
  /** Default namespace of the root element. */
  xmlns?: string;
  locale?: string;
  conformsTo?: string;
  locales?: LDMLKeyboard.LKLocale[];
  version?: LDMLKeyboard.LKVersion;
  info: LdmlInfo;
  settings?: LDMLKeyboard.LKSettings;
  displays?: LDMLKeyboard.LKDisplays;
  keys?: LDMLKeyboard.LKKey[];
  flicks?: LDMLKeyboard.LKFlick[];
  /** Hardware `layers` first, then touch `layers[]`, in output order. */
  layers?: LDMLKeyboard.LKLayers[];
  variables?: LDMLKeyboard.LKVariables;
  transforms?: LdmlTransforms[];
  special?: LdmlSpecial;
}
