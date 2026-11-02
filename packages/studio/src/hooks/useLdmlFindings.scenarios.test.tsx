// useLdmlFindings: the Story 2 scenarios (spec 108 US2) plus the recompute contract (T056).
//
// The hook is a memo over the published preview projection, the profile, the base-layout
// inputs and i18n, so every scenario drives it through the working-copy store and reads the
// next published array straight after the write: no timer, no extra tick.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { createElement } from "react";
import { act, cleanup, renderHook, screen, within } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { parseKmn } from "@keyboard-studio/engine";
import { messages as enMessages } from "../locales/en/messages.json?lingui";
import { render } from "../test/renderWithI18n.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { LintSummary } from "../lint/LintSummary.tsx";
import { buildStepWarningCounts } from "../lint/lintToQuestion.ts";
import { useLdmlFindings } from "./useLdmlFindings.ts";

const { classifySpy } = vi.hoisted(() => ({ classifySpy: vi.fn() }));
vi.mock("@keyboard-studio/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keyboard-studio/engine")>();
  classifySpy.mockImplementation(actual.classifyForLdml);
  return { ...actual, classifyForLdml: classifySpy };
});

i18n.load("en", enMessages);
i18n.activate("en");

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nProvider, { i18n }, children);
}

const HEAD = [
  "c options and PostKeystroke",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&NAME) 'Options'",
  "store(&TARGETS) 'any'",
  "store(opt) '0'",
  "",
  "begin Unicode > use(main)",
  "begin PostKeystroke > use(PostKeystroke)",
  "",
  "group(main) using keys",
  "",
];
const TAIL = ["", "group(PostKeystroke) readonly", "", "nomatch > layer('default')", ""];

function kmn(optionRules: string[]): string {
  return [...HEAD, ...optionRules, "+ [K_B] > 'b'", "+ [K_C] > set(opt = '1')", ...TAIL].join("\n");
}

function projection(optionRules: string[]) {
  const { ir } = parseKmn(kmn(optionRules), "opts");
  return { ir, touchLayoutText: null, kvksText: null, keyboardId: "opts" };
}

function publish(optionRules: string[]) {
  act(() => useWorkingCopyStore.getState().setPreviewProjection(projection(optionRules)));
}

const OPTION_RULE = "if(opt = '1') + [K_A] > 'A1'";
const byCode = (findings: readonly { code: string }[], code: string) => findings.filter((f) => f.code === code);

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().setPreviewProjection(null);
  useWorkingCopyStore.getState().setLdmlProfile(null);
  useWorkingCopyStore.getState().setLdmlBaseLayout(null);
  classifySpy.mockClear();
});
afterEach(cleanup);

