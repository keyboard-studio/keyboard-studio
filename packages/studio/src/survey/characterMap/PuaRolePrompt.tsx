// Private-use role prompt (spec 046 FR-004): no linguistic data exists for
// PUA characters, so the designer says letter-or-mark AT the point of
// picking — the character is not added to any list until answered. Pure/
// controlled: CharacterMapPane owns the pendingPuaChar state and only renders
// this component while it is non-null.

import { toUPlusNotation } from "@keyboard-studio/contracts";
import { TEXT_DIM, primaryButton } from "../surveyStyles.ts";

export interface PuaRolePromptProps {
  char: string;
  onChooseRole: (role: "letter" | "mark") => void;
  onCancel: () => void;
}

export function PuaRolePrompt({ char, onChooseRole, onCancel }: PuaRolePromptProps) {
  return (
    <div
      data-testid="pua-role-prompt"
      role="group"
      aria-label={`Is ${char} a letter or a mark?`}
      style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: TEXT_DIM }}
    >
      <span>
        {char} ({toUPlusNotation(char)}) is a private-use
        character, so there is no data to say what it is. Is it a letter of
        your alphabet, or a mark that attaches to a letter?
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          data-testid="pua-role-letter"
          onClick={() => onChooseRole("letter")}
          style={primaryButton(false)}
        >
          A letter
        </button>
        <button
          type="button"
          data-testid="pua-role-mark"
          onClick={() => onChooseRole("mark")}
          style={primaryButton(false)}
        >
          A mark
        </button>
        <button type="button" onClick={onCancel} style={{ fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
