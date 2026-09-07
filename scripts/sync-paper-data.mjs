// Maintainer-only import step: distils the paper's source-of-truth data in the gitignored
// .local/ folder into small, committed JSON files under src/contents/data/.
//
// Why this exists: .local/ is never committed (see CLAUDE.md), so nothing under it is
// present when GitHub Actions builds the site. Anything the build needs has to cross into
// the repo through a step like this one. The site code reads ONLY the generated files —
// never .local — which is what lets CI build at all.
//
// Run it (as Daniel, on a machine with .local checked out) whenever the paper's evidence
// records or references.bib change:
//
//   npm run sync:paper-data
//
// and commit the resulting src/contents/data/*.json alongside the change.
//
// The distillation is deliberately lossy: per-dimension `reasoning`, verbatim `evidence`
// quotes, `confidence` ratings/notes and retired fields stay in .local and never reach the
// public site (per .local/04_minimal_website.md). Only what the overview tables can
// actually present is carried over.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';

const ROOT = process.cwd();
const LOCAL = path.join(ROOT, '.local', 'paper');
const METHODS_DIR = path.join(LOCAL, 'data', 'method_analysis');
const EVALS_DIR = path.join(LOCAL, 'data', 'eval_analysis');
const REFERENCES_BIB = path.join(LOCAL, 'references.bib');
const OUT_DIR = path.join(ROOT, 'src', 'contents', 'data');
const CONTENT_DIR = path.join(ROOT, 'src', 'contents');
const MDX_DIRS = [path.join(CONTENT_DIR, 'full_paper'), path.join(CONTENT_DIR, 'landing_page')];
const PAPER_TABLES_DIR = path.join(CONTENT_DIR, 'full_paper', 'tables');

function fail(message) {
  console.error(`\nsync:paper-data — ${message}\n`);
  process.exit(1);
}

function readJsonDir(dir, label) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch (error) {
    fail(
      `could not read ${label} at ${dir}.\n` +
        'This folder lives in the gitignored .local/ directory and only exists on the ' +
        "maintainer's machine. This script is not meant to run in CI — the site reads the " +
        'committed files in src/contents/data/ instead.',
    );
  }
  if (files.length === 0) fail(`no JSON files found in ${dir}`);
  return files.map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf-8')));
}

/** `["a", "b"]` from `[{aspect-ish objects}]` or a plain string list, tolerating both. */
function aspectNames(aspects) {
  if (!Array.isArray(aspects)) return [];
  return aspects.map((a) => (typeof a === 'string' ? a : (a.aspect ?? a.name ?? String(a))));
}

/*
  Count-ish fields are typed inconsistently in the records — `num_tables` is sometimes the
  number 611 and sometimes the string "423", and often a sentinel ("not_reported") or a
  derivation note ("5.1 (derived: 1020 tables / 200 databases)"). Normalise to string so
  the site has one type to handle; the pages parse a leading number back out for sorting.
*/
function asText(value, fallback = 'not_reported') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

// ---------------------------------------------------------------- systems

/*
  The systems overview table (src/pages/methods-benchmarks/index.astro) is the only
  consumer of systems.json, so this distillation keeps exactly the fields that table shows
  — nothing else. (`review_status`/`reasoning`/`evidence`/`confidence` etc. were already
  dropped as maintainer-only; `summary`, `retrievalMechanism`, `compositionPattern`,
  `interaction` timing/initiative and each capability's `coverage` rating are the further
  fields this trims, since the site never rendered them.) If the table grows a column, add
  the field back here.
*/
function distilSystem(record) {
  const profile = record.paper_profile ?? {};
  const orchestration = record.orchestration_profile ?? {};

  return {
    citekey: profile.citekey,
    name: profile.system_name,
    dataSetting: profile.data_setting,
    orchestration: orchestration.orchestration?.strategy,
    capabilities: {
      interpretation: aspectNames(record.interpretation?.aspects),
      retrieval: aspectNames(record.data_retrieval?.aspects),
      analysis: aspectNames(record.analytical_composition_and_execution?.aspects),
      output: aspectNames(record.output_synthesis?.aspects),
      governance: aspectNames(record.process_governance?.aspects),
    },
    // Deduplicated: a system can demonstrate the same input mode across several datasets.
    inputModes: [...new Set((orchestration.interaction?.modes ?? []).map((m) => m.mode))],
    // Verbatim dataset names as coded from the paper (not normalized against
    // src/contents/data/benchmarks.json — the same dataset is coded under enough spelling
    // variants across systems, e.g. "BIRD" / "Bird" / "BIRD (dev)", that auto-matching them
    // would risk silently wrong links; showing the coded text as-is keeps this trustworthy).
    datasets: [...new Set((orchestration.datasets?.datasets ?? []).map((d) => d.name_verbatim.trim()))].sort(),
  };
}

