// Build-time index of the full paper's structure: sections, headings, and
// captioned artifacts (figures/tables/definitions), parsed directly from the
// raw .mdx source in src/contents/full_paper/. Mirrors citations.ts's pattern
// of a synchronous, memoized, source-of-truth parse rather than a generated
// intermediate file.
//
// This is a plain regex scan over the raw markdown/frontmatter rather than a
// full remark/MDX AST parse. That's sufficient here because headings are
// always ATX (`#`...`######`) and the only JSX read by this scanner is a
// handful of self-describing tags: `title="..."` on <Figure>/<Table>/
// <Definition>, and `name="..."` on <Label/> — see those components for the
// authoring contract this scanner assumes.
//
// Two cross-reference mechanisms are built here, both resolved by this same
// scan:
//   - getPaperRef(title, kind?) — looks up by the *rendered title text* of a
//     section/heading/figure/table/definition (what PaperRef.astro uses).
//     Convenient for referencing content that already has a natural title,
//     but brittle: renaming a heading silently breaks anything referencing it
//     by that old text, and a title shared across kinds needs a `kind` hint.
//   - getPaperLabel(name) — LaTeX-style: <Label name="sec:x"/> is placed
//     inside/right after whatever it labels (a heading, or nested in a
//     <Figure>/<Table>/<Definition>), and <Ref name="sec:x"/> looks it up by
//     that stable, author-chosen name instead of by title. Label names are
//     unique across the whole paper by construction, so this never needs
//     kind disambiguation and survives title edits. Prefer this for anything
//     freshly authored; getPaperRef exists mainly because the paper's prose
//     already had plain-text "Section 'X'" references using titles before
//     Label/Ref existed.
//
// Numbers/anchors are computed with the exact same logic used to render them
// (paper-numbering.ts), and independently of render order, so both PaperRef
// and Ref can point forward to content defined later in the paper.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createAnchorer, createHeadingNumberer, normalizeTitle } from './paper-numbering';

const CONTENT_DIR = path.resolve(process.cwd(), 'src/contents/full_paper');

export type RefKind = 'section' | 'appendix' | 'figure' | 'table' | 'definition';

export interface RefEntry {
  kind: RefKind;
  number: string;
  title: string;
  anchor: string;
  // The slug of the section file this entry's anchor is rendered on
  // (src/pages/full-paper/[slug].astro) — needed because RefLink must link
  // across pages when a ref's target lives on a different section's page.
  sectionSlug: string;
}

export interface HeadingNode {
  depth: number;
  title: string;
  number: string;
  anchor: string;
  children: HeadingNode[];
}

export interface PaperSection {
  id: string;
  slug: string;
  title: string;
  number: string;
  order: number;
  appendix: boolean;
  // One-line summary for the landing page's section nav (index.astro) — authored in each
  // file's own frontmatter alongside title/order/slug, like any other section content, so
  // it lives with the section it describes rather than in a separate lookup table.
  description: string;
  headings: HeadingNode[];
}

interface ParsedFrontmatter {
  title: string;
  order: number;
  slug: string;
  appendix: boolean;
  description: string;
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  const fields: Record<string, string> = {};
  if (match) {
    for (const line of match[1].split('\n')) {
      const fieldMatch = line.match(/^(\w+):\s*(.*)$/);
      if (!fieldMatch) continue;
      fields[fieldMatch[1]] = fieldMatch[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }
  return {
    title: fields.title ?? '',
    order: Number(fields.order ?? 0),
    slug: fields.slug ?? '',
    appendix: fields.appendix === 'true',
    description: fields.description ?? '',
  };
}

/** Strips the leading frontmatter block, returning only the mdx body. */
function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

const HEADING_RE = /^(#{2,6})\s+(.+)$/gm;
// Definition is authored with a short `title="..."` (registered by title text,
// resolved via getPaperRef/PaperRef). Figure/Table are authored with a stable
// `name="..."` instead — there's no short caption text to key on, only a full
// descriptive caption as children — so they register directly as a label
// (resolved via getPaperLabel/Ref), the same as an explicit <Label/>.
const TITLE_ARTIFACT_RE = /<(Figure|Table|Definition)\b[^>]*\btitle="([^"]+)"/g;
const NAME_ARTIFACT_RE = /<(Figure|Table)\b[^>]*\bname="([^"]+)"/g;
// A <Subfigure name="..."> nested inside a <Figure> (see Subfigure.astro) — lettered a, b, c…
// in document order within its parent and sharing the parent figure's number (e.g. "1a"),
// mirroring LaTeX's \begin{subfigure}. Registered as its own label, like Figure/Table.
const SUBFIGURE_NAME_RE = /<Subfigure\b[^>]*\bname="([^"]+)"/g;
const LABEL_RE = /<Label\s+name="([^"]+)"\s*\/?>/g;

