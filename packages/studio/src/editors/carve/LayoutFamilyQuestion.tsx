// LayoutFamilyQuestion — T025 (spec 076 FR-023, amendment A3.1).
//
// The existing `layout_family` survey question surfaced in the main flow.
// Renders the question DEFINITION's prompt and options unchanged through the
// standard QuestionField; persists answers to the survey answer store
// (editable — answering again overwrites). Rendered in the carve gallery;
// exported for the future closed-keyboard card (076 US1 / phase-5 Behaviours
// step), which does not exist in the codebase yet.
//
// Structurally separate from the per-row disposition controls (T016): this is
// a gallery-level setting, not a per-carve control. No disposition UI and no
// per-disposition host-consequence copy here (T016/T019). The one-line
// "likely hosts" note below is the wiring made demonstrable (A1): it names
// the host set the FR-023 resolution currently yields and where it came from,
// so the author can see their answer take effect. T018's demonstration UI
// builds on the same `useLikelyHostLayouts` hook.

import { useCallback } from "react";
import { Trans } from "@lingui/react/macro";
import { QuestionField } from "../../survey/QuestionField.tsx";
import { definition as layoutFamilyDefinition } from "../../survey/questions/reserve/layout_family.ts";
import {
  isLayoutFamilyValue,
  saveLayoutFamilyAnswer,
  useLayoutFamilyAnswer,
  useLikelyHostLayouts,
} from "../../lib/layoutFamily.ts";
import type { LikelyHostSource } from "../../lib/layoutFamily.ts";

export function LayoutFamilyQuestion({ bcp47 }: { bcp47?: string | undefined }) {
  const answer = useLayoutFamilyAnswer();
  const { hosts, source } = useLikelyHostLayouts(bcp47);

  const handleChange = useCallback((v: string | string[]) => {
    const next = Array.isArray(v) ? v[0] : v;
    saveLayoutFamilyAnswer(isLayoutFamilyValue(next) ? next : undefined);
  }, []);

  const hostList = hosts.map((h) => h.label).join(", ");

  return (
    <section data-testid="layout-family-question">
      <QuestionField question={layoutFamilyDefinition} value={answer} onChange={handleChange} />
      <p
        data-testid="layout-family-likely-hosts"
        style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--app-text-muted)", lineHeight: 1.5 }}
      >
        <LikelyHostsNote source={source} hostList={hostList} />
      </p>
    </section>
  );
}

function LikelyHostsNote({ source, hostList }: { source: LikelyHostSource; hostList: string }) {
  // Neutral metadata about the resolution — not per-disposition consequence
  // copy (T019). Each branch states where the set came from, honestly.
  if (source === "layout-family") {
    return (
      <Trans id="layout-family.likely-hosts.from-answer">
        Likely host layouts (from your answer above): {hostList}
      </Trans>
    );
  }
  if (source === "bcp47") {
    return (
      <Trans id="layout-family.likely-hosts.from-bcp47">
        Likely host layouts (from the keyboard&apos;s language tags): {hostList}
      </Trans>
    );
  }
  return (
    <Trans id="layout-family.likely-hosts.default">
      Likely host layouts (default set — answer the question above to tailor it): {hostList}
    </Trans>
  );
}
