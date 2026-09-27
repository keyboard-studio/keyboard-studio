// The two-pane layout's scrolling survey questions pane.
//
// A scroll container a keyboard cannot reach fails WCAG 2.1.1 (axe
// `scrollable-region-focusable`). Since spec 081 moved the step nav to the
// footer, a step with no body controls (Prefill) leaves this pane with nothing
// to focus. The pane becomes a Tab stop in two cases:
//
// 1. It has no focusable descendant — there is nothing else to scroll by.
// 2. It has focusable descendants AND it actually overflows (mixed content:
//    one early control followed by lengthy read-only content). Tab would move
//    from that early control straight to the footer, leaving the tail content
//    below unreachable by keyboard — arrow keys on a focused control do not
//    scroll the pane, and there may be no later control to Tab to. The pane's
//    own stop gives arrows/PageDown a way to move through the rest.
//
// Otherwise (controls, no overflow) the pane stays out of Tab order: an extra
// stop before every question would only be noise. This matches what
// Chromium's keyboard-focusable scrollers do natively, which axe does not
// credit.

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FOCUSABLE_SELECTOR } from "../lib/focusableSelector.ts";

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
    const update = () => {
      if (pane.querySelector(FOCUSABLE_SELECTOR) === null) {
        setNeedsTabStop(true);
        return;
      }
      // Mixed content (case 2 above): only when the pane genuinely scrolls.
      // `+ 1` tolerates subpixel rounding; in jsdom both read 0, which keeps
      // the historical no-stop behaviour there.
      setNeedsTabStop(pane.scrollHeight > pane.clientHeight + 1);
    };
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
    // Viewport and font changes alter overflow without touching the DOM the
    // MutationObserver watches (and content edits change it without resizing
    // the pane element itself), so watch both. Guarded like scrollIntoView in
    // StudioFooter: jsdom has no ResizeObserver, real browsers all do.
    const canResizeObserve = typeof ResizeObserver === "function";
    const resizer = canResizeObserve ? new ResizeObserver(update) : null;
    resizer?.observe(pane);
    return () => {
      observer.disconnect();
      resizer?.disconnect();
    };
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
