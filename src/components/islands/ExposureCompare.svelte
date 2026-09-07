<script lang="ts">
  /*
    Beat 3's animation (.local/plans/landing_page_plan.md): the same synthetic city as
    CityLayers.svelte (src/lib/example-city.ts), analyzed two ways — the per-borough
    average NO2 reading (from beat 2) against a per-road average, using the same sensors.
    A toggle crossfades between them and the ranking list beneath makes the reordering
    explicit: the per-borough view isn't wrong because it ignores population, it's wrong
    because NO2 follows roads, not administrative boundaries, and different boroughs
    happen to contain very different numbers of sensors sitting on the same busy road
    (Main St, running through Westbridge, Northgate, and Harborview alike).

    A click toggle rather than a scroll-scrubbed transition, per the plan's "a single
    toggle or scroll step flips between them" — simpler, keyboard- and
    reduced-motion-friendly by construction; which mode is showing is never driven by
    scroll position.

    Sensors (sized by reading, same scale as CityLayers) are visible in both states. The
    per-borough state keeps the borough fill/outline and hides the road network entirely
    — that's the misleading view, and roads aren't part of it. The per-road state drops
    the borough shapes and labels altogether and colors the road network instead — the
    point being that once you stop thinking in boroughs, the picture (and the ranking) is
    completely different.

    Reveal-on-scroll follows CityLayers.svelte's pattern (same GSAP + ScrollTrigger setup,
    same dim-to-lit table-card treatment): the roads.csv table lights up first, the toggle
    fades in next, then the map/legend and ranking fade in together as one step — split
    across the visual and sidebar columns, so it's two separate targets in the tween rather
    than one wrapping element. Same default (no-JS or reduced-motion) state as CityLayers:
    everything fully composed, no motion.
  */
  import { onMount } from 'svelte';
  import {
    boroughs,
    boroughMetrics,
    roads,
    roadMetrics,
    roadTablePreview,
    sensors,
    sensorDotRadius,
    VIEW_W,
    VIEW_H,
    sequentialColor,
  } from '../../lib/example-city';

  let root: HTMLElement | undefined = $state();
  let tableCard: HTMLElement | undefined = $state();
  let toggleButton: HTMLElement | undefined = $state();
  let visualGroup: HTMLElement | undefined = $state();
  let rankingList: HTMLElement | undefined = $state();

  const ACCENT = '#0F6E56';
  const HAIRLINE = '#E4E1D9';

  type Mode = 'borough' | 'road';
  let mode: Mode = $state('borough');

  const FROM = '#FBEFD9';
  const TO = '#B3421C';

  // Birch Ave has no sensors tagged to it in the data — its average is genuinely NaN, not
  // a bug, and has to be excluded from the shared scale rather than propagating into it.
  const allValues = [
    ...boroughs.map((b) => boroughMetrics[b.id].naiveAvg),
    ...roads.map((r) => roadMetrics[r.id].avg),
  ].filter((v) => Number.isFinite(v));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);

  function colorForValue(value: number) {
    if (!Number.isFinite(value)) return 'var(--color-hairline)';
    const t = (value - min) / (max - min || 1);
    return sequentialColor(t, FROM, TO);
  }

  function roadPath(trace: { x: number; y: number }[]) {
    return trace.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  // No-sensor entries (NaN) sort after every real reading, regardless of order otherwise.
  function byValueDesc(a: { value: number }, b: { value: number }) {
    if (!Number.isFinite(a.value)) return Number.isFinite(b.value) ? 1 : 0;
    if (!Number.isFinite(b.value)) return -1;
    return b.value - a.value;
  }

  let ranking = $derived(
    mode === 'borough'
      ? boroughs.map((b) => ({ id: b.id, name: b.name, value: boroughMetrics[b.id].naiveAvg })).sort(byValueDesc)
      : roads.map((r) => ({ id: r.id, name: r.name, value: roadMetrics[r.id].avg })).sort(byValueDesc)
  );

  onMount(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || !root) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    import('gsap').then(async (gsapModule) => {
      if (cancelled) return;
      const gsap = gsapModule.default;
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (cancelled || !root) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        gsap.set(tableCard, { opacity: 0.4, borderColor: HAIRLINE });

        const tl = gsap.timeline({
          // Anchored on the trigger's top at both ends, same reasoning as CityLayers.svelte:
          // a 'bottom …' end ties the reveal window to the figure's total height, which
          // shrank once the two-column layout landed and made the fade finish too late.
          scrollTrigger: { trigger: root, start: 'top 90%', end: 'top 50%', scrub: 0.3 },
        });

        tl.to(tableCard, { opacity: 1, borderColor: ACCENT, duration: 0.5 })
                .from(toggleButton, {opacity: 0, duration: 0.5}, '+=0.05')
          .from([visualGroup, rankingList], { opacity: 0, duration: 1 }, '+=0.1');
      }, root);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  });
