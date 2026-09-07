<script lang="ts">
  /*
    Beat 4's animation (see .local/plans/landing_page_plan.md and CLAUDE.md's motion
    rules): the full title sits on one line, then — as the visitor scrolls through this
    section — fades back while the four term panels stagger up beneath it, each with a
    hand-drawn accent underline and its description. This is a crossfade/stagger reveal
    scrubbed to scroll position, not a literal FLIP of each word's glyphs into place; it
    reads as "the title decomposing into its four parts" without needing per-word
    position measurement, which keeps this first animation pass minimal.

    Baseline CSS (no JS, or prefers-reduced-motion) renders the settled end state
    already, title and all four panels fully visible, no motion — GSAP only ever
    animates *from* that visible state, so a slow/failed script load never leaves
    anything stuck hidden.
  */
  import { onMount } from 'svelte';

  interface Term {
    word: string;
    description: string;
  }

  interface Props {
    words: string[];
    terms: Term[];
  }

  const { words, terms }: Props = $props();

  let root: HTMLElement | undefined = $state();
  let titleEl: HTMLElement | undefined = $state();
  let panelEls: HTMLElement[] = $state([]);
  let underlineEls: HTMLElement[] = $state([]);

  onMount(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !root || !titleEl) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    import('gsap').then(async (gsapModule) => {
      if (cancelled) return;
      const gsap = gsapModule.default;
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (cancelled || !root || !titleEl) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: root,
            start: 'top 70%',
            end: 'bottom 55%',
            scrub: 0.5,
          },
        });

        tl.to(titleEl, { opacity: 0, y: -20, scale: 0.94, duration: 1 })
          .from(panelEls, { opacity: 0, y: 28, duration: 1, stagger: 0.25 }, '-=0.35')
          .from(underlineEls, { scaleX: 0, duration: 0.6, stagger: 0.25 }, '<');
      }, root);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  });
</script>

<section class="term-explosion" bind:this={root}>
  <p class="term-explosion__title" bind:this={titleEl} aria-hidden="true">
    {#each words as word, i (word)}
      <span>{word}</span>{i < words.length - 1 ? ' ' : ''}
    {/each}
  </p>

  <div class="term-explosion__panels">
    {#each terms as term, i (term.word)}
      <div class="term-explosion__panel" bind:this={panelEls[i]}>
        <h3 class="term-explosion__word">{term.word}</h3>
        <span class="term-explosion__underline" bind:this={underlineEls[i]} aria-hidden="true"
        ></span>
        <p class="term-explosion__description">{term.description}</p>
      </div>
    {/each}
  </div>
</section>

<style>
  .term-explosion {
    display: flex;
    flex-direction: column;
    gap: clamp(2rem, 5vw, 3.5rem);
    padding-block: clamp(2rem, 6vw, 4rem);
  }

  .term-explosion__title {
    margin: 0;
    text-align: center;
    font-family: var(--font-heading);
    font-weight: 500;
    letter-spacing: -0.01em;
    font-size: clamp(1.5rem, 4.5vw, 2.75rem);
    color: var(--color-ink);
  }

  .term-explosion__panels {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: clamp(1.25rem, 3vw, 2rem);
  }

  @media (max-width: 900px) {
    .term-explosion__panels {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 560px) {
    .term-explosion__panels {
      grid-template-columns: 1fr;
    }
  }

  .term-explosion__panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .term-explosion__word {
    margin: 0;
    font-family: var(--font-heading);
    font-weight: 500;
    font-size: 1.15rem;
    color: var(--color-ink);
  }

  .term-explosion__underline {
    display: block;
    width: 2.25rem;
    height: 2px;
    background: var(--color-accent-mid);
    transform-origin: 0% 50%;
  }

  .term-explosion__description {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.6;
    color: color-mix(in srgb, var(--color-ink) 75%, transparent);
  }
</style>
