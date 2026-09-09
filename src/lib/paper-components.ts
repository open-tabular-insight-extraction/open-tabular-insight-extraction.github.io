// Maps each paper section's `slug` (frontmatter field, also used by getPaperSections()
// in paper-structure.ts) to its compiled .mdx component. Used by full-paper/[slug].astro
// (renders one section per page), so the mapping only needs updating in one place when a
// section file is added/renamed.
import Introduction from '../contents/full_paper/01-introduction.mdx';
import OpenTI from '../contents/full_paper/02-open-tabular-insight-extraction.mdx';
import Systems from '../contents/full_paper/03-anatomy-of-openti-systems.mdx';
import Interaction from '../contents/full_paper/04-interaction-and-interpretability-in-openti.mdx';
import Evaluation from '../contents/full_paper/05-evaluations-in-openti.mdx';
import ResearchAgenda from '../contents/full_paper/06-a-research-agenda-for-openti.mdx';
import Conclusion from '../contents/full_paper/07-conclusion.mdx';
import Appendix from '../contents/full_paper/08-appendix.mdx';

export const componentsBySlug: Record<string, any> = {
  introduction: Introduction,
  'open-tabular-insight-extraction': OpenTI,
  'anatomy-of-openti-systems': Systems,
  'interaction-and-interpretability-in-openti': Interaction,
  'evaluations-in-openti': Evaluation,
  'a-research-agenda-for-openti': ResearchAgenda,
  conclusion: Conclusion,
  appendix: Appendix,
};
