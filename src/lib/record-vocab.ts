// Display vocabulary for the distilled system/benchmark records.
//
// The records (src/contents/data/*.json) store the paper's coding vocabulary as
// snake_case enum values. This module is the single place that turns those into the
// labels, short tag names and groupings the overview tables show.
//
// Every mapping here was derived by diffing the records against the paper's own
// transcribed tables (src/contents/full_paper/tables/03_capability_overview.json and
// 05_datasets_overview.json) so a record rendered on an overview page is labelled exactly
// as the same record is labelled in the paper. Shared vocabulary — the five-capability
// palette, the data-setting glyphs, the insight-type groups — is imported from
// paper-table-render.ts rather than redefined, for the same reason.
import {
  CAPABILITY_LABEL,
  SETTING_LABEL,
  SETTING_GLYPH,
  INSIGHT_GROUP_LABEL,
  type Capability,
  type SettingVariant,
  type InsightGroup,
} from './paper-table-render';

export {
  CAPABILITY_LABEL,
  SETTING_LABEL,
  SETTING_GLYPH,
  INSIGHT_GROUP_LABEL,
  type Capability,
  type SettingVariant,
  type InsightGroup,
};

/** Shown wherever a record reports nothing, matching the paper's tables. */
export const NOT_REPORTED = '–';

/** Sentinel strings the records use for "the paper doesn't say". */
export function isMissing(value: string | null | undefined): boolean {
  return !value || value === 'not_reported' || value === 'n/a' || value === 'none';
}

/** Generic fallback: `open_corpus` → `Open corpus`. Keeps an unmapped new enum value
 *  readable instead of leaking snake_case onto the page. */
export function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function label<T extends string>(map: Record<string, string>, value: T | null | undefined): string {
  if (!value) return NOT_REPORTED;
  return map[value] ?? humanize(value);
}

// ------------------------------------------------------------ data setting

/** `data_setting` values → the SettingVariant vocabulary the paper's tables render as
 *  glyphs (1 / N± / N / ∞). Verified against all 29 rows of the capability overview. */
export const DATA_SETTING_VARIANT: Record<string, SettingVariant> = {
  single_table: 'single',
  bounded_set: 'set',
  multi_table_provided: 'multi',
  open_corpus: 'open',
};

export const DATA_SETTING_LABEL: Record<string, string> = {
  single_table: 'Single table',
  bounded_set: 'Bounded set',
  multi_table_provided: 'Multi-table provided',
  open_corpus: 'Open corpus',
};

// ----------------------------------------------------------- orchestration

export const ORCHESTRATION_LABEL: Record<string, string> = {
  fixed: 'Fixed',
  plan_based: 'Plan-based',
  reactive: 'Reactive',
  hybrid: 'Hybrid',
};

/** Paper order (§3): design time → invocation time → execution time → combined. */
export const ORCHESTRATION_ORDER = ['fixed', 'plan_based', 'reactive', 'hybrid'];

export const COMPOSITION_PATTERN_LABEL: Record<string, string> = {
  one_shot: 'One-shot',
  incremental: 'Incremental',
  mixed: 'Mixed',
};

export const RETRIEVAL_MECHANISM_LABEL: Record<string, string> = {
  none: NOT_REPORTED,
  embedding: 'Embedding',
  lexical: 'Lexical',
  hybrid: 'Hybrid',
  llm_select: 'LLM selection',
  classifier: 'Classifier',
  late_interaction: 'Late interaction',
  generative: 'Generative',
};

// ------------------------------------------------- capability aspect tags
//
// Short tag labels, matching the paper's Table 3 cells exactly. Two aspects the paper
// drops there for space — `data_preparation` (Prep) and `result_integration` (Integrate) —
// are kept here, since the site's table has room for them. That's additive: no cell
// disagrees with the paper, some carry one tag more.

export const ASPECT_LABEL: Record<Capability, Record<string, string>> = {
  interpretation: {
    decompose: 'Decompose',
    augment: 'Augment',
    scope: 'Scope',
    contextualize: 'Context',
    clarify: 'Clarify',
  },
  // No paper column to match — labels follow §3's retrieval subsection names.
  retrieval: {
    table_and_input_representations: 'Representation',
    retrieval_granularity: 'Granularity',
    semantic_and_structural_alignment: 'Alignment',
    dynamic_retrieval: 'Dynamic',
    generative_retrieval: 'Generative',
  },
  analysis: {
    dsl_generation: 'SQL',
    gpl_generation: 'Python',
    direct_inference: 'Model',
    tool_calling: 'Tool',
    data_preparation: 'Prep',
  },
  output: {
    text_output: 'Text',
    table_output: 'Table',
    visualization_output: 'Chart',
    contextualization: 'Context',
    modality_selection: 'Modality select',
    result_integration: 'Integrate',
  },
  governance: {
    error_handling: 'Error handling',
    result_validation: 'Validation',
    ensembling: 'Ensembling',
    adaptive_steering: 'Adaptive steering',
  },
};

/** Stable within-cell tag order, so two systems with the same aspects render identically
 *  (the records' own array order reflects authoring order, not meaning). */
const ASPECT_ORDER: Record<Capability, string[]> = Object.fromEntries(
  Object.entries(ASPECT_LABEL).map(([cap, map]) => [cap, Object.keys(map)]),
) as Record<Capability, string[]>;

export function sortAspects(capability: Capability, aspects: string[]): string[] {
  const order = ASPECT_ORDER[capability];
  return [...aspects].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}

export function aspectTags(capability: Capability, aspects: string[]): string[] {
  return sortAspects(capability, aspects).map((a) => ASPECT_LABEL[capability][a] ?? humanize(a));
}

