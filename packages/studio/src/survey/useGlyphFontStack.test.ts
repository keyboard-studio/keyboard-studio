// Tests for useGlyphFontStack — the base Phase B stack plus the session's
// vendored script families (scriptFonts.ts). The langtags chunk loads for
// real here (it is a checked-in generated artifact), so the default-script
// resolution path is exercised end to end; tests await loadLangtags()
// (standing in for the identity flow's load — the hook itself never
// triggers it) and the hook's passive subscription recomputes the stack.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { makeStartKeyboard } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import { useGlyphFontStack } from "./useGlyphFontStack.ts";

const BASE_STACK = "'Noto Sans', system-ui, sans-serif";

function resetStores(): void {
  useDecisionStore.setState({ decisions: {} });
  useWorkingCopyStore.setState({ identity: null, startKeyboard: null });
}

async function flushLangtags(): Promise<void> {
  await act(async () => {
    await loadLangtags();
    await Promise.resolve();
  });
}

describe("useGlyphFontStack — script families", () => {
  beforeEach(() => {
    resetStores();
  });

  it("returns the plain base stack when no language or base is known", async () => {
    const { result } = renderHook(() => useGlyphFontStack());
    await flushLangtags();
    expect(result.current).toBe(BASE_STACK);
  });

  it("appends the target language's script family, resolved via the langtags default script", async () => {
    useWorkingCopyStore.setState({ identity: { bcp47: "ar" } });
    const { result } = renderHook(() => useGlyphFontStack());
    await flushLangtags();
    expect(result.current).toBe(
      "'Noto Sans', system-ui, 'Noto Naskh Arabic', sans-serif",
    );
  });

  it("unions the base keyboard's language-tag scripts with the target's", async () => {
    useWorkingCopyStore.setState({
      identity: { bcp47: "ar" },
      startKeyboard: makeStartKeyboard({
        id: "sil_syriac",
        path: "release/s/sil_syriac",
        script: "Syrc",
        targets: ["windows"],
        displayName: "Syriac",
        version: "1.0",
        languages: ["syr"],
      }),
    });
    const { result } = renderHook(() => useGlyphFontStack());
    await flushLangtags();
    expect(result.current).toBe(
      "'Noto Sans', system-ui, 'Noto Naskh Arabic', 'Noto Sans Syriac', sans-serif",
    );
  });

  it("a Latin target on a Latin base leaves the stack untouched", async () => {
    useWorkingCopyStore.setState({
      identity: { bcp47: "ewo" },
      startKeyboard: makeStartKeyboard({
        id: "sil_cameroon_qwerty",
        path: "release/s/sil_cameroon_qwerty",
        script: "Latn",
        targets: ["windows"],
        displayName: "Cameroon QWERTY",
        version: "1.0",
        languages: ["ewo"],
      }),
    });
    const { result } = renderHook(() => useGlyphFontStack());
    await flushLangtags();
    expect(result.current).toBe(BASE_STACK);
  });
});
