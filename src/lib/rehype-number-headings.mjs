// Rehype plugin: injects stable anchor ids into rendered headings (h2-h6)
// site-wide, plus hierarchical section numbers for full-paper content
// specifically (files carrying a numeric `order` frontmatter field). Concept
// pages and other markdown/mdx without `order` still get anchored, unnumbered
// headings — needed for in-page nav (scrollspy, sticky section nav) and
// cross-linking, just without the paper's X.Y.Z numbering.
//
// This recomputes numbers with the exact same stateful algorithm used by
// paper-structure.ts (src/lib/paper-numbering.ts) so the visually rendered
// number always matches what PaperRef/PaperNav report — the two passes never
// share state directly (this runs per-file inside Astro/Vite's markdown
// compile step; paper-structure.ts runs a separate static scan), so keeping
// the numbering logic itself identical is what keeps them in sync.
import { visit } from 'unist-util-visit';
import { createAnchorer, createHeadingNumberer, slugify } from './paper-numbering';

// One anchorer per build, shared across all files compiled in this process,
// so ids stay unique across the whole paper (matches paper-structure.ts,
// which also anchors across all files with a single shared instance).
const anchorer = createAnchorer();

function headingText(node) {
  let text = '';
  visit(node, 'text', (textNode) => {
    text += textNode.value;
  });
  return text;
}

export default function rehypeNumberHeadings() {
  return (tree, file) => {
    const frontmatter = file.data?.astro?.frontmatter ?? {};
    const isNumberedPaperContent = typeof frontmatter.order === 'number';

    const appendix = frontmatter.appendix === true;
    const numberer = isNumberedPaperContent
      ? createHeadingNumberer({
          sectionNumber: appendix ? undefined : String(frontmatter.order),
          appendix,
        })
      : null;

    visit(tree, 'element', (node) => {
      const match = /^h([2-6])$/.exec(node.tagName);
      if (!match) return;

      // Skip the "sr-only" heading GFM footnotes sections auto-generate
      // (id="footnotes"/"footnotes-N") — not real paper content.
      const className = node.properties?.className ?? [];
      if (Array.isArray(className) && className.includes('sr-only')) return;

      const depth = Number(match[1]);
      const text = headingText(node).replace(/\.$/, '');

      // Outside numbered paper content (concept pages, etc.), every heading
      // just gets a stable anchor id — no number, no run-in demotion, since
      // the X.Y.Z hierarchy depth limit is a paper-specific concern.
      if (!numberer) {
        node.properties = node.properties ?? {};
        node.properties.id = anchorer(text || slugify(String(depth)));
        return;
      }

      const number = numberer(depth);

      // Deeper than MAX_HEADING_LEVEL: a run-in bold paragraph label, not a
      // numbered/navigable section (see paper-numbering.ts). Leave it
      // unnumbered/un-anchored and mark it for the run-in styling instead.
      if (number === null) {
        node.properties = node.properties ?? {};
        const existing = Array.isArray(node.properties.className) ? node.properties.className : [];
        node.properties.className = [...existing, 'heading-runin'];
        return;
      }

      const anchor = anchorer(text || slugify(String(depth)));

      node.properties = node.properties ?? {};
      node.properties.id = anchor;

      node.children = [
        {
          type: 'element',
          tagName: 'span',
          properties: { className: ['heading-number'] },
          children: [{ type: 'text', value: number }],
        },
        { type: 'text', value: ' ' },
        ...node.children,
      ];
    });
  };
}
