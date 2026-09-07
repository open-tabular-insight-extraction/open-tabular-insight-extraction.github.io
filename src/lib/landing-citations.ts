// Build-time citation numbering for the landing page only. The landing prose is a
// short, welcoming read, so its citations render as compact superscript numerals
// (see CitationNumeric.astro) rather than the paper pages' full author–year markers,
// which clustered three-deep in a sentence and broke up the text.
//
// Numbers are derived by scanning the raw .mdx source — the same synchronous, memoized
// parse pattern paper-structure.ts and citations.ts use — rather than by incrementing a
// counter during render. That matters for correctness, not just style: Astro renders
// pages concurrently, so module-level state mutated mid-render is not safe, and a
// repeated citekey must get the same number every time it appears (jagadish_big_2014 is
// cited three times in 01_motivation.mdx).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.resolve(process.cwd(), 'src/contents/landing_page');

// Reading order on the page, which is *not* filename order — index.astro renders the
// OpenTI beat before the motivation beat. Numbering follows what a visitor scrolls past.
const FILES_IN_READING_ORDER = ['03_openti.mdx', '01_motivation.mdx', '02_insights.mdx'];

const CITE_PATTERN = /<Citation\b[^>]*\bcite="([^"]+)"/g;

let cached: Map<string, number> | undefined;

function buildIndex(): Map<string, number> {
  const numbers = new Map<string, number>();

  for (const file of FILES_IN_READING_ORDER) {
    const source = readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    for (const match of source.matchAll(CITE_PATTERN)) {
      const citekey = match[1];
      if (!numbers.has(citekey)) numbers.set(citekey, numbers.size + 1);
    }
  }

  return numbers;
}

/**
 * The superscript numeral for a citekey cited in the landing page content.
 * Throws on an unknown key rather than silently numbering it, matching the
 * "malformed content fails the build" rule the rest of the citation path follows.
 */
export function getLandingCitationNumber(citekey: string): number {
  cached ??= buildIndex();
  const number = cached.get(citekey);
  if (number === undefined) {
    throw new Error(
      `[landing-citations] "${citekey}" is not cited in any of ${FILES_IN_READING_ORDER.join(
        ', ',
      )}. CitationNumeric is only for landing page content; use <Citation /> elsewhere.`,
    );
  }
  return number;
}
