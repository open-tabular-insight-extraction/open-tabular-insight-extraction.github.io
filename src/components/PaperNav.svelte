<script>
  import { onMount } from 'svelte';
  import PaperNavHeadingList from './PaperNavHeadingList.svelte';

  // `sections` comes from getPaperSections() (see paper-structure.ts): each
  // entry carries { id, slug, title, number, appendix, headings } where
  // `headings` is the nested h3/h4/h5 (or h2/h3 for the lettered appendix)
  // tree already numbered to match the rendered page.
  export let sections = [];

  // Set only on a per-section page (full-paper/[slug].astro). When set, every
  // section row other than the current one renders as a real link to that
  // section's own page instead of an in-page scroll button — its headings
  // aren't in this page's DOM, so there's nothing here to scroll-spy or
  // scroll to. The current section keeps the original scroll-button +
  // nested-heading-tree + scroll-spy behavior, just scoped to its own
  // headings (the only ones actually present in the DOM on that page).
  export let currentSlug = undefined;
  export let basePath = '';

  let activeAnchor = currentSlug ?? sections[0]?.slug ?? '';
  let observer;

  function flattenAnchors(section) {
    const anchors = [];
    if (!section.appendix) anchors.push(section.slug);
    const walk = (nodes) => {
      for (const node of nodes) {
        anchors.push(node.anchor);
        walk(node.children);
      }
    };
    walk(section.headings);
    return anchors;
  }

  // Ancestor chain (root to active leaf) within one section's heading tree,
  // used both to decide which nested lists are expanded and which entry is
  // highlighted — the "always expand to the in-focus subsection" behavior.
  //
  // `anchor` is threaded through as an explicit parameter (rather than closing
  // over `activeAnchor`) because Svelte's `$:` dependency tracking below is
  // purely syntactic: it only re-runs a reactive statement when a reactive
  // variable is referenced as a literal identifier *within that statement's
  // own source line*. `activeAnchor` doesn't appear there if it's buried
  // inside a separately-declared function body, so without this parameter
  // the nav tree would compute once and never update as the user scrolls.
  function findPath(section, anchor) {
    if (!section.appendix && section.slug === anchor) return [section.slug];

    const root = section.appendix ? [] : [section.slug];

    function walk(nodes, acc) {
      for (const node of nodes) {
        const nextAcc = [...acc, node.anchor];
        if (node.anchor === anchor) return nextAcc;
        const found = walk(node.children, nextAcc);
        if (found) return found;
      }
      return null;
    }

    return walk(section.headings, root) ?? [];
  }

  $: activePaths = sections.map((section) => ({ id: section.id, path: findPath(section, activeAnchor) }));

  function scrollToAnchor(id) {
    const element = document.getElementById(id);
    if (element) {
      const navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height') || '176');
      const offsetTop = element.getBoundingClientRect().top + window.scrollY - navHeight - 16;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  }

  onMount(() => {
    const navHeightStr = getComputedStyle(document.documentElement).getPropertyValue('--nav-height') || '176px';
    const navHeightPx = parseInt(navHeightStr);
    const options = {
      root: null,
      rootMargin: `-${navHeightPx}px 0px -66% 0px`,
      threshold: 0,
    };

    const allAnchors = sections.flatMap(flattenAnchors);
    const anchorOrder = new Map(allAnchors.map((id, index) => [id, index]));
    const visible = new Set();

    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      if (visible.size > 0) {
        // Among everything currently on screen, the deepest-in-document one
        // is the most specific "current position" — pick that as active.
        const sorted = [...visible].sort((a, b) => (anchorOrder.get(a) ?? 0) - (anchorOrder.get(b) ?? 0));
        activeAnchor = sorted[sorted.length - 1];
      }
    }, options);

    for (const id of allAnchors) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }

    return () => observer?.disconnect();
  });
</script>

<nav class="paper-nav" aria-label="Paper sections">
  <h2 class="paper-nav__title">Sections</h2>
  <ul class="paper-nav__list">
    {#each sections as section (section.id)}
      {@const path = activePaths.find((entry) => entry.id === section.id)?.path ?? []}
      {@const sectionActive = !section.appendix && activeAnchor === section.slug}
      {@const isOtherPage = currentSlug !== undefined && section.slug !== currentSlug}
      <li>
        {#if isOtherPage}
          <a class="paper-nav__link" href={`${basePath}${section.slug}/`}>
            {#if !section.appendix}<span class="paper-nav__number">{section.number}</span>{/if}
            {section.title}
          </a>
        {:else}
          <button
            class="paper-nav__link"
            class:active={sectionActive}
            on:click={() => scrollToAnchor(section.appendix ? (section.headings[0]?.anchor ?? section.slug) : section.slug)}
          >
            {#if !section.appendix}<span class="paper-nav__number">{section.number}</span>{/if}
            {section.title}
          </button>
        {/if}
        {#if !isOtherPage && path.length > 0 && section.headings.length > 0}
          <PaperNavHeadingList headings={section.headings} activePath={path} onNavigate={scrollToAnchor} />
        {/if}
      </li>
    {/each}
  </ul>
</nav>

<style>
  .paper-nav {
    font-size: 0.9rem;
  }

  .paper-nav__title {
    margin: 0 0 1rem 0;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-hairline);
  }

  .paper-nav__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .paper-nav__link {
    display: block;
    width: 100%;
    text-align: left;
    text-decoration: none;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    color: var(--color-ink);
    cursor: pointer;
    font-family: var(--font-heading);
    font-size: 0.9rem;
    line-height: 1.4;
    transition: all 160ms ease;
    border-left: 2px solid transparent;
    border-radius: 0.25rem;
  }

  .paper-nav__link:hover {
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }

  .paper-nav__link:focus-visible {
    outline: 2px solid var(--color-accent-mid);
    outline-offset: -2px;
  }

  .paper-nav__link.active {
    background: var(--color-accent-tint);
    color: var(--color-accent);
    border-left-color: var(--color-accent);
    font-weight: 500;
  }

  .paper-nav__number {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
    margin-right: 0.4em;
  }

  .paper-nav__link.active .paper-nav__number {
    color: var(--color-accent);
  }
</style>
