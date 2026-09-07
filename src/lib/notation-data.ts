// Build-time only (reads via node:fs through getPaperTable) — never import this from a
// Svelte component or client <script>. Loads the paper's notation table
// (src/contents/full_paper/tables/AA_notation_overview.json) and prepares it for both demo
// pages: pre-rendered HTML (so the client never needs KaTeX itself) and pre-tokenized
// symbols (so notation-formula.astro's client script can match without re-deriving them).
import { getPaperTable } from './paper-tables';
import { renderMathText } from './paper-table-render';
import { deriveSymbol, tokenizeLatex } from './notation-match';

export interface NotationEntry {
  id: number;
  section?: string;
  term: string;
  termHtml: string;
  description: string;
  descriptionHtml: string;
  /** Tokenized deriveSymbol(term) — what notation-match.ts's matchFormula() compares
   * a formula's tokens against. */
  symbolTokens: string[];
}

let cache: NotationEntry[] | undefined;

/** All notation-table rows that define a symbol (section-header rows excluded), each
 * pre-rendered and pre-tokenized. Stable `id` = position among term-bearing rows, in
 * document order — used to key matches back to entries client-side. */
export function loadNotationEntries(): NotationEntry[] {
  if (cache) return cache;

  const data = getPaperTable('tables/AA_notation_overview');
  if (!data || data.layout !== 'sectioned') {
    throw new Error(
      'Expected src/contents/full_paper/tables/AA_notation_overview.json to be a sectioned table.',
    );
  }

  let currentSection: string | undefined;
  let id = 0;
  const entries: NotationEntry[] = [];

  for (const entry of data.entries) {
    if ('section' in entry && entry.section) {
      currentSection = entry.section;
      continue;
    }
    const term = entry.term ?? '';
    const description = entry.description ?? '';
    entries.push({
      id: id++,
      section: currentSection,
      term,
      termHtml: renderMathText(term),
      description,
      descriptionHtml: renderMathText(description),
      symbolTokens: tokenizeLatex(deriveSymbol(term)),
    });
  }

  cache = entries;
  return cache;
}
