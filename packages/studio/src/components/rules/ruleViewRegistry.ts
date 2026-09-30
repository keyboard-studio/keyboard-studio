// ruleViewRegistry — mount points for the sibling 082 workstreams.
//
// The rules step shell composes three regions: the Track A demo pane (this
// workstream), the rule list (sibling workstream 3: `KmRuleView` +
// classifier), and the rule-builder panel (sibling workstream 4). The
// siblings land on their own schedule, so the step cannot statically import
// their components — instead each region reads a registry slot:
//
//   - `registerRuleListView(component)` — workstream 3 calls this (e.g. from
//     its module init) with the `KmRuleView`-backed list. Props:
//     `{ ir: KeyboardIR }` — the working-copy IR to render.
//   - `registerRuleBuilderPanel(component)` — workstream 4 calls this with
//     the builder panel. Props: `{ ir: KeyboardIR }`.
//
// Until a sibling registers, the mount renders this workstream's
// placeholder (a plain rule list from the IR; an explanatory note for the
// builder), so the step works standalone. Registration is last-wins and
// idempotent; `clearRuleViewRegistry()` exists for tests.

import type { ComponentType } from "react";
import type { KeyboardIR } from "@keyboard-studio/contracts";

export interface RuleRegionProps {
  /** The working-copy IR the region renders / edits. */
  ir: KeyboardIR | null;
}

let _ruleListView: ComponentType<RuleRegionProps> | null = null;
let _ruleBuilderPanel: ComponentType<RuleRegionProps> | null = null;

/** Sibling workstream 3: install the `KmRuleView` + classifier list here. */
export function registerRuleListView(component: ComponentType<RuleRegionProps>): void {
  _ruleListView = component;
}

/** Sibling workstream 4: install the rule-builder panel here. */
export function registerRuleBuilderPanel(component: ComponentType<RuleRegionProps>): void {
  _ruleBuilderPanel = component;
}

/** The installed rule-list view, or null when workstream 3 has not landed. */
export function getRuleListView(): ComponentType<RuleRegionProps> | null {
  return _ruleListView;
}

/** The installed rule-builder panel, or null when workstream 4 has not landed. */
export function getRuleBuilderPanel(): ComponentType<RuleRegionProps> | null {
  return _ruleBuilderPanel;
}

/** Test-only reset. */
export function clearRuleViewRegistry(): void {
  _ruleListView = null;
  _ruleBuilderPanel = null;
}
