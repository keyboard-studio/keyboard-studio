// relativeTime — coarse, human-readable "time ago" label ("just now",
// "3 hours ago", "2 days ago") for anything displaying a `savedAt` epoch-ms
// timestamp.
//
// Extracted from ResumeDraftBanner.tsx per specs/037-my-keyboards/spec.md
// "UI" section: "the same relativeTime() helper — extracted to a shared
// location rather than duplicated a third time" (MyKeyboardsList is the
// second consumer).
export function relativeTime(savedAt: number): string {
  const secs = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
