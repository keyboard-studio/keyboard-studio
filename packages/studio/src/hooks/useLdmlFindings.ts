// useLdmlFindings: the LDML export's authoring-time findings (spec 108 US2). A pure
// synchronous compute in a useMemo over working-copy slices: no timer, no effect that
// schedules work, no store write (Constitution Article IV, decision D3, FR-014).
// StudioShell merges the result into the one findings array it already publishes.
//
// It classifies the preview projection the last successful compile published, with the same
// base-layout resolver and the same classify options the download uses, so the findings and
// the report name the same sites (FR-012, SC-005).

import { useMemo } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LintFinding } from "@keyboard-studio/contracts";
import {
  classifyForLdml,
  listLdmlProfiles,
  parseKvks,
  resolveLdmlProfile,
  type LdmlProfileId,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { usePickedWindowsLayouts, useLayoutFamilyAnswer } from "../lib/layoutFamily.ts";
import { resolveLdmlBaseLayout } from "../lib/ldmlBaseLayout.ts";
import { ldmlClassifyOptions } from "../lib/ldmlExportInputs.ts";
import { ldmlAttributionText, ldmlMetadataLanguages } from "../lib/ldmlExportMetadata.ts";
import { parseTouchLayoutOrNull } from "../lib/docContent.ts";
import { buildLdmlFindings } from "../lint/ldmlFindings.ts";

const EMPTY: LintFinding[] = [];

function defaultProfileId(): LdmlProfileId | undefined {
  return listLdmlProfiles().find((p) => p.isDefault)?.id;
}

export function useLdmlFindings(): LintFinding[] {
  const { i18n } = useLingui();
  const projection = useWorkingCopyStore((s) => s.previewProjection);
  const ldmlProfile = useWorkingCopyStore((s) => s.ldmlProfile);
  const ldmlBaseLayout = useWorkingCopyStore((s) => s.ldmlBaseLayout);
  const bcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const identity = useWorkingCopyStore((s) => s.identity);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const startLicenseText = useWorkingCopyStore((s) => s.startLicenseText);
  const startHolderOverride = useWorkingCopyStore((s) => s.startHolderOverride);
  const picks = usePickedWindowsLayouts();
  const layoutFamily = useLayoutFamilyAnswer();

  return useMemo(() => {
    if (projection === null) return EMPTY;
    const profileId = ldmlProfile ?? defaultProfileId();
    if (profileId === undefined) return EMPTY;

    const languages = bcp47 !== undefined && bcp47 !== "" ? [bcp47] : [];
    const base = resolveLdmlBaseLayout({
      windowsLayoutPicks: picks,
      layoutFamily: layoutFamily ?? null,
      bcp47: languages,
      override: ldmlBaseLayout,
    });
    // An unavailable default with no override: the panel on the Output page shows why, and no
    // finding exists without a contract code (FR-011).
    if (base.chosen === null) return EMPTY;

    let visualKeyboard = null;
    if (projection.kvksText !== null) {
      try {
        visualKeyboard = parseKvks(projection.kvksText);
      } catch {
        visualKeyboard = null;
      }
    }
    const classification = classifyForLdml(
      {
        ir: projection.ir,
        touchLayout: parseTouchLayoutOrNull(projection.touchLayoutText),
        visualKeyboard,
        baseLayout: base.chosen,
      },
      resolveLdmlProfile(profileId),
      ldmlClassifyOptions({
        languages: ldmlMetadataLanguages({ identity, startKeyboard }),
        attributionText: ldmlAttributionText({ instantiationMode, startLicenseText, startHolderOverride }),
      }),
    );
    const findings = buildLdmlFindings(classification, i18n, projection.keyboardId);
    return findings.length === 0 ? EMPTY : findings;
  }, [projection, ldmlProfile, ldmlBaseLayout, bcp47, identity, startKeyboard, instantiationMode, startLicenseText, startHolderOverride, picks, layoutFamily, i18n]);
}
