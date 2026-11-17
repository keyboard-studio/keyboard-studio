// OpenApplyHost (spec 111 "live files", S1 fix pass): a throw becomes a
// "not applied" notice, a decline is its own status, and a second apply while
// the consent dialog is open is refused rather than orphaning the first.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { i18n } from "@lingui/core";
import { createVirtualFS, type StartKeyboard } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { OpenApplyHost, useApplyOnOpen, type ApplyOnOpen } from "./OpenApplyHost.tsx";
import { readVfsText } from "../lib/vfsText.ts";

const ID = "tiny";
const KMN_PATH = `source/${ID}.kmn`;
const KMN = "store(&NAME) 'Tiny'\r\nbegin Unicode > use(main)\r\ngroup(main) using keys\r\n+ [K_A] > 'a'\r\n+ [K_B] > 'b'\r\n";
const KB = {
  id: ID, path: "release/t/tiny", script: "Latn", targets: ["desktop"],
  displayName: "Tiny", version: "1.0", languages: ["en"],
} as StartKeyboard;

let apply: ApplyOnOpen;
function Probe() {
  apply = useApplyOnOpen();
  return null;
}

const realReplace = useWorkingCopyStore.getState().replaceStartingPointFiles;
const ruleId = (vkey: string): string =>
  useWorkingCopyStore.getState().startIr!.groups.flatMap((g) => g.rules)
    .find((r) => r.context.some((c) => c.kind === "vkey" && c.name === vkey))!.nodeId;

function seed(): void {
  const vfs = createVirtualFS([
    { path: KMN_PATH, content: KMN, isBinary: false },
    { path: `source/${ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(KB, { vfs, ir: parseKmn(KMN, ID).ir });
  wc.setFallbackPolicy("pass-through");
}

function mount() {
  render(
    <I18nProvider i18n={i18n}>
      <OpenApplyHost><Probe /></OpenApplyHost>
    </I18nProvider>,
  );
}

beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
  seed();
});
afterEach(() => {
  cleanup();
  useWorkingCopyStore.setState({ replaceStartingPointFiles: realReplace });
});

describe("OpenApplyHost", () => {
  it("a throwing apply resolves failed and shows the not-applied notice", async () => {
    mount();
    useWorkingCopyStore.setState({
      replaceStartingPointFiles: () => {
        throw new Error("boom");
      },
    });
    let result: Awaited<ReturnType<ApplyOnOpen>> | undefined;
    await act(async () => {
      result = await apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    });
    expect(result).toEqual({ status: "failed", reason: "boom" });
    expect(screen.getByRole("status").textContent).toContain("could not be applied");
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)).toBe(KMN);
  });

  it("a declined consent is `declined`, not `unchanged`", async () => {
    mount();
    for (const g of useWorkingCopyStore.getState().startIr!.groups) {
      for (const r of g.rules) delete (r as { sourceLine?: number }).sourceLine;
    }
    let pending!: ReturnType<ApplyOnOpen>;
    await act(async () => {
      pending = apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    });
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => { screen.getByTestId("reformat-consent-keep").click(); });
    expect(await pending).toEqual({ status: "declined" });
  });

  it("refuses a second apply while the consent dialog is open; the first still completes", async () => {
    mount();
    for (const g of useWorkingCopyStore.getState().startIr!.groups) {
      for (const r of g.rules) delete (r as { sourceLine?: number }).sourceLine;
    }
    let first!: ReturnType<ApplyOnOpen>;
    await act(async () => {
      first = apply({ kind: "remove", itemIds: [ruleId("K_B")], chars: ["b"] });
    });
    await screen.findByTestId("reformat-consent-dialog");
    let second: Awaited<ReturnType<ApplyOnOpen>> | undefined;
    await act(async () => {
      second = await apply({ kind: "remove", itemIds: [ruleId("K_A")], chars: ["a"] });
    });
    expect(second?.status).toBe("failed");
    expect(screen.getByTestId("open-apply-notice").textContent).toContain("Answer the question");
    await act(async () => { screen.getByTestId("reformat-consent-agree").click(); });
    expect((await first).status).toBe("applied");
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)).not.toContain("[K_B]");
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, KMN_PATH)).toContain("[K_A]");
  });
});