// LaTeX-style label prefix convention (sec:/app:/fig:/tab:/def:) — purely a
// sanity check (see below), not an enforced grammar: a label is free to omit
// or use a different prefix, this just warns when a chosen prefix disagrees
// with what the label actually resolved to, which usually means it landed on
// the wrong heading/artifact.
const LABEL_PREFIX_KIND: Record<string, RefKind> = {
  sec: 'section',
  app: 'appendix',
  fig: 'figure',
  tab: 'table',
  def: 'definition',
};

let cache:
  | { key: string; sections: PaperSection[]; refs: Map<string, RefEntry>; labels: Map<string, RefEntry> }
  | undefined;

function build(): { sections: PaperSection[]; refs: Map<string, RefEntry>; labels: Map<string, RefEntry> } {
  const files = readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.mdx'))
    .sort();

  // Cache-keyed on each file's mtime, not cached unconditionally: this scan
  // reads .mdx content via readFileSync rather than a Vite-tracked import, so
  // Astro's dev server has no way to know this module's cached output depends
  // on those files and won't invalidate it on edit. Without this check, live
  // editing content under `astro dev` would leave the nav/PaperRef/Ref data
  // silently stale relative to what's actually rendered (e.g. a heading
  // that's since moved would still show its old anchor in the nav) — the
  // build() result must always reflect the files as they currently are.
  const key = files.map((f) => `${f}:${statSync(path.join(CONTENT_DIR, f)).mtimeMs}`).join('|');
  if (cache && cache.key === key) return cache;

  const refs = new Map<string, RefEntry>();
  const labels = new Map<string, RefEntry>();
  const sections: PaperSection[] = [];
  const anchorer = createAnchorer();
  const artifactCounters: Record<string, number> = { figure: 0, table: 0, definition: 0 };

  // Keyed by kind+title, not title alone: a figure/table/definition legitimately
  // shares its title with the section that contains it (e.g. the "Data
  // Sufficiency" formal definition sits inside the "Data Sufficiency" heading),
  // and the paper's prose already disambiguates these as "Definition ‘X’" vs
  // "Section ‘X’". getPaperRef() below requires a `kind` hint to resolve such
  // cases rather than silently picking one.
  function register(entry: RefEntry) {
    const key = `${entry.kind}:${normalizeTitle(entry.title)}`;
    if (refs.has(key)) {
      // Generic subsection titles (e.g. "Contextualization") legitimately recur
      // across independent top-level sections. That's only a problem if a
      // <PaperRef> actually resolves it, so this warns rather than failing the
      // build; first occurrence (document order) wins the lookup key.
      console.warn(
        `[paper-structure] Ambiguous ${entry.kind} title "${entry.title}" (appears more than ` +
          'once) — PaperRef would resolve to the first occurrence. Give one of them a distinct title.',
      );
      return;
    }
    refs.set(key, entry);
  }

  for (const file of files) {
    const raw = readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const fm = parseFrontmatter(raw);
    const body = stripFrontmatter(raw);

    const numberer = createHeadingNumberer({
      sectionNumber: fm.appendix ? undefined : String(fm.order),
      appendix: fm.appendix,
    });

    const headings: HeadingNode[] = [];
    const stack: HeadingNode[] = [];

    // Position-tracked alongside the tree/registry above, purely to resolve
    // <Label name="..."/> tags below to "whichever heading/artifact this label
    // sits inside or immediately after" — the same positional convention
    // LaTeX's \label uses relative to the nearest \section/\caption.
    const headingPositions: { pos: number; entry: RefEntry }[] = [];
    const artifactRanges: { start: number; end: number; entry: RefEntry }[] = [];

    // A file's own title occasionally recurs verbatim as one of its
    // subsection headings (e.g. file 02 has a "#### Open Tabular Insight
    // Extraction" heading). In that case the heading is the more precise
    // referenceable target, so it wins and the synthesized whole-section
    // entry below is skipped rather than raising a duplicate-title error.
    let titleShadowedByHeading = false;

    for (const match of body.matchAll(HEADING_RE)) {
      const depth = match[1].length;
      const title = normalizeArtifactOrHeadingTitle(match[2]);
      const number = numberer(depth);

      // Deeper than MAX_HEADING_LEVEL: a run-in bold paragraph label, not a
      // numbered/navigable section — excluded from the tree and the PaperRef
      // registry entirely (mirrors rehype-number-headings.mjs).
      if (number === null) continue;

      const anchor = anchorer(title);
      const node: HeadingNode = { depth, title, number, anchor, children: [] };
      const entry: RefEntry = {
        kind: fm.appendix ? 'appendix' : 'section',
        number,
        title,
        anchor,
        sectionSlug: fm.slug,
      };
      headingPositions.push({ pos: match.index ?? 0, entry });

      if (!fm.appendix && normalizeTitle(title) === normalizeTitle(fm.title)) {
        titleShadowedByHeading = true;
      }

      register(entry);

      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      if (stack.length === 0) headings.push(node);
      else stack[stack.length - 1].children.push(node);
      stack.push(node);
    }

    // Only the top-level, non-appendix section title is synthesized (it isn't
    // otherwise repeated as a body heading — see index.astro); appendix files
    // render their own top-level "##" headings for each lettered appendix instead.
    // Either way this is the fallback target for a <Label/> placed before any
    // heading in the file (mirroring \label right after \section{...}).
    const fileLevelEntry: RefEntry | undefined = fm.appendix
      ? undefined
      : { kind: 'section', number: String(fm.order), title: fm.title, anchor: fm.slug, sectionSlug: fm.slug };
    if (fileLevelEntry && !titleShadowedByHeading) {
      register(fileLevelEntry);
    }

    function registerArtifact(tag: string, matchIndex: number, entry: RefEntry, byName: boolean) {
      if (byName) {
        if (labels.has(entry.title)) {
          throw new Error(
            `Duplicate name="${entry.title}" on <${tag}>: names must be unique across the whole ` +
              'paper, like a LaTeX \\label.',
          );
        }
        labels.set(entry.title, entry);
      } else {
        register(entry);
      }

      const closeIndex = body.indexOf(`</${tag}>`, matchIndex);
      artifactRanges.push({ start: matchIndex, end: closeIndex === -1 ? matchIndex : closeIndex, entry });
    }

    for (const match of body.matchAll(TITLE_ARTIFACT_RE)) {
      const kind = match[1].toLowerCase() as 'figure' | 'table' | 'definition';
      const title = match[2];
      artifactCounters[kind] += 1;
      const entry: RefEntry = {
        kind,
        number: String(artifactCounters[kind]),
        title,
        anchor: anchorer(title),
        sectionSlug: fm.slug,
      };
      registerArtifact(match[1], match.index ?? 0, entry, false);
    }

    for (const match of body.matchAll(NAME_ARTIFACT_RE)) {
      const kind = match[1].toLowerCase() as 'figure' | 'table';
      const name = match[2];
      artifactCounters[kind] += 1;
      // No short caption text to key on (only a full descriptive caption as
      // children) — `title` here is just the name, used as a fallback tooltip.
      const entry: RefEntry = {
        kind,
        number: String(artifactCounters[kind]),
        title: name,
        anchor: anchorer(name),
        sectionSlug: fm.slug,
      };
      registerArtifact(match[1], match.index ?? 0, entry, true);
    }

    const figureRanges = artifactRanges.filter((range) => range.entry.kind === 'figure');
    const subfigureLetterCounts = new Map<string, number>();
    for (const match of body.matchAll(SUBFIGURE_NAME_RE)) {
      const name = match[1];
      const pos = match.index ?? 0;
      const parent = figureRanges.find((range) => pos >= range.start && pos <= range.end);
      if (!parent) {
        throw new Error(`<Subfigure name="${name}" /> in ${file} is not nested inside a <Figure>.`);
      }
      if (labels.has(name)) {
        throw new Error(
          `Duplicate name="${name}" on <Subfigure>: names must be unique across the whole paper, ` +
            'like a LaTeX \\label.',
        );
      }
      const count = (subfigureLetterCounts.get(parent.entry.anchor) ?? 0) + 1;
      subfigureLetterCounts.set(parent.entry.anchor, count);
      const letter = String.fromCharCode('a'.charCodeAt(0) + count - 1);
      labels.set(name, {
        kind: 'figure',
        number: `${parent.entry.number}${letter}`,
        title: name,
        anchor: anchorer(name),
        sectionSlug: fm.slug,
      });
    }

    artifactRanges.sort((a, b) => a.start - b.start);

    for (const match of body.matchAll(LABEL_RE)) {
      const name = match[1];
      const pos = match.index ?? 0;

      const containingArtifact = artifactRanges
        .filter((range) => pos >= range.start && pos <= range.end)
        .sort((a, b) => a.end - a.start - (b.end - b.start))[0];

      // Authors place <Label/> either right after the thing it labels (a
      // heading) or right before it (a <Figure>/<Table>/<Definition> that
      // starts on the next line) — mirroring how a LaTeX \label sits inside
      // \section{...} or a table/figure environment, but as a plain sibling
      // tag here rather than nested. Absent a containing artifact, whichever
      // of "nearest preceding heading" or "nearest following artifact" is
      // textually closer to the label is almost always the intended target.
      //
      // The file-level entry counts as a candidate anchored at position 0 (the
      // top of the file), not as a distance-less fallback — otherwise a label
      // before the first heading would have an infinite preceding-distance and
      // any later artifact in the file, however far away, would "win" by
      // default instead of correctly resolving to the file's own section.
      const precedingHeading = [
        ...(fileLevelEntry ? [{ pos: 0, entry: fileLevelEntry }] : []),
        ...headingPositions,
      ]
        .filter((h) => h.pos <= pos)
        .sort((a, b) => b.pos - a.pos)[0];
      const followingArtifact = artifactRanges.find((range) => range.start > pos);

      const precedingDistance = precedingHeading ? pos - precedingHeading.pos : Infinity;
      const followingDistance = followingArtifact ? followingArtifact.start - pos : Infinity;

      const entry =
        containingArtifact?.entry ??
        (followingDistance < precedingDistance ? followingArtifact?.entry : precedingHeading?.entry);

      if (!entry) {
        throw new Error(
          `<Label name="${name}" /> in ${file} has nothing to attach to — it appears before any ` +
            'heading and this is an appendix file, which has no whole-file fallback target.',
        );
      }

      if (labels.has(name)) {
        throw new Error(
          `Duplicate <Label name="${name}" />: label names must be unique across the whole paper ` +
            '(like LaTeX \\label), unlike PaperRef title lookups which may warn-and-shadow.',
        );
      }

      const prefix = name.split(':')[0];
      const expectedKind = LABEL_PREFIX_KIND[prefix];
      if (expectedKind && expectedKind !== entry.kind) {
        console.warn(
          `[paper-structure] <Label name="${name}" /> resolved to a ${entry.kind} ("${entry.title}"), ` +
            `but its "${prefix}:" prefix suggests ${expectedKind} — check it's placed where you meant.`,
        );
      }

      labels.set(name, entry);
    }

    sections.push({
      id: fm.slug,
      slug: fm.slug,
      title: fm.title,
      number: fm.appendix ? '' : String(fm.order),
      order: fm.order,
      appendix: fm.appendix,
      description: fm.description,
      headings,
    });
  }

  sections.sort((a, b) => a.order - b.order);
  cache = { key, sections, refs, labels };
  return cache;
}