</script>

<figure class="exposure-compare" bind:this={root}>
  <div class="exposure-compare__layout">
    <div class="exposure-compare__visual" bind:this={visualGroup}>
      <svg
        class="exposure-compare__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={mode === 'borough'
          ? 'Map of the city, boroughs colored by their per-borough NO2 average, with individual sensors sized by reading'
          : 'Map of the city with borough shapes removed, showing only the road network colored by per-road NO2 average and individual sensors sized by reading'}
      >
        {#if mode === 'borough'}
          {#each boroughs as b (b.id)}
            <path d={b.path} class="exposure-compare__cell" fill={colorForValue(boroughMetrics[b.id].naiveAvg)} />
            <text x={b.labelPoint.x} y={b.labelPoint.y} class="exposure-compare__label">{b.name}</text>
          {/each}
        {/if}
        {#if mode === 'road'}
          {#each roads as r (r.id)}
            <path
              d={roadPath(r.trace)}
              class="exposure-compare__road"
              stroke={colorForValue(roadMetrics[r.id].avg)}
              stroke-width={r.isMain ? 5 : 3}
            />
          {/each}
        {/if}
        {#each sensors as s, i (i)}
          <circle cx={s.x} cy={s.y} r={sensorDotRadius(s.no2)} class="exposure-compare__sensor-dot" />
        {/each}
      </svg>

      <div class="exposure-compare__legend">
        <span class="exposure-compare__legend-group">
          <span>{min.toFixed(0)} µg/m³</span>
          <span class="exposure-compare__gradient" style={`background: linear-gradient(90deg, ${FROM}, ${TO})`}></span>
          <span>{max.toFixed(0)} µg/m³</span>
        </span>
        <span class="exposure-compare__legend-group">
          <span>Sensor reading</span>
          <span class="exposure-compare__legend-dots" aria-hidden="true">
            <span class="exposure-compare__legend-dot" style="width: 3.2px; height: 3.2px;"></span>
            <span class="exposure-compare__legend-dot" style="width: 6.4px; height: 6.4px;"></span>
            <span class="exposure-compare__legend-dot" style="width: 10.4px; height: 10.4px;"></span>
          </span>
        </span>
      </div>
    </div>

    <div class="exposure-compare__side">
      <div class="exposure-compare__table-card" bind:this={tableCard}>
        <p class="exposure-compare__table-header">roads.csv</p>
        <table class="exposure-compare__table">
          <thead>
            <tr><th>road_id</th><th>name</th><th>trace</th></tr>
          </thead>
          <tbody>
            {#each roadTablePreview as row (row.road_id)}
              <tr>
                <td>{row.road_id}</td>
                <td>{row.name}</td>
                <td class="exposure-compare__table-trace">{row.trace}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="exposure-compare__toggle" role="group" aria-label="Choose the unit of analysis" bind:this={toggleButton}>
        <button
          type="button"
          class:is-active={mode === 'borough'}
          aria-pressed={mode === 'borough'}
          onclick={() => (mode = 'borough')}
        >
          Per-borough average
        </button>
        <button
          type="button"
          class:is-active={mode === 'road'}
          aria-pressed={mode === 'road'}
          onclick={() => (mode = 'road')}
        >
          Per-road average
        </button>
      </div>

      <ol class="exposure-compare__ranking" bind:this={rankingList}>
        {#each ranking as row, i (row.id)}
          <li class:is-top={i === 0}>
            <span class="exposure-compare__rank-name">{row.name}</span>
            <span class="exposure-compare__rank-value">
              {Number.isFinite(row.value) ? `${row.value.toFixed(1)} µg/m³` : 'No sensors'}
            </span>
          </li>
        {/each}
      </ol>
    </div>
  </div>

  <figcaption class="exposure-compare__caption">
    {#if mode === 'borough'}
      Sensors grouped by borough. Eastgate shows the by far highest average readings for NO2 pollution, Southmoor shows
      the lowest readings.
    {:else}
      Same sensors, grouped by road instead of boroughs. This aggregation reveals that the pollution is consistently
      highest on Main St, with elevated levels also occurring on Pine Ave. This aggregations indicates that pollution
      mainly depends on the road, not on the borough, suggesting that policy interventions may better be directed at
      roads than boroughs.
    {/if}
  </figcaption>
</figure>

<style>
  .exposure-compare {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .exposure-compare__layout {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2.5rem;
    align-items: start;
  }

  @media (max-width: 720px) {
    .exposure-compare__layout {
      grid-template-columns: 1fr;
    }
  }

  .exposure-compare__table-card {
    border: 1px solid var(--color-hairline);
    border-radius: 0.5rem;
    background: var(--color-card);
    padding: 0.6rem 0.7rem;
    overflow-x: auto;
  }

  .exposure-compare__table-header {
    margin: 0 0 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: color-mix(in srgb, var(--color-ink) 60%, transparent);
  }

  .exposure-compare__table {
    border-collapse: collapse;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    white-space: nowrap;
  }

  .exposure-compare__table th,
  .exposure-compare__table td {
    text-align: left;
    padding: 0.15rem 0.5rem 0.15rem 0;
    color: var(--color-ink);
  }

  .exposure-compare__table th {
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
    font-weight: 400;
    border-bottom: 1px solid var(--color-hairline);
  }

  .exposure-compare__table-trace {
    white-space: normal;
    max-width: 16rem;
  }

  .exposure-compare__toggle {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--color-card);
    border: 1px solid var(--color-hairline);
    border-radius: 0.6rem;
    width: fit-content;
  }

  .exposure-compare__toggle button {
    font-family: var(--font-sans);
    font-size: 0.85rem;
    padding: 0.4rem 0.75rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--color-ink) 65%, transparent);
    cursor: pointer;
  }

  .exposure-compare__toggle button.is-active {
    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-weight: 500;
  }

  .exposure-compare__visual {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .exposure-compare__side {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .exposure-compare__svg {
    width: 100%;
    height: auto;
    display: block;
  }

  .exposure-compare__cell {
    stroke: var(--color-hairline);
    stroke-width: 1.5;
    transition: fill 0.4s ease;
  }

  .exposure-compare__road {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition:
      stroke 0.4s ease,
      stroke-width 0.4s ease;
  }

  .exposure-compare__sensor-dot {
    fill: var(--color-accent);
    fill-opacity: 0.85;
  }

  @media (prefers-reduced-motion: reduce) {
    .exposure-compare__cell,
    .exposure-compare__road {
      transition: none;
    }
  }

  .exposure-compare__label {
    font-family: var(--font-mono);
    font-size: 8px;
    text-anchor: middle;
    fill: var(--color-ink);
    paint-order: stroke;
    stroke: var(--color-paper);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .exposure-compare__legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.25rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--color-ink) 65%, transparent);
  }

  .exposure-compare__legend-group {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .exposure-compare__gradient {
    display: inline-block;
    width: 4rem;
    height: 0.5rem;
    border-radius: 2px;
    border: 1px solid var(--color-hairline);
  }

  .exposure-compare__legend-dots {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .exposure-compare__legend-dot {
    display: inline-block;
    border-radius: 50%;
    background: var(--color-accent);
    opacity: 0.85;
  }

  .exposure-compare__ranking {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .exposure-compare__ranking li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
    padding: 0.3rem 0.6rem;
    border-radius: 0.4rem;
    color: color-mix(in srgb, var(--color-ink) 75%, transparent);
  }

  .exposure-compare__ranking li.is-top {
    background: var(--color-accent-tint);
    color: var(--color-ink);
    font-weight: 500;
  }

  .exposure-compare__rank-value {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .exposure-compare__caption {
    font-size: 0.85rem;
    line-height: 1.5;
    color: color-mix(in srgb, var(--color-ink) 65%, transparent);
  }
</style>
