<script>
  // Formula-specific notation overlay, mounted once site-wide (BaseLayout.astro) —
  // graduated from the notation-formula.astro demo (see .local/04_minimal_website.md's
  // notation-overlay plan) after the formula-specific model won out over the full-table
  // one. Architecturally mirrors CitationLayer.svelte: a single shared card for however
  // many formulas are on the page, shown on hover/focus and pinned on click.
  //
  // Unlike CitationLayer, which needs no DOM scan (each trigger already carries its own
  // data-* attributes, authored via <Citation>), a formula's matches aren't known until
  // computed — so onMount does one pass over every rendered KaTeX formula, recovers its
  // LaTeX from the annotation[encoding="application/x-tex"] element rehype-katex embeds
  // by default, and runs matchFormula (lib/notation-match.ts) against `entries`. Only
  // formulas with >=1 match become interactive. This is a whole-formula match only —
  // hovering a specific symbol *within* a formula (e.g. just the O in r=(O,E,\beta)) is
  // out of scope, see the plan.
  import { onMount } from 'svelte';
  import { matchFormula } from '../lib/notation-match';

  // Each entry: { id, symbolTokens, termHtml, descriptionHtml } — pre-tokenized and
  // pre-rendered at build time (lib/notation-data.ts) so no KaTeX is needed client-side.
  export let entries = [];

  let open = false;
  let pinned = false;
  let matches = [];
  let top = 0;
  let left = 0;
  let triggerEl;
  let cardEl;

  const TRIGGER_SELECTOR = '.notation-formula-trigger';
  const CARD_SELECTOR = '.notation-card';
  const matchesByElement = new WeakMap();

  // Same close-delay pattern as CitationLayer.svelte: hovering off the trigger schedules
  // a close rather than closing immediately, cancelled if the mouse reaches the card
  // (including across the visual gap above the trigger) — otherwise the card vanishes
  // before the pointer can ever reach it.
  const CLOSE_DELAY_MS = 300;
  let closeTimer;

  function scheduleClose() {
    if (pinned) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, CLOSE_DELAY_MS);
  }

  function cancelScheduledClose() {
    clearTimeout(closeTimer);
  }

  function position(el) {
    const rect = el.getBoundingClientRect();
    top = rect.top + window.scrollY;
    left = rect.left + window.scrollX;
  }

  function show(el) {
    const entryMatches = matchesByElement.get(el);
    if (!entryMatches || entryMatches.length === 0) return;
    triggerEl = el;
    matches = entryMatches;
    position(el);
    open = true;
  }

  function close() {
    cancelScheduledClose();
    open = false;
    pinned = false;
    triggerEl = undefined;
  }

  onMount(() => {
    const entryById = new Map(entries.map((e) => [e.id, e]));

    // .katex-display wraps its own inner .katex — bind only the outer element so a
    // display formula isn't scanned/handled twice.
    document.querySelectorAll('.katex, .katex-display').forEach((el) => {
      if (el.classList.contains('katex') && el.closest('.katex-display')) return;

      const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
      if (!annotation) return;
      const latex = annotation.textContent || '';
      const matchIds = matchFormula(latex, entries);
      if (matchIds.length === 0) return;

      const matchedEntries = matchIds.map((id) => entryById.get(id)).filter(Boolean);
      matchesByElement.set(el, matchedEntries);
      el.classList.add('notation-formula-trigger');
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute(
        'aria-label',
        `Show notation for this formula (${matchedEntries.length} symbol${matchedEntries.length > 1 ? 's' : ''})`,
      );
    });

    function onMouseOver(event) {
      const el = event.target.closest?.(TRIGGER_SELECTOR);
      if (el) {
        cancelScheduledClose();
        show(el);
        return;
      }
      if (cardEl && event.target.closest?.(CARD_SELECTOR)) cancelScheduledClose();
    }

    function onMouseOut(event) {
      if (pinned) return;
      const el = event.target.closest?.(TRIGGER_SELECTOR);
      const onCard = cardEl && event.target.closest?.(CARD_SELECTOR);
      if (el || onCard) scheduleClose();
    }

    function onFocusIn(event) {
      const el = event.target.closest?.(TRIGGER_SELECTOR);
      if (el) show(el);
    }

    function onFocusOut(event) {
      if (pinned) return;
      const el = event.target.closest?.(TRIGGER_SELECTOR);
      if (el) close();
    }

    function onClick(event) {
      const el = event.target.closest?.(TRIGGER_SELECTOR);
      if (el) {
        if (open && triggerEl === el && pinned) {
          close();
        } else {
          show(el);
          pinned = true;
        }
        return;
      }
      if (open && cardEl && !cardEl.contains(event.target)) close();
    }

    function onKeydown(event) {
      if (event.key === 'Escape') close();
    }

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);

    return () => {
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeydown);
      cancelScheduledClose();
    };
  });
</script>

{#if open}
  <div
    class="notation-card"
    role="tooltip"
    bind:this={cardEl}
    style={`top:${top}px; left:${left}px;`}
  >
    {#each matches as entry (entry.id)}
      <div class="notation-card__row">
        <span class="notation-card__term">{@html entry.termHtml}</span>
        <span class="notation-card__desc">{@html entry.descriptionHtml}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .notation-card {
    position: absolute;
    z-index: 20;
    transform: translateY(calc(-100% - 0.5rem));
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: max(18rem, min(26rem, 80vw));
    padding: 0.75rem 0.9rem;
    background: var(--color-card);
    color: var(--color-ink);
    border: 1px solid var(--color-hairline);
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px -8px color-mix(in srgb, var(--color-ink) 25%, transparent);
    font-family: var(--font-sans);
    font-size: 0.85rem;
    line-height: 1.4;
    text-align: left;
  }

  .notation-card__row {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .notation-card__row:not(:last-child) {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-hairline);
  }

  .notation-card__term {
    font-family: var(--font-mono);
  }

  .notation-card__desc {
    color: color-mix(in srgb, var(--color-ink) 75%, transparent);
  }

  @media (prefers-reduced-motion: no-preference) {
    .notation-card {
      animation: notation-card-in 120ms ease-out;
    }
  }

  @keyframes notation-card-in {
    from {
      opacity: 0;
      transform: translateY(calc(-100% - 0.5rem + 2px));
    }
    to {
      opacity: 1;
      transform: translateY(calc(-100% - 0.5rem));
    }
  }
</style>
