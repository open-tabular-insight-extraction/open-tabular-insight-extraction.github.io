<script lang="ts">
  /*
    Beat 2's animation (.local/plans/landing_page_plan.md): the compound
    discovery-plus-integration barrier, rendered as three layers building up over the
    same synthetic city (src/lib/example-city.ts) as the visitor scrolls. Sensor dots
    appear first — sized by their own reading, scattered without regard to any boundary —
    borough outlines overlay them, then the per-borough average fill comes last: the
    officer's data existing, but not yet located, joined, or turned into even a per-borough
    number.

    Above the map sit two small "head(n)" table previews of the actual raw tables behind
    the first two layers (the point being made isn't just "here's a map", it's "the
    officer starts with tables like these, tagged only by coordinate"). Each card
    dims/lights up in sync with its layer's reveal on the same scroll timeline, rather
    than running a second, separate animation. The boundary card stays lit through the
    third (average-fill) layer too, since that fill is derived from the same join, not a
    new table.

    Whether that per-borough average is trustworthy is deliberately left open here — see
    beat 3 (ExposureCompare.svelte) for why it can still mislead.

    Same scroll-scrub pattern as TermExplosion.svelte: GSAP + ScrollTrigger only loads
    and runs when the visitor doesn't prefer reduced motion; the default (no-JS or
    reduced-motion) state is the fully composed map with both tables lit, no motion.
  */
  import { onMount } from 'svelte';
  import {
    boroughs,
    sensors,
    boroughMetrics,
    VIEW_W,
    VIEW_H,
    sequentialColor,
    sensorTablePreview,
    boundaryTablePreview,
    sensorDotRadius,
  } from '../../lib/example-city';

  let root: HTMLElement | undefined = $state();
  let averageLayer: SVGGElement | undefined = $state();
  let boundariesLayer: SVGGElement | undefined = $state();
  let sensorsLayer: SVGGElement | undefined = $state();
  let sensorCard: HTMLElement | undefined = $state();
  let boundaryCard: HTMLElement | undefined = $state();

  const ACCENT = '#0F6E56';
  const HAIRLINE = '#E4E1D9';
  const HEAT_FROM = '#FBEFD9';
  const HEAT_TO = '#B3421C';

  const avgValues = boroughs.map((b) => boroughMetrics[b.id].naiveAvg);
  const avgMin = Math.min(...avgValues);
  const avgMax = Math.max(...avgValues);

  function averageColor(id: string) {
    const t = (boroughMetrics[id].naiveAvg - avgMin) / (avgMax - avgMin || 1);
    return sequentialColor(t, HEAT_FROM, HEAT_TO);
  }

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
        const cards = [sensorCard, boundaryCard].filter(Boolean);
        gsap.set(cards, { opacity: 0.4, borderColor: HAIRLINE });

        const tl = gsap.timeline({
          // Anchored on the trigger's top at both ends (not 'bottom …') so the reveal
          // window is a fixed scroll distance regardless of how tall the figure ends up
          // being — tying the end to 'bottom' made the window shrink to almost nothing
          // once the two-column layout made this figure shorter, so it fully faded in
          // while still mostly below the fold.
          scrollTrigger: { trigger: root, start: 'top 90%', end: 'top 50%', scrub: 0.3 },
        });

        tl.from(sensorsLayer, { opacity: 0, duration: 1 })
          .to(sensorCard, { opacity: 1, borderColor: ACCENT, duration: 0.5 }, '<')
          .from(boundariesLayer, { opacity: 0, duration: 1 }, '+=0.15')
          .to(boundaryCard, { opacity: 1, borderColor: ACCENT, duration: 0.5 }, '<')
          .from(averageLayer, { opacity: 0, duration: 1 }, '+=0.15');
      }, root);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  });
</script>

