// Isomorphic (no Node imports — safe to bundle client-side) matching between a rendered
// formula's raw LaTeX and the paper's notation entries (AA_notation_overview.json, see
// notation-data.ts). Demo-stage code for src/pages/demo/notation-formula.astro: validates
// whether automatic whole-formula matching is good enough before this gets wired into the
// real paper pages.
//
// Tier scope: matches whole formulas only, never sub-tokens within one (hovering the `O`
// inside `r=(O,E,\beta)` specifically is explicitly out of scope — see the plan). A
// formula's match set is "every notation entry whose defined symbol appears anywhere in
// this formula's LaTeX."

// Wrapping macros that take one brace-group argument and, together with that argument,
// read as a single atomic symbol (e.g. \mathcal{T}) — folded into one token so a bare
// single-letter entry (e.g. a hypothetical `t`) can't false-match inside them.
const WRAPPING_MACROS = new Set([
  '\\mathcal', '\\mathrm', '\\mathbf', '\\mathbb',
  '\\hat', '\\bar', '\\widehat', '\\overline', '\\underline',
]);

// Relational operators that mark the end of a "defined symbol" when an entry's term is
// itself a defining equation (e.g. `r=(O,E,\beta)` defines `r`; `E \subset O \times O`
// defines `E`). Only the LHS is the symbol being introduced.
const DEFINITION_BOUNDARY = new Set(['=', '\\subset']);

/** Splits LaTeX into command/letter/digit/punctuation tokens, then folds wrapping-macro
 * and subscript/superscript patterns into single compound tokens. */
export function tokenizeLatex(src: string): string[] {
  const stripped = src.trim().replace(/^\$+/, '').replace(/\$+$/, '');
  // \\[a-zA-Z]+ — a command (\beta); \\. — an escaped single char (\{); [A-Za-z] — one
  // bare letter (math-mode variables are juxtaposed, not run together as words); [0-9]+ —
  // a whole number; \S — any other single non-space character (braces, operators, ...).
  const raw = stripped.match(/\\[a-zA-Z]+|\\.|[A-Za-z]|[0-9]+|\S/g) ?? [];

  // Fold wrapping macro + {group} → one token, e.g. \mathcal , { , T , } → \mathcal{T}
  const foldedWrappers: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i];
    if (WRAPPING_MACROS.has(tok) && raw[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      let inner = '';
      while (j < raw.length && depth > 0) {
        if (raw[j] === '{') depth++;
        else if (raw[j] === '}') depth--;
        if (depth > 0) inner += raw[j];
        j++;
      }
      foldedWrappers.push(`${tok}{${inner}}`);
      i = j - 1;
    } else {
      foldedWrappers.push(tok);
    }
  }

  // Fold base + (_|^) + (group|single token) → one compound token, e.g. i , _ , d → i_d
  const foldedScripts: string[] = [];
  for (let i = 0; i < foldedWrappers.length; i++) {
    const tok = foldedWrappers[i];
    const next = foldedWrappers[i + 1];
    if ((next === '_' || next === '^') && foldedWrappers.length > i + 2) {
      let scriptValue: string;
      let consumed: number;
      if (foldedWrappers[i + 2] === '{') {
        let depth = 1;
        let j = i + 3;
        let inner = '';
        while (j < foldedWrappers.length && depth > 0) {
          if (foldedWrappers[j] === '{') depth++;
          else if (foldedWrappers[j] === '}') depth--;
          if (depth > 0) inner += foldedWrappers[j];
          j++;
        }
        scriptValue = `{${inner}}`;
        consumed = j - i;
      } else {
        scriptValue = foldedWrappers[i + 2];
        consumed = 3;
      }
      foldedScripts.push(`${tok}${next}${scriptValue}`);
      i += consumed - 1;
    } else {
      foldedScripts.push(tok);
    }
  }

  return foldedScripts.filter((t) => t.trim() !== '');
}

/** The LaTeX "defined symbol" for a notation-table entry: the term itself, or (for a
 * defining equation like `r=(O,E,\beta)`) just its left-hand side. */
export function deriveSymbol(term: string): string {
  const tokens = tokenizeLatex(term);
  const boundaryIndex = tokens.findIndex((t) => DEFINITION_BOUNDARY.has(t));
  const symbolTokens = boundaryIndex === -1 ? tokens : tokens.slice(0, boundaryIndex);
  return symbolTokens.join('');
}

export interface MatchableEntry {
  id: number;
  /** Pre-tokenized via deriveSymbol + tokenizeLatex (see notation-data.ts). */
  symbolTokens: string[];
}

/** Returns the ids of every entry whose symbol-token sequence is a contiguous subsequence
 * of the target formula's tokens. */
export function matchFormula(latex: string, entries: MatchableEntry[]): number[] {
  const formulaTokens = tokenizeLatex(latex);
  const matches: number[] = [];

  for (const entry of entries) {
    const n = entry.symbolTokens.length;
    if (n === 0) continue;
    for (let i = 0; i + n <= formulaTokens.length; i++) {
      let ok = true;
      for (let k = 0; k < n; k++) {
        if (formulaTokens[i + k] !== entry.symbolTokens[k]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        matches.push(entry.id);
        break;
      }
    }
  }

  return matches;
}
