// Build-time helpers that turn distilled records into the serializable cell payloads
// RecordTable.svelte renders. Keeping them here (rather than in the two page files) means
// the systems and benchmarks tables share one definition of what a citation cell, a tag
// cell or a pill cell looks like — the island's counterpart to PaperTableCell.astro.
import { getCitation, formatCitationLabel, getCitationHref } from './citations';
import {
  aspectTags,
  CAPABILITY_LABEL,
  DATA_SETTING_VARIANT,
  INSIGHT_TYPE_GROUP,
  INSIGHT_TYPE_LABEL,
  INSIGHT_TYPE_SHORT,
  INSIGHT_GROUP_LABEL,
  SETTING_GLYPH,
  SETTING_LABEL,
  isMissing,
  sortInsightTypes,
  type Capability,
} from './record-vocab';

export interface CiteCell {
  kind: 'cite';
  text?: string;
  marker: string;
  title: string;
  meta: string;
  venue: string;
  href: string;
}

export interface TagsCell {
  kind: 'tags';
  capability: Capability;
  title: string;
  items: string[];
}

export interface SettingCell {
  kind: 'setting';
  glyph: string;
  value?: string;
  /** Full text when `value` had to be shortened to a number; shown on hover. */
  note?: string;
  title: string;
}

export interface PillsCell {
  kind: 'pills';
  items: { label: string; group?: string; bordered?: boolean; title: string }[];
}

export type RecordCell = string | CiteCell | TagsCell | SettingCell | PillsCell;

/**
 * A record's name plus its citation year, rendered as the same `.citation-trigger` markup
 * Citation.astro emits — the site-wide CitationLayer island handles the hover card for it.
 * Resolving the reference here, at build time, keeps references.json off the client.
 */
export function citeCell(citekey: string, text: string): CiteCell {
  const entry = getCitation(citekey);
  const meta = formatCitationLabel(entry);
  return {
    kind: 'cite',
    text,
    marker: `(${entry.year ?? meta})`,
    title: entry.title ?? '',
    meta,
    venue: entry.containerTitle ?? entry.publisher ?? '',
    href: getCitationHref(entry) ?? '',
  };
}

/** One functional capability's aspects, coloured by the capability palette. */
export function capabilityCell(capability: Capability, aspects: string[]): TagsCell {
  return {
    kind: 'tags',
    capability,
    title: CAPABILITY_LABEL[capability],
    items: aspectTags(capability, aspects),
  };
}

/** The data setting, as the paper's 1 / N± / N / ∞ glyph, optionally with a value beside
 *  it (the benchmarks table's "Tbl/Inst." column).
 *
 *  A handful of records qualify that value with prose — "5.1 (derived: 1020 tables / 200
 *  databases; ...)" — which the paper's own table prints as the bare number. The cell does
 *  the same and keeps the qualification as a hover note, so one discursive record can't
 *  stretch the column past every other one. */
export function settingCell(dataSetting: string, value?: string): SettingCell {
  const variant = DATA_SETTING_VARIANT[dataSetting];
  const reported = value && !isMissing(value) ? value.trim() : undefined;
  const leadingNumber = reported?.match(/^-?[\d.,]+/)?.[0];
  const shortened = Boolean(leadingNumber && leadingNumber.length < reported!.length);
  return {
    kind: 'setting',
    glyph: variant ? SETTING_GLYPH[variant] : '?',
    value: shortened ? leadingNumber : reported,
    note: shortened ? reported : undefined,
    title: variant ? SETTING_LABEL[variant] : dataSetting,
  };
}

/** Insight types as the paper's short pills, grouped descriptive/inferential/causal. A
 *  bordered pill marks an instance that requires an artifact rather than an insight — the
 *  same convention as Table 5. */
export function insightTypesCell(
  types: { type: string; requiresArtifact?: boolean }[],
): PillsCell {
  return {
    kind: 'pills',
    items: sortInsightTypes(types).map((t) => {
      const group = INSIGHT_TYPE_GROUP[t.type];
      return {
        label: INSIGHT_TYPE_SHORT[t.type] ?? t.type,
        group,
        bordered: Boolean(t.requiresArtifact),
        title: `${INSIGHT_TYPE_LABEL[t.type] ?? t.type} — ${INSIGHT_GROUP_LABEL[group] ?? 'insight type'}`,
      };
    }),
  };
}

/** Generic pill list for a set of labelled values (validation functions, output
 *  modalities) that carries no capability colour. */
export function pillsCell(items: { label: string; title?: string }[]): PillsCell {
  return {
    kind: 'pills',
    items: items.map((item) => ({ label: item.label, title: item.title ?? item.label })),
  };
}

/**
 * Sort key for the records' count-ish string fields. Several are free-text derivations
 * ("5.1 (derived: 1020 tables / 200 databases)", "avg 2.3"), so this reads the first
 * number in the string; `undefined` for sentinels, which RecordTable sorts last in both
 * directions.
 */
export function numericSortValue(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (isMissing(value)) return undefined;
  const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}
