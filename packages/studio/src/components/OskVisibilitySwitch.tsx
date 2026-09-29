// OskVisibilitySwitch — author-controlled OSK visibility (mobile adaptation
// #1853, principle 9).
//
// Wherever the KeymanWeb OSK is shown, this switch lets the author hide it
// to reclaim workspace for configuration. Hiding unmounts the OSK iframe
// (unloading KeymanWeb); showing remounts it through the normal init path.
// Host lifecycle only — the engine, iframe internals, and postMessage
// channel are untouched.
//
// A thin wrapper over the shared Phase-0 `Switch` primitive so the label
// copy and i18n id stay identical everywhere the control appears.

import { useLingui } from "@lingui/react/macro";
import { Switch } from "../ui/Switch.tsx";

export interface OskVisibilitySwitchProps {
  /** Whether the OSK preview is currently mounted. */
  checked: boolean;
  /** Fired with the next visibility when the author toggles. */
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}

export function OskVisibilitySwitch({
  checked,
  onCheckedChange,
  disabled,
}: OskVisibilitySwitchProps) {
  const { t } = useLingui();
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      label={t({
        id: "osk.visibility.label",
        message: "Show keyboard preview",
      })}
    />
  );
}
