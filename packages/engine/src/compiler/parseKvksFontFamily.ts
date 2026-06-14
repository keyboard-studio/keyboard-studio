// Extract the OSK font family name from a Keyman visual keyboard (.kvks) XML.
//
// The canonical location is the `fontname` attribute on the <encoding> element:
//   <encoding name="unicode" fontname="Andika Afr" fontsize="-12">
//
// The extracted string ("Andika Afr") is the CSS font-family value that the
// studio/frame side must use when injecting @font-face rules for the OSK preview.

/**
 * Parse a .kvks XML string and return the OSK font family name.
 * Pure function — no I/O, no side effects.
 *
 * @param kvksText - Full text content of a .kvks file.
 * @returns The fontname attribute value, or null if absent.
 */
export function parseKvksFontFamily(kvksText: string): string | null {
  // Match <encoding ... fontname="..." ...> allowing any attribute order.
  const re = /<encoding\b[^>]*\bfontname\s*=\s*"([^"]*)"/i;
  const m = re.exec(kvksText);
  if (m === null) return null;
  const family = (m[1] ?? "").trim();
  return family.length > 0 ? family : null;
}
