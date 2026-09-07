// Shared paper identity: title, authors, and "cite as" text. Used anywhere the site
// needs to say who/what the paper is without repeating it — the full-paper header, each
// section page's meta bar, and the sitewide Cite As block (CiteAs.astro) — so a byline
// or citekey change only needs to happen here.
export interface PaperAuthor {
  name: string;
  href: string;
}

export const paperTitle =
  'Open Tabular Insight Extraction: Where Do We Stand, and Where Should We Go?';

export const paperAuthors: PaperAuthor[] = [
  { name: 'Daniel Gomm', href: 'https://www.daniel-gomm.com' },
  {
    name: 'Maarten de Rijke',
    href: 'https://www.uva.nl/en/about-the-uva/organisation/professors/university-professors/maarten-de-rijke.html',
  },
  { name: 'Madelon Hulsebos', href: 'https://www.madelonhulsebos.com/' },
];

// Verbatim from the paper's \begin{abstract}, rendered before Section 1 on the full-paper
// pages (see PaperAbstract.astro) — kept as plain data here, like title/authors, rather
// than mdx content, since it's fixed paper metadata that isn't part of any one section.
export const paperAbstract =
  "Democratizing access to the knowledge held in large corpora of tables such as data lakes " +
  'is emerging as a central research challenge. Research in this space is advancing and ' +
  "broadening in scope, increasingly supplying the components to satisfy a person's insight " +
  'need end-to-end. Yet these efforts remain fragmented across communities that frame the ' +
  'problem under their own conventions, such as table question answering, text-to-SQL, and ' +
  'data analysis agents, with works six times as likely to cite within the same task label ' +
  'as across labels. To bring these communities onto common ground, we establish a holistic ' +
  'framework for this pursuit, which we refer to as Open Tabular Insight Extraction ' +
  '(OpenTI). We formalize OpenTI from first principles around the analytical knowledge a ' +
  'person needs, the procedure for deriving it from a corpus of tables, and how well a ' +
  'result serves the person who sought it. In doing so we consolidate frameworks and ' +
  'terminology across information retrieval, natural language processing, machine ' +
  'learning, databases, and human-computer interaction, and apply this grounding in a ' +
  'systematic review and analysis of systems and benchmarks that work towards OpenTI. ' +
  'We find that current systems do not cover the end-to-end scope of OpenTI, mainly ' +
  'focusing on the analysis itself, and that benchmarks are largely unfit for evaluations ' +
  'in an open setting as inputs presuppose knowledge of tables and validation mechanisms ' +
  'do not match the setup. Finally, we distill a research agenda towards OpenTI systems, ' +
  'evaluation, and interaction paradigms that surface the insights users need.';

// TODO(content): year/venue/url are placeholders until the paper is actually published
// (arXiv) — update alongside paperPdfUrl below.
export const citationKey = 'gomm_open_2026';

export const citationText = `Gomm, D., de Rijke, M., & Hulsebos, M. (2026). ${paperTitle}. Preprint.`;

export const citationBibtex = `@misc{${citationKey},
  title  = {${paperTitle}},
  author = {Gomm, Daniel and de Rijke, Maarten and Hulsebos, Madelon},
  year   = {2026},
  note   = {Preprint},
}`;

// TODO(content): placeholder until the paper is on arXiv — update alongside the citation
// fields above and index.astro's "Read the paper" link.
export const paperPdfUrl = '#';
