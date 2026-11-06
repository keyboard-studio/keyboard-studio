import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS, makeStartKeyboard } from "@keyboard-studio/contracts";

import { applyDocRegeneration, docRegenerationFixes, generatedSectionOf } from "./docRegenerationFix.ts";
import { recordSuggestionDisposition } from "./suggestionDispositions.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

const S = "<!-- ks:generated:start -->";
const E = "<!-- ks:generated:end -->";
const KB = makeStartKeyboard({
  id: "kb_x",
  path: "release/x/kb_x",
  script: "Latn",
  targets: ["windows"],
  displayName: "X",
  version: "1.0",
});

describe("documentation regeneration producer and accept", () => {
  beforeEach(() => useDecisionLogStore.getState().reset());

  it("reads the generated section out of a rendered page", () => {
    expect(generatedSectionOf(`<body>${S}\nabc\n${E}</body>`)).toBe("abc");
    expect(generatedSectionOf("<body></body>")).toBeNull();
  });

  it("offers a fix only for a present document whose generated section differs", () => {
    const vfs = createVirtualFS();
    vfs.set("source/help/kb_x.php", `<body>mine\n${S}\nold\n${E}\n</body>`);
    vfs.set("README.md", `x\n${S}\nsame\n${E}\n`);
    const fixes = docRegenerationFixes({
      vfs,
      keyboardId: "kb_x",
      rendered: {
        "help-php": `<body>${S}\nnew\n${E}</body>`,
        "readme-md": `${S}\nsame\n${E}`,
        "welcome-htm": `<body>${S}\nw\n${E}</body>`, // not in the VFS
        "readme-htm": "<body>no markers</body>",
      },
    });
    expect(fixes.map((f) => f.id)).toEqual(["docs:regenerate:help-php"]);
  });

  it("accepting writes the previewed text into the working copy and the decision is recorded", () => {
    const vfs = createVirtualFS();
    const current = `<body>mine\n${S}\nold\n${E}\n</body>`;
    vfs.set("source/help/kb_x.php", current);
    useWorkingCopyStore.setState({ startVfs: vfs, startKeyboard: KB, instantiationMode: "adapt-existing" });
    const [fix] = docRegenerationFixes({
      vfs,
      keyboardId: "kb_x",
      rendered: { "help-php": `${S}\nnew\n${E}` },
    });
    expect(fix).toBeDefined();
    // Nothing changes until accepted.
    expect(useWorkingCopyStore.getState().startVfs?.get("source/help/kb_x.php")?.content).toBe(current);

    expect(recordSuggestionDisposition(fix!, "accepted")).toBe(true);
    expect(applyDocRegeneration(fix!)).toBe(true);
    expect(useWorkingCopyStore.getState().startVfs?.get("source/help/kb_x.php")?.content).toBe(
      `<body>mine\n${S}\nnew\n${E}\n</body>`,
    );
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(1);
  });
});
