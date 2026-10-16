// FontSwitcher — the character-font picker rendered in the NavBar, beside
// LocaleSwitcher/ThemeSwitcher (#1895).
//
// The value is NOT chrome state: it rides the `character-inventory` decision
// record (`CharacterInventoryValue.selectedFont`, spec 090), the same record
// the Characters step edits — this control is a second door to that one edit,
// available on every step instead of only atop the Characters left pane. It
// reads and writes through `useInventoryDraft("characters")`, the exact path
// the in-pane picker used (shell precedent: CharacterMapPane edits the same
// accumulator from outside the step), so persistence is unchanged: the choice
// is saved with the durable draft (local + cloud) and existing drafts keep
// their font with no migration. Every glyph surface already reads the record
// via `useGlyphFontStack()`, so the choice applies project-wide.
//
// Visual/ARIA shape mirrors LocaleSwitcher: an inline label span plus a
// SelectMenu listbox named via aria-labelledby. The label reuses the
// Characters step's existing message id (the string moved; it did not
// change), and each option renders in its own font, as the old picker did.
// The `phase-b-font-select` test id moved with the control so existing
// anchors keep working.
import { Trans } from "@lingui/react/macro";
import { SelectMenu } from "../ui/SelectMenu.tsx";
import { useInventoryDraft } from "../survey/useInventoryDraft.ts";
import { FONT_OPTIONS, phaseBFontStack } from "../survey/surveyStyles.ts";

const LABEL_ID = "phase-b-font-select-label";

export function FontSwitcher() {
  const draft = useInventoryDraft("characters");
  const selectedFont = draft.selectedFont;
  const setSelectedFont = draft.ops.setSelectedFont;

  return (
    <span
      data-testid="phase-b-font-select"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "var(--app-text)",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <span id={LABEL_ID}>
        <Trans id="survey.phaseB.buildList.fontSelectLabel">
          Font for characters
        </Trans>
      </span>
      <SelectMenu
        id="phase-b-font-select-control"
        ariaLabelledby={LABEL_ID}
        value={selectedFont}
        options={FONT_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
        renderOptionLabel={(opt) => (
          <span style={{ fontFamily: phaseBFontStack(opt.value) }}>
            {opt.label}
          </span>
        )}
        onChange={(v) => {
          const opt = FONT_OPTIONS.find((o) => o.value === v);
          if (opt) setSelectedFont(opt.value);
        }}
        style={{ width: 140 }}
      />
    </span>
  );
}