<figure class="city-layers" bind:this={root}>
  <div class="city-layers__layout">
    <div class="city-layers__visual">
      <svg
        class="city-layers__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Diagram of a synthetic city: scattered NO2 sensor readings sized by reading, then borough boundaries, then the per-borough average, layered to show that the data exists but has to be discovered and combined before even a per-borough number is possible."
      >
        <g class="city-layers__average" bind:this={averageLayer}>
          {#each boroughs as b (b.id)}
            <path d={b.path} fill={averageColor(b.id)} fill-opacity="0.55" stroke="none" />
          {/each}
        </g>
        <g class="city-layers__boundaries" bind:this={boundariesLayer}>
          {#each boroughs as b (b.id)}
            <path d={b.path} class="city-layers__borough-outline" />
            <text x={b.labelPoint.x} y={b.labelPoint.y} class="city-layers__label">{b.name}</text>
          {/each}
        </g>
        <g class="city-layers__sensors" bind:this={sensorsLayer}>
          {#each sensors as s, i (i)}
            <circle cx={s.x} cy={s.y} r={sensorDotRadius(s.no2)} class="city-layers__sensor-dot" />
          {/each}
        </g>
      </svg>

      <div class="city-layers__legend">
        <span>Lower reading</span>
        <span class="city-layers__legend-dots" aria-hidden="true">
          <span class="city-layers__legend-dot" style="width: 3.2px; height: 3.2px;"></span>
          <span class="city-layers__legend-dot" style="width: 6.4px; height: 6.4px;"></span>
          <span class="city-layers__legend-dot" style="width: 10.4px; height: 10.4px;"></span>
        </span>
        <span>Higher reading</span>
      </div>
    </div>

    <div class="city-layers__side">
      <div class="city-layers__table-card" bind:this={sensorCard}>
        <p class="city-layers__table-header">sensor_network.csv</p>
        <table class="city-layers__table">
          <thead>
            <tr><th>sensor_id</th><th>x</th><th>y</th><th>no2_ugm3</th></tr>
          </thead>
          <tbody>
            {#each sensorTablePreview as row (row.sensor_id)}
              <tr>
                <td>{row.sensor_id}</td>
                <td>{row.x}</td>
                <td>{row.y}</td>
                <td>{row.no2_ugm3}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="city-layers__table-card" bind:this={boundaryCard}>
        <p class="city-layers__table-header">admin_boundaries.csv</p>
        <table class="city-layers__table">
          <thead>
            <tr><th>borough_id</th><th>name</th><th>boundary</th></tr>
          </thead>
          <tbody>
            {#each boundaryTablePreview as row (row.borough_id)}
              <tr>
                <td>{row.borough_id}</td>
                <td>{row.name}</td>
                <td class="city-layers__table-boundary">{row.boundary}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <figcaption class="city-layers__caption">
    Since the sensor table tags the location of the sensors with coordinates, not with their borough, the table has to
    be joined with the admin boundaries table to associate each sensor with a borough.
  </figcaption>
</figure>

<style>
  .city-layers {
    margin: 0;
  }

  .city-layers__layout {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2.5rem;
    align-items: start;
  }

  @media (max-width: 720px) {
    .city-layers__layout {
      grid-template-columns: 1fr;
    }
  }

  .city-layers__visual {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .city-layers__side {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .city-layers__table-card {
    border: 1px solid var(--color-hairline);
    border-radius: 0.5rem;
    background: var(--color-card);
    padding: 0.6rem 0.7rem;
    overflow-x: auto;
  }

  .city-layers__table-header {
    margin: 0 0 0.4rem;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: color-mix(in srgb, var(--color-ink) 60%, transparent);
  }

  .city-layers__table {
    border-collapse: collapse;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    white-space: nowrap;
  }

  .city-layers__table th,
  .city-layers__table td {
    text-align: left;
    padding: 0.15rem 0.5rem 0.15rem 0;
    color: var(--color-ink);
  }

  .city-layers__table th {
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
    font-weight: 400;
    border-bottom: 1px solid var(--color-hairline);
  }

  .city-layers__table-boundary {
    white-space: normal;
    max-width: 11rem;
  }

  .city-layers__svg {
    width: 100%;
    height: auto;
    display: block;
  }

  .city-layers__borough-outline {
    fill: none;
    stroke: var(--color-ink);
    stroke-width: 1.25;
    opacity: 0.55;
  }

  .city-layers__label {
    font-family: var(--font-mono);
    font-size: 8px;
    text-anchor: middle;
    fill: var(--color-ink);
    paint-order: stroke;
    stroke: var(--color-paper);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .city-layers__sensor-dot {
    fill: var(--color-accent);
    fill-opacity: 0.85;
  }

  .city-layers__legend {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--color-ink) 65%, transparent);
  }

  .city-layers__legend-dots {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .city-layers__legend-dot {
    display: inline-block;
    border-radius: 50%;
    background: var(--color-accent);
    opacity: 0.85;
  }

  .city-layers__caption {
    font-size: 0.85rem;
    line-height: 1.5;
    color: color-mix(in srgb, var(--color-ink) 65%, transparent);
  }
</style>
