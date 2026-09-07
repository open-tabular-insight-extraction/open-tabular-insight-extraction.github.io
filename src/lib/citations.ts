// Build-time citation index: a citekey lookup over the paper's references.
//
// The source of truth is .local/paper/references.bib, but .local/ is gitignored and absent
// in CI, so this reads the committed distillation of it instead — src/contents/data/
// references.json, produced by `npm run sync:paper-data` (scripts/sync-paper-data.mjs),
// which does the Citation.js parse and writes exactly the CitationEntry shape below. That
// indirection is what lets GitHub Actions build the site at all; re-run the sync and commit
// its output whenever references.bib changes.
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Resolved from the working directory (the project root Astro/Vite runs from), not from
// this module's own path — the build bundles/moves this file, which would otherwise break
// a path resolved relative to import.meta.url.
const REFERENCES_PATH = path.resolve(process.cwd(), 'src/contents/data/references.json');

export interface CitationAuthor {
  given?: string;
  family?: string;
  literal?: string;
}

export interface CitationEntry {
  id: string;
  type: string;
  title?: string;
  authors: CitationAuthor[];
  year?: number;
  containerTitle?: string;
  publisher?: string;
  doi?: string;
  url?: string;
}

let index: Map<string, CitationEntry> | undefined;

function loadIndex(): Map<string, CitationEntry> {
  if (index) return index;

  let raw: string;
  try {
    raw = readFileSync(REFERENCES_PATH, 'utf-8');
  } catch (error) {
    throw new Error(
      `Could not read ${REFERENCES_PATH}. It is generated from the paper's references.bib by ` +
        '`npm run sync:paper-data` and is meant to be committed — see CLAUDE.md.',
      { cause: error },
    );
  }

  const entries = JSON.parse(raw) as Record<string, CitationEntry>;
  index = new Map(Object.entries(entries));
  return index;
}

export function getCitation(citekey: string): CitationEntry {
  const entry = loadIndex().get(citekey);
  if (!entry) {
    throw new Error(`Unknown citekey "${citekey}" — no matching entry in references.bib`);
  }
  return entry;
}

/** Compact "Author, Author2 & Author3, Year" label for markers and hover cards. */
export function formatCitationLabel(entry: CitationEntry): string {
  const names = entry.authors.map(
    (author) => author.literal ?? [author.family, author.given?.[0]].filter(Boolean).join(', '),
  );

  let authorText: string;
  if (names.length === 0) authorText = '';
  else if (names.length === 1) authorText = names[0];
  else if (names.length === 2) authorText = `${names[0]} & ${names[1]}`;
  else authorText = `${names[0]} et al.`;

  if (!authorText) return entry.year ? `${entry.id}, ${entry.year}` : entry.id;
  return entry.year ? `${authorText}, ${entry.year}` : authorText;
}

export function getCitationHref(entry: CitationEntry): string | undefined {
  if (entry.doi) return `https://doi.org/${entry.doi}`;
  return entry.url;
}
