/**
 * A pinned GitHub location for "File:" evidence links in /review.
 * `path` is the keyboard's repo-relative folder; finding file paths are
 * keyboard-relative, so the blob URL joins the two.
 */
export interface GithubLink {
  owner: string;
  repo: string;
  sha: string;
  path: string;
}

/** Blob URL for a keyboard-relative file, e.g. "source/foo.kmn#L12". */
export function githubBlobUrl(link: GithubLink, file: string): string {
  return `https://github.com/${link.owner}/${link.repo}/blob/${link.sha}/${link.path}/${file}`;
}