/** Strips markdown emphasis markers and a trailing period from a heading match. */
function normalizeArtifactOrHeadingTitle(text: string): string {
  return text.replace(/\*\*|\*|_/g, '').trim().replace(/\.$/, '');
}

export function getPaperSections(): PaperSection[] {
  return build().sections;
}

/**
 * Resolves a title to its registered section/appendix/figure/table/definition
 * entry. Pass `kind` when the title could plausibly belong to more than one
 * (e.g. a definition boxed inside the section of the same name) — without it,
 * an ambiguous title fails the build rather than silently picking one.
 */
export function getPaperRef(title: string, kind?: RefKind): RefEntry {
  const { refs } = build();
  const normalized = normalizeTitle(title);

  if (kind) {
    const entry = refs.get(`${kind}:${normalized}`);
    if (!entry) {
      throw new Error(`Unknown paper reference "${title}" (kind: ${kind}) — no matching entry.`);
    }
    return entry;
  }

  const matches = [...refs.entries()]
    .filter(([key]) => key.endsWith(`:${normalized}`))
    .map(([, entry]) => entry);

  if (matches.length === 0) {
    throw new Error(
      `Unknown paper reference "${title}" — no matching section, heading, figure, table, or ` +
        'definition title. PaperRef looks up entries by exact (normalized) title text.',
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous paper reference "${title}" — matches ${matches.map((m) => m.kind).join(', ')}. ` +
        'Pass a `kind` to <PaperRef> (or to getPaperRef) to disambiguate.',
    );
  }
  return matches[0];
}

/**
 * Resolves a `<Label name="..."/>` to whatever it's attached to — LaTeX-style
 * stable-identifier lookup, as opposed to getPaperRef's title-text lookup.
 * Label names are unique by construction (build fails on a duplicate when the
 * label is registered, see build() above), so unlike getPaperRef this never
 * needs a `kind` hint to disambiguate.
 */
export function getPaperLabel(name: string): RefEntry {
  const entry = build().labels.get(name);
  if (!entry) {
    throw new Error(`Unknown paper label "${name}" — no <Label name="${name}" /> found in the paper.`);
  }
  return entry;
}