// ------------------------------------------------------------- benchmarks

/*
  Insight types come from one of two places. 23 of the 42 records carry
  `types_authoritative` — the pills transcribed verbatim from the paper's Table 5, flagged
  `source: "table5_authoritative"` — which can differ from the analysis-derived `types`.
  Prefer the authoritative list wherever it exists so the site never disagrees with the
  paper, and carry the flag through so the page can say which is which.

  `requires_artifact` is the paper's bordered-pill nuance (an instance that demands an
  artifact, e.g. a prediction model, rather than an insight); it only exists on the
  authoritative list.
*/
function benchmarkInsightTypes(record) {
  const authoritative = record.insight_types?.types_authoritative;
  if (Array.isArray(authoritative) && authoritative.length > 0) {
    return {
      insightTypes: authoritative.map((t) => ({
        type: t.insight_type,
        requiresArtifact: Boolean(t.requires_artifact),
      })),
      insightTypesAuthoritative: true,
    };
  }
  return {
    insightTypes: (record.insight_types?.types ?? []).map((t) => ({
      type: t.insight_type,
      requiresArtifact: false,
    })),
    insightTypesAuthoritative: false,
  };
}

/*
  The benchmarks overview table (src/pages/methods-benchmarks/benchmarks/index.astro) is the
  only consumer of benchmarks.json, so — like systems.json — this keeps exactly the fields
  that table shows. Trimmed here: `summary`, `paperType`, `corpus.domains`/`messiness`,
  `setting.tablesPerInstance`/`wordsPerInput` (dropped from the table itself: the paper's
  per-instance table/word counts aren't reliably comparable across benchmarks that report
  them so differently, e.g. per-database vs. per-instance — the setting glyph alone is the
  trustworthy part), `setting.multiTableRequired`/`realizationArtifacts`/`openAdaptability`,
  `interaction.targetModes`/`avgTurns`, and `validation.combination`/
  `acceptsMultipleValidRealizations`/`unanswerableInstances`. If the table grows a column,
  add the field back here.
*/
function distilBenchmark(record) {
  const profile = record.paper_profile ?? {};
  const corpus = record.corpus ?? {};
  const setting = record.setting ?? {};
  const interaction = record.interaction ?? {};
  const validation = record.validation ?? {};

  return {
    citekey: profile.citekey,
    name: profile.display_name ?? profile.dataset_name,
    corpus: {
      numTables: asText(corpus.num_tables),
      format: asText(corpus.corpus_format),
      provenance: asText(corpus.provenance),
      additionalData: asText(corpus.additional_data, 'none'),
      // The record still calls this "retired_" because the *curation* reading it once
      // encoded was retired; the corpus-assembly coding it holds now is what the paper's
      // Table 5 "Curation" column shows, so it is what the site shows too.
      assembly: corpus.retired_curation_corpus_assembly ?? 'not_reported',
    },
    setting: {
      numInstances: asText(setting.num_instances),
      dataSetting: setting.data_setting,
      outputModalities: setting.output_modalities ?? [],
    },
    interaction: {
      inputProtocol: interaction.input_protocol,
    },
    validation: {
      // Deduplicated: a benchmark often applies the same validation function to several
      // targets, which the table shows as one label.
      functions: [...new Set((validation.mechanisms ?? []).map((m) => m.function))],
    },
    ...benchmarkInsightTypes(record),
    inOverviewTable: Boolean(profile.in_overview_table),
  };
}

// ------------------------------------------------------------- references

