<script>
  // Single shared hover-card renderer for every Citation.astro trigger on the
  // page, via event delegation — see Citation.astro for why (one island for
  // ~1,900 citations instead of ~1,900 islands). Mounted once in
  // BaseLayout.astro.
  import { onMount } from 'svelte';

  let open = false;
  let pinned = false;
  let title = '';
  let meta = '';
  let venue = '';
  let href = '';
  let top = 0;
  let left = 0;
  let triggerEl;
  let cardEl;

  const TRIGGER_SELECTOR = '.citation-trigger';
  const CARD_SELECTOR = '.citation-card';
  // Hovering off the trigger doesn't close the card immediately — it schedules a close
  // after this delay, cancelled if the mouse lands on the trigger or the card itself
  // (including crossing the visual gap between them, which briefly fires mouseout with
  // no matching mouseover target). That's what makes the card's own link clickable: the
  // old instant-close-on-mouseout made it disappear before the pointer could reach it.
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

  function readData(el) {
    title = el.dataset.title || '';
    meta = el.dataset.meta || '';
    venue = el.dataset.venue || '';
    href = el.dataset.href || '';
  }

  function position(el) {
    const rect = el.getBoundingClientRect();
    // Document-relative (not viewport-relative), so the card stays correctly
    // anchored under the trigger as the page scrolls without a scroll listener.
    top = rect.top + window.scrollY;
    left = rect.left + window.scrollX;
  }

  function show(el) {
    triggerEl = el;
    readData(el);
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
    function onMouseOver(event) {
      const el = event.target.closest?.(TRIGGER_SELECTOR);
      if (el) {
        cancelScheduledClose();
        show(el);
        return;
      }
      // Entering the card itself (including after crossing the gap above the trigger)
      // keeps it open — only leaving both the trigger and the card schedules a close.
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
  <span
    class="citation-card"
    role="tooltip"
    bind:this={cardEl}
    style={`top:${top}px; left:${left}px;`}
  >
    {#if title}<span class="citation-card__title">{title}</span>{/if}
    <span class="citation-card__meta">{meta}</span>
    {#if venue}<span class="citation-card__venue">{venue}</span>{/if}
    {#if href}
      <a class="citation-card__link" {href} target="_blank" rel="noopener noreferrer">View source →</a>
    {/if}
  </span>
{/if}

<style>
  .citation-card {
    position: absolute;
    z-index: 20;
    transform: translateY(calc(-100% - 0.5rem));
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: max(18rem, min(24rem, 80vw));
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

  .citation-card__title {
    font-family: var(--font-heading);
    font-weight: 500;
  }

  .citation-card__meta {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--color-ink) 65%, transparent);
  }

  .citation-card__venue {
    font-style: italic;
    color: color-mix(in srgb, var(--color-ink) 65%, transparent);
  }

  .citation-card__link {
    margin-top: 0.15rem;
    color: var(--color-accent);
    font-size: 0.8rem;
  }

  @media (prefers-reduced-motion: no-preference) {
    .citation-card {
      animation: citation-in 120ms ease-out;
    }
  }

  @keyframes citation-in {
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
