// SC-008 MSKLC parity (spec 113 T085): a layout MSKLC can express -- characters and ligatures in
// four shift states, and two deadkeys with combination tables and space rows -- is built from
// nothing but `kmn-edits` entries (Layout-tab key edits) and spec 083 deadkey ops, the very calls
// the Layout tab's panels make. The result is projected the way the preview and the download
// project it, compiled by the real compiler, and typed through the real simulator. No step uses
// the Code tab: the decision log holds only `kmn-edits` and `deadkeys-defined`, and no entry is
// authored in the Code tab.

import { beforeEach, describe, expect, it } from "vitest";
import { allocateDeadkeyId, createVirtualFS } from "@keyboard-studio/contracts";
import type { KmnEditsValue, LayerCombo, SimKeyInput } from "@keyboard-studio/contracts";
import { compile, parseKmn } from "@keyboard-studio/engine";
import { simulate } from "@keyboard-studio/engine/simulator";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../../stores/rulesDemoArtifactStore.ts";
import { projectWorkingCopyVfs } from "../../lib/projectWorkingCopyVfs.ts";
import { layerToSimInput } from "./useLayoutAttribution.ts";

const ID = "msklc_parity";
const KMN = `store(&VERSION) '10.0'
store(&NAME) 'msklc-parity'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

+ [K_Z] > 'z'
`;

const NORMAL: LayerCombo = [];
const SHIFT: LayerCombo = ["SHIFT"];
const ALTGR: LayerCombo = ["RALT"];
const SHIFT_ALTGR: LayerCombo = ["SHIFT", "RALT"];

const store = () => useWorkingCopyStore.getState();
const press = (vkey: string, layer: LayerCombo = NORMAL): SimKeyInput => layerToSimInput(vkey, layer);

function setKey(vkey: string, layer: LayerCombo, text: string): void {
  const result = store().commitKmnEdit({ op: "set-key", vkey, layer, output: { kind: "text", text } });
  expect(result.ok, `set-key ${vkey} ${layer.join("+")}`).toBe(true);
}

/** A deadkey made the way the Layout tab makes it: define, then one add-pair per table row. */
function makeDeadkey(triggerKey: string, display: string, pairs: ReadonlyArray<[string, string]>): number {
  const id = allocateDeadkeyId(store().ir!);
  const defined = store().commitLayoutDeadkeyOp({ kind: "define", triggerKey, id, accentChar: display });
  expect(defined.ok, `define on ${triggerKey}`).toBe(true);
  for (const [base, accented] of pairs) {
    expect(store().commitLayoutDeadkeyOp({ kind: "add-pair", id, base, accented }).ok).toBe(true);
  }
  return id;
}

beforeEach(() => {
  const ir = parseKmn(KMN, ID).ir;
  useWorkingCopyStore.setState({
    ir,
    startIr: ir,
    undoStack: [],
    desktopLocked: false,
    phaseResults: [],
    displacedDeclined: [],
    deadkeyOverlay: { ops: [] },
  });
  useDecisionStore.getState().reset();
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact(`blob:${ID}`, ID));
});

describe("SC-008 MSKLC parity", () => {
  it(
    "characters and ligatures in four shift states, and two deadkeys with tables and space rows, type correctly",
    async () => {
      // Characters in four shift states on one key, ligatures in two more.
      setKey("K_A", NORMAL, "ɑ");
      setKey("K_A", SHIFT, "Ɑ");
      setKey("K_A", ALTGR, "α");
      setKey("K_A", SHIFT_ALTGR, "Α");
      setKey("K_L", NORMAL, "ij");
      setKey("K_L", SHIFT, "IJ");
      setKey("K_L", ALTGR, "ﬁ");
      setKey("K_L", SHIFT_ALTGR, "œ");

      // Two deadkeys, each with a combination table and a space row.
      makeDeadkey("K_QUOTE", "´", [
        ["e", "é"],
        ["o", "ó"],
        [" ", "´"],
      ]);
      makeDeadkey("K_BKQUOTE", "`", [
        ["e", "è"],
        ["o", "ò"],
        [" ", "`"],
      ]);

      // Only the two kinds of entry exist: kmn-edits entries (key edits) and spec 083 ops.
      const decisions = useDecisionStore.getState().decisions;
      expect(Object.keys(decisions).sort()).toEqual(["deadkeys-defined", "kmn-edits"]);
      const entries = (decisions["kmn-edits"]?.value as KmnEditsValue).entries;
      expect(entries.every((e) => e.op === "set-key")).toBe(true);
      expect(entries).toHaveLength(8);
      const ops = store().deadkeyOverlay.ops;
      expect(ops.map((o) => o.kind)).toEqual(["define", "add-pair", "add-pair", "add-pair", "define", "add-pair", "add-pair", "add-pair"]);

      // Project exactly as the preview and the download do, compile, and type.
      const vfs = createVirtualFS([{ path: `source/${ID}.kmn`, content: KMN, isBinary: false }]);
      projectWorkingCopyVfs({
        vfs,
        keyboardId: ID,
        startIr: store().startIr!,
        deletedNodeIds: new Set<string>(),
        deletedItemIds: new Set<string>(),
        deletedTouchKeyIds: new Set<string>(),
        assignments: [],
        getPattern: () => undefined,
        identity: null,
        kmnEdits: decisions["kmn-edits"]?.value as KmnEditsValue,
        deadkeyOps: ops,
      });
      const compiled = await compile(vfs, ID);
      expect(compiled.success, "the projected keyboard compiles").toBe(true);

      const typed = (keys: SimKeyInput[]): string => simulate(compiled, keys).finalOutput;
      // Four shift states.
      expect(typed([press("K_A", NORMAL)])).toBe("ɑ");
      expect(typed([press("K_A", SHIFT)])).toBe("Ɑ");
      expect(typed([press("K_A", ALTGR)])).toBe("α");
      expect(typed([press("K_A", SHIFT_ALTGR)])).toBe("Α");
      // Ligatures.
      expect(typed([press("K_L", NORMAL)])).toBe("ij");
      expect(typed([press("K_L", SHIFT)])).toBe("IJ");
      expect(typed([press("K_L", ALTGR)])).toBe("ﬁ");
      expect(typed([press("K_L", SHIFT_ALTGR)])).toBe("œ");
      // Deadkey tables, space rows, and the key pressed twice.
      expect(typed([press("K_QUOTE"), press("K_E")])).toBe("é");
      expect(typed([press("K_QUOTE"), press("K_O")])).toBe("ó");
      expect(typed([press("K_QUOTE"), press("K_SPACE")])).toBe("´");
      expect(typed([press("K_BKQUOTE"), press("K_E")])).toBe("è");
      expect(typed([press("K_BKQUOTE"), press("K_O")])).toBe("ò");
      expect(typed([press("K_BKQUOTE"), press("K_SPACE")])).toBe("`");
      expect(typed([press("K_QUOTE"), press("K_QUOTE")])).toBe("´");
      // The untouched key still types.
      expect(typed([press("K_Z")])).toBe("z");
    },
    60_000,
  );
});
