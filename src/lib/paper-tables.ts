// Build-time loader for the full paper's table content. Mirrors citations.ts and
// paper-structure.ts: a synchronous, memoized, filesystem read rather than a content
// collection, because these are a handful of files consumed by exactly one page.
//
// Unlike references.bib and the method/eval evidence JSON, these files live in the repo
// (src/contents/full_paper/tables/*.json), not in the gitignored .local/ folder — they're
// hand-transcribed from the paper's LaTeX tables (see PaperTable.astro's authoring contract)
// rather than parsed from a build input, so there's nothing to sync.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PaperTableCell } from './paper-table-render';

const TABLES_DIR = path.resolve(process.cwd(), 'src/contents/full_paper/tables');

export interface PaperTableColumn {
  key: string;
  /** May contain `$...$` inline math, rendered the same way cell text is. */
  label: string;
  /** Groups adjacent columns under a shared spanning header cell (e.g. "Corpus", "Inputs"). */
  group?: string;
  align?: 'left' | 'center' | 'right';
}

export type PaperTableRow = Record<string, PaperTableCell> | { section: string };

export interface GridTableData {
  layout: 'grid';
  columns: PaperTableColumn[];
  rows: PaperTableRow[];
}

export interface SectionedEntry {
  section?: string;
  term?: string;
  description?: string;
}

export interface SectionedTableData {
  layout: 'sectioned';
  columns: [string, string];
  entries: SectionedEntry[];
}

export interface GroupedRowsBlock {
  description: string;
  rows: { formula: string; benchmarks: { citekey: string; text?: string }[] | string }[];
}

export interface GroupedRowsGroup {
  label: string;
  blocks: GroupedRowsBlock[];
}

export interface GroupedRowsTableData {
  layout: 'grouped-rows';
  columns: [string, string];
  groups: GroupedRowsGroup[];
}

export type PaperTableData = GridTableData | SectionedTableData | GroupedRowsTableData;

let cache: Map<string, PaperTableData> | undefined;

function loadAll(): Map<string, PaperTableData> {
  if (cache) return cache;
  cache = new Map();

  let files: string[];
  try {
    files = readdirSync(TABLES_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    // Directory not created yet (mid-migration) — callers fall back to the placeholder.
    return cache;
  }

  for (const file of files) {
    const raw = readFileSync(path.join(TABLES_DIR, file), 'utf-8');
    cache.set(file.replace(/\.json$/, ''), JSON.parse(raw) as PaperTableData);
  }
  return cache;
}

/** `src` is the same `tables/<name>` string authors pass to `<Table src="...">`. */
export function getPaperTable(src: string): PaperTableData | undefined {
  const name = src.replace(/^tables\//, '');
  return loadAll().get(name);
}
