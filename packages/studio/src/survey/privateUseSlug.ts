// privateUseSlug — a private-use subtag made from a name (spec 115 FR-011 rule):
// NFD, combining marks dropped, ASCII letters and digits only, lowercase, at most
// 8 characters. Pure; the one place the rule lives.

export const PRIVATE_USE_SUBTAG_MAX = 8;

/** The slug of `name`, or `fallback` when nothing ASCII is left of it. */
export function privateUseSlug(name: string, fallback = "unnamed"): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase()
    .slice(0, PRIVATE_USE_SUBTAG_MAX);
  return slug === "" ? fallback : slug;
}
