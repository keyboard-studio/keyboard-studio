// The two-pane layout's scrolling survey questions pane.
//
// A scroll container a keyboard cannot reach fails WCAG 2.1.1 (axe
// `scrollable-region-focusable`). Since spec 081 moved the step nav to the
// footer, a step with no body controls (Prefill) leaves this pane with nothing
// to focus. The pane becomes a Tab stop only in that case: a step with its own
// controls is scrolled by focusing them, and an extra stop before every
// question would only be noise. This matches what Chromium's keyboard-focusable
// scrollers do natively, which axe does not credit.

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Elements that take focus by Tab without a tabindex of their own. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';

export function SurveyQuestionsPane({
  label,
  style,
  children,
}: {
  label: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [needsTabStop, setNeedsTabStop] = useState(false);

  useLayoutEffect(() => {
    const pane = ref.current;
    if (pane === null) return;
    // The pane's own tabindex is on the pane, not a descendant, so it never
    // counts itself.
    const update = () =>
      setNeedsTabStop(pane.querySelector(FOCUSABLE) === null);
    update();
    const observer = new MutationObserver(update);
    observer.observe(pane, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "tabindex",
        "href",
        "type",
        "contenteditable",
      ],
    });
    return () => observer.disconnect();
  }, []);

  // Spread rather than a tabIndex attribute: `jsx-a11y/no-noninteractive-tabindex`
  // has no notion of scroll containers (same trade as KmnSourceView), and the
  // aria-label makes this a named region, not a stray stop.
  const tabStop = needsTabStop ? { tabIndex: 0 } : {};

  return (
    <section
      ref={ref}
      aria-label={label}
      className="ks-focus-ring"
      style={style}
      {...tabStop}
    >
      {children}
    </section>
  );
}