describe("useLdmlFindings", () => {
  it("returns nothing before a preview projection is published", () => {
    const { result } = renderHook(() => useLdmlFindings(), { wrapper });
    expect(result.current).toEqual([]);
    expect(classifySpy).not.toHaveBeenCalled();
  });

  it("scenario 1: an option rule is a warning with its source line", () => {
    const { result } = renderHook(() => useLdmlFindings(), { wrapper });
    publish([OPTION_RULE]);
    const option = byCode(result.current, "KM_LINT_LDML_OPTION_STATE");
    expect(option.length).toBeGreaterThan(0);
    const first = option[0]!;
    expect(first.severity).toBe("warning");
    expect(first.layer).toBe("C");
    expect(first.location).toEqual({ file: "source/opts.kmn", line: HEAD.length + 1 });
    // The PostKeystroke group is touch layer behaviour: it is reported too.
    expect(byCode(result.current, "KM_LINT_LDML_NO_KEY_TRIGGER").length).toBeGreaterThan(0);
    expect(result.current.every((f) => f.severity === "warning" || f.severity === "hint")).toBe(true);
  });

  it("scenario 2 / SC-008: removing the rule removes its warning on the next published array", () => {
    const { result } = renderHook(() => useLdmlFindings(), { wrapper });
    publish([OPTION_RULE]);
    const before = byCode(result.current, "KM_LINT_LDML_OPTION_STATE").filter((f) => f.location?.line === HEAD.length + 1);
    expect(before.length).toBeGreaterThan(0);

    publish([]);
    const after = byCode(result.current, "KM_LINT_LDML_OPTION_STATE").filter((f) => f.location?.line === HEAD.length + 1);
    // The `set()` rule on K_C still produces option findings, but the removed rule's does not.
    expect(after).toHaveLength(0);
  });

  it("scenario 4: 300 option-guarded rules are one group with count 300, each locatable", () => {
    const rules = Array.from({ length: 300 }, (_, i) => `if(opt = '1') + [K_A] > 'x${i}'`);
    const { result } = renderHook(() => useLdmlFindings(), { wrapper });
    publish(rules);
    const guarded = byCode(result.current, "KM_LINT_LDML_OPTION_STATE").filter(
      (f) => f.location !== undefined && f.location.line > HEAD.length && f.location.line <= HEAD.length + 300,
    );
    expect(guarded).toHaveLength(300);
    expect(new Set(guarded.map((f) => f.location?.line)).size).toBe(300);

    render(<LintSummary findings={result.current} groupByCode />);
    const groups = screen.getAllByTestId("lint-summary-group");
    const optionGroup = groups.find((g) => within(g).queryByText("Option state is fixed at export") !== null)!;
    expect(within(optionGroup).getAllByText(/^Line \d+$/).length).toBeGreaterThanOrEqual(300);

    // The step badge counts distinct codes, not findings.
    const badges = buildStepWarningCounts(result.current);
    expect(badges["rules"]).toBeLessThan(10);
  });

  it("SC-012: changing ldmlProfile classifies again against the chosen profile", () => {
    const { result } = renderHook(() => useLdmlFindings(), { wrapper });
    publish([OPTION_RULE]);
    expect(classifySpy.mock.calls.at(-1)?.[1].id).toBe("46");

    const before = result.current;
    act(() => useWorkingCopyStore.getState().setLdmlProfile("49"));
    expect(classifySpy.mock.calls.at(-1)?.[1].id).toBe("49");
    expect(result.current).not.toBe(before);
    // The provenance record is still a Keyman gap under 49; only the attribution row moves.
    expect(byCode(result.current, "KM_LINT_LDML_KEYMAN_GAP").length).toBeGreaterThan(0);
  });

  it("recomputes only when an input changes", () => {
    const { result, rerender } = renderHook(() => useLdmlFindings(), { wrapper });
    publish([OPTION_RULE]);
    const calls = classifySpy.mock.calls.length;
    const first = result.current;

    rerender();
    rerender();
    expect(classifySpy.mock.calls.length).toBe(calls);
    expect(result.current).toBe(first);

    // An unrelated store write leaves every input of the memo alone.
    act(() => useWorkingCopyStore.getState().setValidatorFindings([]));
    expect(classifySpy.mock.calls.length).toBe(calls);

    act(() => useWorkingCopyStore.getState().setLdmlBaseLayout("azerty"));
    expect(classifySpy.mock.calls.length).toBe(calls + 1);
  });

  it("returns [] when the default base keyboard is unavailable and no override is set", () => {
    // A picked layout with no reference data makes the default unavailable (FR-027).
    useDecisionStore.setState({
      decisions: { "windows-layout": { id: "windows-layout", value: { layoutIds: ["basic_kbdru"] } } as never },
    });
    const { result } = renderHook(() => useLdmlFindings(), { wrapper });
    publish([OPTION_RULE]);
    expect(result.current).toEqual([]);
    expect(classifySpy).not.toHaveBeenCalled();

    // Picking another base keyboard makes the findings appear.
    act(() => useWorkingCopyStore.getState().setLdmlBaseLayout("us"));
    expect(result.current.length).toBeGreaterThan(0);
  });
});
