// Cell-level rendering helpers shared by PaperTable.astro. Table content lives in plain
// JSON (see src/lib/paper-tables.ts), so — unlike prose in .mdx — it never passes through
// remark-math/rehype-katex. `renderMathText` re-implements just the inline-math slice of
// that pipeline (KaTeX's own renderToString) so `$i_d$`-style notation in transcribed table
// cells still typesets, without pulling remark/rehype into a non-markdown code path.
import katex from 'katex';

const MATH_RE = /\$([^$]+)\$/g;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapes plain text and renders a lone `**bold**` span some transcribed cells use to
 * mark aggregate/summary rows — deliberately not full markdown, just this one escape hatch. */
function renderPlainSegment(segment: string): string {
  return escapeHtml(segment).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** Escapes plain text, typesetting any `$...$` inline-math spans with KaTeX. */
export function renderMathText(text: string): string {
  let result = '';
  let lastIndex = 0;
  for (const match of text.matchAll(MATH_RE)) {
    const index = match.index ?? 0;
    result += renderPlainSegment(text.slice(lastIndex, index));
    result += katex.renderToString(match[1], { throwOnError: false, output: 'html' });
    lastIndex = index + match[0].length;
  }
  result += renderPlainSegment(text.slice(lastIndex));
  return result;
}

// Capability columns share the site's five-color categorical palette (see
// .local/03_visual_identity.md) so a tag's color always identifies which functional
// capability it belongs to, consistently with how that palette is used elsewhere on the site.
export type Capability = 'interpretation' | 'retrieval' | 'analysis' | 'output' | 'governance';

export const CAPABILITY_LABEL: Record<Capability, string> = {
  interpretation: 'Interpretation',
  retrieval: 'Data retrieval',
  analysis: 'Analytical composition and execution',
  output: 'Output synthesis',
  governance: 'Process governance',
};

export type SettingVariant = 'single' | 'set' | 'multi' | 'open';

export const SETTING_LABEL: Record<SettingVariant, string> = {
  single: 'Single table provided',
  set: 'Limited set of relevant and irrelevant tables provided',
  multi: 'Set of necessary tables provided',
  open: 'Open setting — retrieval required',
};

export const SETTING_GLYPH: Record<SettingVariant, string> = {
  single: '1',
  set: 'N±',
  multi: 'N',
  open: '∞',
};

export type InsightGroup = 'descriptive' | 'inferential' | 'causal';

export const INSIGHT_GROUP_LABEL: Record<InsightGroup, string> = {
  descriptive: 'Descriptive insight type',
  inferential: 'Inferential insight type',
  causal: 'Causal insight type',
};

export type PaperTableCell =
  | string
  | { kind: 'cite'; citekey: string; text?: string }
  | { kind: 'tags'; capability: Capability; items: string[] }
  | { kind: 'setting'; variant: SettingVariant; value?: string; note?: string }
  | { kind: 'pills'; items: { label: string; group: InsightGroup; bordered?: boolean }[] }
  | { kind: 'mark'; value: 'none' | 'partial' | 'full' }
  | { kind: 'scope'; segments: boolean[] };

export const MARK_GLYPH: Record<'none' | 'partial' | 'full', string> = {
  none: '−', // −
  partial: '○', // ○
  full: '●', // ●
};

export const MARK_LABEL: Record<'none' | 'partial' | 'full', string> = {
  none: 'Not addressed',
  partial: 'Partially addressed or acknowledged for future work',
  full: 'Foregrounded as a central part of the work',
};

// Five-segment end-to-end scope bar used by the related-surveys comparison table.
export const SCOPE_SEGMENTS = ['UI', 'R', 'DI', 'DA', 'O'] as const;
export const SCOPE_SEGMENT_LABEL: Record<(typeof SCOPE_SEGMENTS)[number], string> = {
  UI: 'User Interaction',
  R: 'Table Retrieval',
  DI: 'Data Integration',
  DA: 'Data Analysis',
  O: 'Output Presentation',
};
