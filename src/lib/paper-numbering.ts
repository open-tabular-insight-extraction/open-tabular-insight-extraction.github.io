// Shared pure helpers for numbering and anchoring paper headings/artifacts.
//
// Used from two places that must agree exactly: the build-time source scanner
// (paper-structure.ts, which builds the PaperRef registry and nav tree from raw
// .mdx text) and the rehype plugin (rehype-number-headings.mjs, which injects the
// same numbers into the rendered heading markup). Keeping the logic here as pure
// functions is what keeps those two independent passes in sync.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Deepest sub-level that gets a number (0-indexed: level 0 is the outermost
 * heading tier below the section/appendix-letter, e.g. "3.1"; level 1 is one
 * tier deeper, e.g. "3.1.2"). A 4th markdown heading tier (e.g. "#####" in
 * main sections) exceeds this and is treated as a run-in bold paragraph
 * label rather than a numbered, navigable section — see rehype-number-headings
 * and paper-structure.ts, which both skip registering/numbering it.
 */
export const MAX_HEADING_LEVEL = 1;

/** URL-safe anchor id, matching common slug conventions (lowercase, hyphenated). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalizes heading/caption text into the lookup key used by PaperRef.
 * Strips markdown emphasis markers and a trailing period (subsubsection
 * headings are authored as e.g. "Engaging Users." for prose flow) so authors
 * can reference the title as it reads in prose, e.g. <PaperRef to="Engaging Users" />.
 */
export function normalizeTitle(text: string): string {
  return text
    .replace(/\*\*|\*|_/g, '')
    .trim()
    .replace(/\.$/, '')
    .toLowerCase();
}

export interface NumberedHeading {
  depth: number;
  number: string;
}

/**
 * Stateful per-document numberer. Call `next(depth)` once per heading in
 * document order; depths must be non-decreasing on first sight (the first
 * heading seen establishes the base/outermost depth for that document).
 *
 * Non-appendix documents number numerically, prefixed with `sectionNumber`
 * (e.g. "3.2.1"). Appendix documents use letters at the outermost level
 * (e.g. "B.3"), matching the paper's convention of lettered appendices.
 */
export function createHeadingNumberer(opts: { sectionNumber?: string; appendix?: boolean }) {
  const counters: number[] = [];
  let baseDepth: number | undefined;

  /** Returns null for headings deeper than MAX_HEADING_LEVEL — not numbered. */
  return function next(depth: number): string | null {
    if (baseDepth === undefined) baseDepth = depth;
    const level = Math.max(0, depth - baseDepth);
    if (level > MAX_HEADING_LEVEL) return null;
    counters[level] = (counters[level] ?? 0) + 1;
    counters.length = level + 1;

    const parts = counters.slice(0, level + 1).map((count, idx) => {
      if (opts.appendix && idx === 0) return LETTERS[count - 1] ?? String(count);
      return String(count);
    });

    if (opts.appendix) return parts.join('.');
    return opts.sectionNumber ? [opts.sectionNumber, ...parts].join('.') : parts.join('.');
  };
}

/** Deduplicates anchors across the whole document set (github-slugger style). */
export function createAnchorer() {
  const seen = new Map<string, number>();
  return function next(text: string): string {
    const base = slugify(text) || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}