export const COVERAGE_LABEL: Record<string, string> = {
  covered: 'Covered',
  partial: 'Partial',
  not_covered: 'Not covered',
};

// ------------------------------------------------------------ insight types
//
// The pill vocabulary from the paper's Table 5 caption: "Look - Lookup, Agg - Aggregation,
// Char - Characterization, Asso - Association, Grp - Grouping, SI - Statistical Inference,
// Pred - Prediction, Int - Interventional, CF - Counterfactual", grouped into the
// descriptive / inferential / causal tiers of the taxonomy in §2.

export const INSIGHT_TYPE_SHORT: Record<string, string> = {
  lookup: 'Look',
  aggregation: 'Agg',
  characterization: 'Char',
  association: 'Asso',
  grouping: 'Grp',
  statistical_inference: 'SI',
  prediction: 'Pred',
  interventional: 'Int',
  counterfactual: 'CF',
};

export const INSIGHT_TYPE_LABEL: Record<string, string> = {
  lookup: 'Lookup',
  aggregation: 'Aggregation',
  characterization: 'Characterization',
  association: 'Association',
  grouping: 'Grouping',
  statistical_inference: 'Statistical inference',
  prediction: 'Prediction',
  interventional: 'Interventional',
  counterfactual: 'Counterfactual',
};

export const INSIGHT_TYPE_GROUP: Record<string, InsightGroup> = {
  lookup: 'descriptive',
  aggregation: 'descriptive',
  characterization: 'descriptive',
  association: 'descriptive',
  grouping: 'descriptive',
  statistical_inference: 'inferential',
  prediction: 'inferential',
  interventional: 'causal',
  counterfactual: 'causal',
};

/** Taxonomy order (§2), so pills read descriptive → inferential → causal everywhere. */
export const INSIGHT_TYPE_ORDER = Object.keys(INSIGHT_TYPE_SHORT);

export function sortInsightTypes<T extends { type: string }>(types: T[]): T[] {
  return [...types].sort(
    (a, b) => INSIGHT_TYPE_ORDER.indexOf(a.type) - INSIGHT_TYPE_ORDER.indexOf(b.type),
  );
}

// --------------------------------------------------------- benchmark fields

export const CORPUS_FORMAT_LABEL: Record<string, string> = {
  relational_databases: 'Relational DBs',
  standalone_files: 'Standalone files',
  web_tables: 'Web tables',
  markup_tables: 'Markup tables',
  data_lake: 'Data lake',
  mixed: 'Mixed',
  not_reported: NOT_REPORTED,
};

/** Table 5's "Curation" column. */
export const ASSEMBLY_LABEL: Record<string, string> = {
  manual: 'Manual',
  synthetic: 'Synthetic',
  mixed: 'Mixed',
  not_reported: NOT_REPORTED,
};

export const MESSINESS_LABEL: Record<string, string> = {
  cleaned: 'Cleaned',
  retained: 'Retained',
  synthetic_clean: 'Synthetic clean',
  not_reported: NOT_REPORTED,
};

export const INPUT_PROTOCOL_LABEL: Record<string, string> = {
  static_single: 'Static, single',
  static_multi_turn: 'Static, multi-turn',
  user_simulation: 'User simulation',
};

// Shared by benchmarks' input protocol (interaction.target_modes) and systems' input
// modes (interaction.modes) — the same taxonomy of how an insight need reaches a system,
// except systems additionally report `output_driven` (steering off intermediate output),
// which benchmarks don't code as a target mode.
export const INTERACTION_MODE_LABEL: Record<string, string> = {
  single_input: 'Single input',
  step_wise: 'Step-wise',
  system_initiated_clarification: 'System clarification',
  iterative_elicitation: 'Iterative elicitation',
  output_driven: 'Output-driven',
};

export const INTERACTION_MODE_ORDER = Object.keys(INTERACTION_MODE_LABEL);

/** §5's validation-function taxonomy. */
export const VALIDATION_FUNCTION_LABEL: Record<string, string> = {
  exact_matching: 'Exact match',
  structural_matching: 'Structural match',
  similarity_matching: 'Similarity',
  program_comparison: 'Program comparison',
  programmatic_validation: 'Programmatic',
  component_validation: 'Component',
  llm_as_judge: 'LLM-as-judge',
  human_evaluation: 'Human',
};

export const VALIDATION_FUNCTION_ORDER = Object.keys(VALIDATION_FUNCTION_LABEL);

export function sortValidationFunctions(functions: string[]): string[] {
  return [...functions].sort(
    (a, b) => VALIDATION_FUNCTION_ORDER.indexOf(a) - VALIDATION_FUNCTION_ORDER.indexOf(b),
  );
}

export const OUTPUT_MODALITY_LABEL: Record<string, string> = {
  value: 'Value',
  text: 'Text',
  table: 'Table',
  list: 'List',
  chart: 'Chart',
};

export const OUTPUT_MODALITY_ORDER = Object.keys(OUTPUT_MODALITY_LABEL);

export const REALIZATION_ARTIFACT_LABEL: Record<string, string> = {
  sql: 'SQL',
  python: 'Python',
  pipeline: 'Pipeline',
  none: NOT_REPORTED,
};

export const PAPER_TYPE_LABEL: Record<string, string> = {
  dataset_or_benchmark: 'Benchmark paper',
  system_with_new_dataset: 'System with new dataset',
};

/**
 * Thousands separators for the record's numeric-ish strings (`num_tables`,
 * `num_instances`), which are plain strings because they can also be `not_reported` or a
 * derivation note. Non-numeric values pass through untouched.
 */
export function formatCount(value: string | null | undefined): string {
  if (isMissing(value)) return NOT_REPORTED;
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : (value as string);
}