/*
  The site only ever looks up a citekey it already has in hand (via `<Citation cite="…">`,
  a paper-table row's `citekey` field, or a system/benchmark record) — nothing enumerates
  the full reference list — so references.json only needs to carry the citekeys actually
  used somewhere on the site, not every entry in references.bib (~690+ entries, most of
  which are prose-only citations in the paper's LaTeX that never made it into the mdx).
  Filtering here keeps the committed file honest about what the site actually cites.
*/
function findFiles(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findFiles(full, predicate));
    else if (predicate(entry)) out.push(full);
  }
  return out;
}

const MDX_CITE_PATTERN = /<Citation\b[^>]*\bcite="([^"]+)"/g;

function citekeysFromMdx() {
  const keys = new Set();
  for (const dir of MDX_DIRS) {
    for (const file of findFiles(dir, (name) => name.endsWith('.mdx'))) {
      const source = readFileSync(file, 'utf-8');
      for (const match of source.matchAll(MDX_CITE_PATTERN)) keys.add(match[1]);
    }
  }
  return keys;
}

/** Walks a paper-table JSON's rows (any layout) for `citekey` fields, however nested. */
function citekeysFromValue(value, keys) {
  if (Array.isArray(value)) {
    for (const item of value) citekeysFromValue(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'citekey' && typeof v === 'string') keys.add(v);
      else citekeysFromValue(v, keys);
    }
  }
}

function citekeysFromPaperTables() {
  const keys = new Set();
  for (const file of findFiles(PAPER_TABLES_DIR, (name) => name.endsWith('.json'))) {
    citekeysFromValue(JSON.parse(readFileSync(file, 'utf-8')), keys);
  }
  return keys;
}

/*
  Mirrors lib/citations.ts's toCitationEntry exactly — the generated file IS that module's
  input now, so the shape has to match what it used to build from the .bib itself.
*/
function toCitationEntry(csl) {
  return {
    id: csl.id,
    type: csl.type,
    title: csl.title,
    authors: (csl.author ?? []).map((author) => ({
      given: author.given,
      family: author.family,
      literal: author.literal,
    })),
    year: csl.issued?.['date-parts']?.[0]?.[0],
    containerTitle: csl['container-title'],
    publisher: csl.publisher,
    doi: csl.DOI,
    url: csl.URL,
  };
}

function buildReferences() {
  let raw;
  try {
    raw = readFileSync(REFERENCES_BIB, 'utf-8');
  } catch (error) {
    fail(`could not read ${REFERENCES_BIB} (gitignored .local/, maintainer-only).`);
  }
  const parsed = new Cite(raw);
  const entries = {};
  for (const csl of parsed.data) entries[csl.id] = toCitationEntry(csl);
  return entries;
}

// ------------------------------------------------------------------ write

/** Stable 2-space JSON with a trailing newline, so regenerating produces reviewable diffs. */
function write(name, data) {
  const file = path.join(OUT_DIR, name);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  const count = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`  wrote ${path.relative(ROOT, file)} (${count} entries)`);
}

const systems = readJsonDir(METHODS_DIR, 'method_analysis').map(distilSystem);
const benchmarks = readJsonDir(EVALS_DIR, 'eval_analysis').map(distilBenchmark);
const allReferences = buildReferences();

const usedCitekeys = new Set([
  ...citekeysFromMdx(),
  ...citekeysFromPaperTables(),
  ...systems.map((r) => r.citekey),
  ...benchmarks.map((r) => r.citekey),
]);

// Every citekey actually used somewhere on the site must resolve, or the page citing it
// would fail the build later with a much less obvious error. Catch it here, at the source.
const unresolved = [...usedCitekeys].filter((key) => !(key in allReferences));
if (unresolved.length > 0) {
  fail(`citekeys with no entry in references.bib: ${unresolved.join(', ')}`);
}

const references = Object.fromEntries(
  Object.entries(allReferences).filter(([id]) => usedCitekeys.has(id)),
);

systems.sort((a, b) => a.name.localeCompare(b.name));
benchmarks.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(OUT_DIR, { recursive: true });
console.log('sync:paper-data');
write('systems.json', systems);
write('benchmarks.json', benchmarks);
write('references.json', references);
console.log(
  `  (${Object.keys(allReferences).length - Object.keys(references).length} unused entries in references.bib dropped)`,
);
console.log('  done — commit these files alongside the .local change that prompted them.\n');
