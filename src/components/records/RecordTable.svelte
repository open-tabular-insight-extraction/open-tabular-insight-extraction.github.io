<script>
  /*
    Sortable, filterable, searchable overview table shared by the systems and benchmarks
    pages.

    Split of responsibilities:
    - TanStack `@tanstack/table-core` (v8, per .local/02_tech_stack.md) owns the row model:
      sorting semantics, faceted filtering, undefined-last ordering. The framework adapters
      are skipped deliberately — @tanstack/svelte-table v8 targets Svelte 4 and v9 is beta,
      while table-core is framework-agnostic and drives fine from runes.
    - This component owns the markup and cell styling, which deliberately mirrors
      PaperTableGrid.astro and PaperTableCell.astro so a record looks identical here and in
      the paper's own tables. (Those are .astro and can't be imported into an island, hence
      the parallel markup; keep the two in sync when either changes.)

    Layout note — why the table lives in its own bounded scroll box: these tables are far
    wider and taller than a screen, so both header rows and the identifying first column
    are pinned while reading. `position: sticky` resolves against the nearest scroll
    container, and a horizontally scrollable wrapper *is* one, so offsetting the header
    against the fixed site nav (as an earlier version did) pinned it 4rem down inside the
    wrapper and left it floating over the first body rows. Giving the wrapper a bounded
    height and sticking the header at its own top edge instead is the only arrangement in
    which both axes pin correctly. `border-collapse: separate` is required with it —
    collapsed borders are dropped from sticky cells.

    Everything it receives is plain serializable data prepared at build time by the page —
    no .local access, no KaTeX, no citation lookup on the client.
  */
  import {
    createTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
  } from '@tanstack/table-core';

  /**
   * @typedef {{ key: string, label: string, group?: string, align?: 'left'|'center'|'right',
   *   sortable?: boolean, numeric?: boolean, width?: string, maxWidth?: string,
   *   minWidth?: string, clampLines?: number,
   *   filter?: { label: string, options: { value: string, label: string }[] } }} RecordColumn
   *
   * Rows carry three parallel views of the same record: `cells` for display, `sortValues`
   * for ordering (numbers where the column is numeric, `undefined` for "not reported" so
   * it sorts last in both directions), and `filterValues` for the facet selects.
   * @typedef {{ id: string, cells: Record<string, any>, sortValues: Record<string, any>,
   *   filterValues: Record<string, string[]> }} RecordRow
   */

  let {
    columns = [],
    rows = [],
    /** Plural noun for the count line, e.g. "systems". */
    unit = 'records',
    /** Placeholder for the free-text search box; also its accessible label. */
    searchLabel = 'Search',
  } = $props();

  let sorting = $state([]);
  let columnFilters = $state([]);
  let search = $state('');

  const tableColumns = columns.map((col) => ({
    id: col.key,
    accessorFn: (row) => row.sortValues[col.key],
    enableSorting: col.sortable !== false,
    sortUndefined: 'last',
    enableColumnFilter: Boolean(col.filter),
    // Facet filters test membership in the row's own value list, so a multi-valued cell
    // (several insight types, several validation functions) matches on any one of them.
    filterFn: (row, columnId, value) =>
      !value || (row.original.filterValues[columnId] ?? []).includes(value),
  }));

  /** Flattens every displayable string in a row into one haystack for the search box. */
  function searchTextFor(row) {
    const parts = [];
    const push = (cell) => {
      if (cell == null) return;
      if (typeof cell === 'string') parts.push(cell);
      else if (cell.kind === 'cite') parts.push(cell.text ?? '', cell.marker, cell.title, cell.venue);
      else if (cell.kind === 'tags') parts.push(cell.title, ...cell.items);
      else if (cell.kind === 'setting') parts.push(cell.title, cell.value ?? '');
      else if (cell.kind === 'pills') parts.push(...cell.items.flatMap((i) => [i.label, i.title ?? '']));
    };
    for (const col of columns) push(row.cells[col.key]);
    return parts.join(' ').toLowerCase();
  }

  const searchIndex = new Map(rows.map((row) => [row.id, searchTextFor(row)]));

  /* Free-text search is applied before the table is built rather than through TanStack's
     global filter: both filters are conjunctive, so the order is immaterial, and this
     keeps the column-filter plumbing to the one filterFn above. */
  const searchedRows = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    const terms = query.split(/\s+/);
    return rows.filter((row) => {
      const haystack = searchIndex.get(row.id) ?? '';
      return terms.every((term) => haystack.includes(term));
    });
  });

  /*
    The table instance is rebuilt whenever sorting, filtering or the search changes rather
    than being held and mutated through setOptions/onStateChange. With ~60 rows that is far
    cheaper than it sounds, and it keeps state ownership entirely in runes — no second
    source of truth to keep in sync.
  */
  const visibleRows = $derived.by(() => {
    const table = createTable({
      data: searchedRows,
      columns: tableColumns,
      state: { sorting, columnFilters },
      onStateChange: () => {},
      renderFallbackValue: null,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
    });
    return table.getRowModel().rows.map((row) => row.original);
  });

  const filterColumns = columns.filter((col) => col.filter);
  const hasGroups = columns.some((col) => col.group);
  const isNarrowed = $derived(
    columnFilters.some((f) => f.value) || search.trim().length > 0 || sorting.length > 0,
  );

  // Collapses consecutive same-group columns into { label, span } for the spanning header
  // row — same construction as PaperTableGrid.astro.
  const groupHeader = [];
  for (const col of columns) {
    const last = groupHeader[groupHeader.length - 1];
    if (last && last.label === (col.group ?? null)) last.span += 1;
    else groupHeader.push({ label: col.group ?? null, span: 1 });
  }

  function sortStateFor(key) {
    const entry = sorting.find((s) => s.id === key);
    if (!entry) return 'none';
    return entry.desc ? 'descending' : 'ascending';
  }

  /** Click cycles ascending → descending → unsorted, single-column. */
  function toggleSort(col) {
    if (col.sortable === false) return;
    const current = sorting.find((s) => s.id === col.key);
    if (!current) sorting = [{ id: col.key, desc: false }];
    else if (!current.desc) sorting = [{ id: col.key, desc: true }];
    else sorting = [];
  }

  function setFilter(key, value) {
    const others = columnFilters.filter((f) => f.id !== key);
    columnFilters = value ? [...others, { id: key, value }] : others;
  }

  function filterValue(key) {
    return columnFilters.find((f) => f.id === key)?.value ?? '';
  }

  function resetAll() {
    columnFilters = [];
    search = '';
    sorting = [];
  }

  /**
   * Width constraints for a column's header and body cells. Free-text columns (a
   * benchmark's corpus source or supplement data) hold whole sentences, so they declare a
   * width and a line clamp; without both, the table's auto layout squeezes them to a few
   * characters and the row grows to twenty lines tall.
   */
  function cellStyle(col) {
    const parts = [];
    if (col.width) parts.push(`width:${col.width}`);
    if (col.maxWidth) parts.push(`max-width:${col.maxWidth}`);
    if (col.minWidth) parts.push(`min-width:${col.minWidth}`);
    if (col.clampLines) parts.push(`--rt-clamp:${col.clampLines}`);
    return parts.length > 0 ? parts.join(';') : undefined;
  }
</script>

<div class="rt">
  <div class="rt__controls">
    <label class="rt__field rt__field--search">
      <span class="rt__field-label">{searchLabel}</span>
      <span class="rt__search-wrap">
        <span class="rt__search-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="6.75" cy="6.75" r="4.25" />
            <path d="M10 10l3.5 3.5" stroke-linecap="round" />
          </svg>
        </span>
        <input type="search" bind:value={search} placeholder="name, tag, venue…" />
      </span>
    </label>

    {#each filterColumns as col (col.key)}
      <label class="rt__field">
        <span class="rt__field-label">{col.filter.label}</span>
        <select
          value={filterValue(col.key)}
          onchange={(event) => setFilter(col.key, event.currentTarget.value)}
          class:rt__select--active={filterValue(col.key) !== ''}
        >
          <option value="">All</option>
          {#each col.filter.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
    {/each}

    <div class="rt__status">
      <p class="rt__count" aria-live="polite">
        <strong>{visibleRows.length}</strong>
        {#if visibleRows.length !== rows.length}<span class="rt__count-of">of {rows.length}</span>{/if}
        {unit}
      </p>
      {#if isNarrowed}
        <button type="button" class="rt__reset" onclick={resetAll}>Reset</button>
      {/if}
    </div>
  </div>

  <div class="rt__frame">
    <div class="rt__scroll" tabindex="0" role="region" aria-label="{unit} table, scrollable">
      <table class="rt__table" class:rt__table--grouped={hasGroups}>
        <thead>
          {#if hasGroups}
            <tr class="rt__group-row">
              {#each groupHeader as group, i}
                <th
                  colspan={group.span}
                  class="rt__group-cell"
                  class:rt__group-cell--named={group.label}
                  class:rt__pin={i === 0 && group.span === 1}
                  scope="colgroup">{group.label ?? ''}</th
                >
              {/each}
            </tr>
          {/if}
          <tr class="rt__head-row">
            {#each columns as col, i (col.key)}
              <th
                class="rt__col rt__col--{col.align ?? 'left'}"
                class:rt__pin={i === 0}
                class:rt__col--sorted={sortStateFor(col.key) !== 'none'}
                style={cellStyle(col)}
                scope="col"
                aria-sort={col.sortable === false ? undefined : sortStateFor(col.key)}
              >
                {#if col.sortable === false}
                  <span class="rt__label">{col.label}</span>
                {:else}
                  <button
                    type="button"
                    class="rt__sort"
                    onclick={() => toggleSort(col)}
                    title={`Sort by ${col.label.toLowerCase()}`}
                  >
                    <span class="rt__label">{col.label}</span>
                    <span class="rt__sort-glyph" data-state={sortStateFor(col.key)} aria-hidden="true">
                      <svg viewBox="0 0 8 12" width="7" height="10" fill="currentColor">
                        <path class="rt__caret rt__caret--up" d="M4 0.5 7 4.5H1z" />
                        <path class="rt__caret rt__caret--down" d="M4 11.5 1 7.5h6z" />
                      </svg>
                    </span>
                  </button>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each visibleRows as row (row.id)}
            <tr>
              {#each columns as col, i (col.key)}
                {@const cell = row.cells[col.key]}
                <td
                  class="rt__col rt__col--{col.align ?? 'left'}"
                  class:rt__pin={i === 0}
                  class:rt__col--numeric={col.numeric}
                  style={cellStyle(col)}
                >
                  {#if cell == null || cell === ''}
                    <span class="rt__empty" title="Not reported">–</span>
                  {:else if typeof cell === 'string'}
                    {#if col.clampLines}
                      <span class="rt__clamp" title={cell}>{cell}</span>
                    {:else}
                      {cell}
                    {/if}
                  {:else if cell.kind === 'cite'}
                    {#if cell.text}<span class="rt__cite-text">{cell.text}</span>{/if}
                    <button
                      type="button"
                      class="citation-trigger"
                      data-title={cell.title ?? ''}
                      data-meta={cell.meta ?? ''}
                      data-venue={cell.venue ?? ''}
                      data-href={cell.href ?? ''}>{cell.marker}</button
                    >
                  {:else if cell.kind === 'tags'}
                    {#if cell.items.length === 0}
                      <span class="rt__empty" title="Not addressed">–</span>
                    {:else}
                      <span class="rt__tags" data-cap={cell.capability} title={cell.title}>
                        {#each cell.items as item}
                          <span class="rt__tag">{item}</span>
                        {/each}
                      </span>
                    {/if}
                  {:else if cell.kind === 'setting'}
                    <span class="rt__setting" title={cell.title}>
                      <span class="rt__setting-glyph">{cell.glyph}</span>
                      {#if cell.value}
                        <span
                          class="rt__setting-value"
                          class:rt__setting-value--noted={cell.note}
                          title={cell.note}>{cell.value}</span
                        >
                      {/if}
                    </span>
                  {:else if cell.kind === 'pills'}
                    {#if cell.items.length === 0}
                      <span class="rt__empty" title="Not reported">–</span>
                    {:else}
                      <span class="rt__pills">
                        {#each cell.items as item}
                          <span
                            class="rt__pill"
                            class:rt__pill--bordered={item.bordered}
                            data-group={item.group}
                            title={item.title}>{item.label}</span
                          >
                        {/each}
                      </span>
                    {/if}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>

      {#if visibleRows.length === 0}
        <p class="rt__none">
          No {unit} match the current search and filters.
          <button type="button" class="rt__reset" onclick={resetAll}>Reset</button>
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .rt {
    /* Row height and type scale live here so the header, body and pinned column can't
       drift apart. */
    --rt-cell-x: 0.7rem;
    --rt-cell-y: 0.5rem;
    --rt-radius: 0.6rem;
  }

  /* ------------------------------------------------------------------ controls */

  .rt__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.7rem 1rem;
    margin-bottom: 0.9rem;
  }

  .rt__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .rt__field-label {
    font-family: var(--font-heading);
    font-size: 0.68rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
  }

  .rt__field select,
  .rt__field input {
    font: inherit;
    font-size: 0.83rem;
    height: 2rem;
    padding: 0 0.55rem;
    color: var(--color-ink);
    background: var(--color-card);
    border: 1px solid var(--color-hairline);
    border-radius: 0.4rem;
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }

  .rt__field select:hover,
  .rt__field input:hover {
    border-color: color-mix(in srgb, var(--color-accent-mid) 45%, var(--color-hairline));
  }

  .rt__field select:focus-visible,
  .rt__field input:focus-visible {
    outline: none;
    border-color: var(--color-accent-mid);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent-mid) 20%, transparent);
  }

  /* An engaged facet reads as engaged without needing to open the select. */
  .rt__select--active {
    border-color: var(--color-accent-mid);
    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-weight: 500;
  }

  .rt__search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .rt__search-icon {
    position: absolute;
    left: 0.55rem;
    display: flex;
    color: color-mix(in srgb, var(--color-ink) 40%, transparent);
    pointer-events: none;
  }

  .rt__field--search input {
    width: min(16rem, 60vw);
    padding-left: 1.85rem;
  }

  .rt__field--search input::-webkit-search-cancel-button {
    cursor: pointer;
  }

  .rt__status {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-left: auto;
    padding-bottom: 0.35rem;
  }

  .rt__count {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--color-ink) 60%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .rt__count strong {
    font-weight: 600;
    color: var(--color-ink);
  }

  .rt__count-of {
    color: color-mix(in srgb, var(--color-ink) 45%, transparent);
  }

  .rt__reset {
    all: unset;
    cursor: pointer;
    font-size: 0.78rem;
    font-family: var(--font-heading);
    color: var(--color-accent);
    border-bottom: 1px dotted var(--color-accent);
  }

  .rt__reset:hover,
  .rt__reset:focus-visible {
    border-bottom-style: solid;
  }

  .rt__reset:focus-visible {
    outline: 2px solid var(--color-accent-mid);
    outline-offset: 2px;
  }

  /* -------------------------------------------------------------------- frame */

  .rt__frame {
    border: 1px solid var(--color-hairline);
    border-radius: var(--rt-radius);
    background: var(--color-card);
    /* Clips the scroll box's square corners to the frame's rounded ones. */
    overflow: hidden;
  }

  .rt__scroll {
    /* The scroll container the sticky header and pinned column resolve against. Capped
       so a 58-row table stays a readable panel rather than a page-length wall. */
    max-height: min(78vh, 54rem);
    overflow: auto;
    overscroll-behavior-x: contain;
  }

  .rt__scroll:focus-visible {
    outline: 2px solid var(--color-accent-mid);
    outline-offset: -2px;
  }

  .rt__table {
    /* The group header row's height, and so the offset the column header row sticks at.
       Fixed rather than measured: both are single lines of rem-sized type, so the value
       scales with the reader's font size and needs no client-side measurement — which
       would leave the two header rows overlapping until the island hydrates. */
    --rt-group-h: 0rem;
    /* Sized to its content, never squeezed into the viewport: columns that need room get
       it and the frame scrolls sideways instead. min-width keeps a narrow table (a
       heavily filtered set) from leaving a gap at the frame's right edge. */
    width: max-content;
    min-width: 100%;
    /* Sticky cells drop collapsed borders, so every cell draws its own. */
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.84rem;
  }

  .rt__table th,
  .rt__table td {
    padding: var(--rt-cell-y) var(--rt-cell-x);
    border-bottom: 1px solid var(--color-hairline);
    text-align: left;
    vertical-align: top;
  }

  .rt__table tbody tr:last-child td {
    border-bottom: 0;
  }

  .rt__table td {
    /* Breaks only words that genuinely don't fit, rather than hyphen-free mid-word
       chopping of ordinary prose. */
    overflow-wrap: break-word;
  }

  /* Long free-text values are truncated to a few lines, with the full text on hover
     (`title`) — a verbose record shouldn't set the height of every row around it. */
  .rt__clamp {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--rt-clamp, 3);
    line-clamp: var(--rt-clamp, 3);
    overflow: hidden;
    line-height: 1.45;
  }

  .rt__col--center { text-align: center; }
  .rt__col--right { text-align: right; }

  .rt__col--numeric {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ------------------------------------------------------------------- header */

  .rt__table thead th {
    position: sticky;
    z-index: 2;
    background: var(--color-paper);
    font-family: var(--font-heading);
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--color-ink);
    white-space: nowrap;
    vertical-align: bottom;
  }

  .rt__table--grouped {
    --rt-group-h: 1.9rem;
  }

  .rt__group-row th {
    top: 0;
    height: var(--rt-group-h);
    padding-top: 0.55rem;
    padding-bottom: 0.3rem;
    text-align: center;
    font-size: 0.68rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
    border-bottom: 0;
  }

  /* Only groups that actually name something get the bracketing rule; ungrouped
     placeholder cells stay blank so the two header rows still line up. */
  .rt__group-cell--named {
    border-bottom: 1px solid var(--color-hairline);
  }

  .rt__head-row th {
    /* Sits directly beneath the group row. */
    top: var(--rt-group-h);
    padding-bottom: 0.45rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-ink) 35%, var(--color-hairline));
  }

  .rt__col--sorted .rt__label {
    color: var(--color-accent);
  }

  .rt__sort {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    font: inherit;
  }

  .rt__col--center .rt__sort,
  .rt__col--right .rt__sort {
    /* Keeps a centred/right-aligned header's glyph beside its label, not adrift. */
    justify-content: inherit;
  }

  .rt__sort:hover .rt__label {
    color: var(--color-accent);
  }

  .rt__sort:focus-visible {
    outline: 2px solid var(--color-accent-mid);
    outline-offset: 2px;
    border-radius: 0.2rem;
  }

  .rt__sort-glyph {
    display: inline-flex;
    color: color-mix(in srgb, var(--color-ink) 30%, transparent);
  }

  .rt__sort:hover .rt__sort-glyph {
    color: color-mix(in srgb, var(--color-accent) 55%, transparent);
  }

  /* Both carets sit at rest; the active direction lights up and the other recedes, so
     the control never shifts as it cycles. */
  .rt__caret {
    opacity: 0.55;
  }

  .rt__sort-glyph[data-state='ascending'],
  .rt__sort-glyph[data-state='descending'] {
    color: var(--color-accent);
  }

  .rt__sort-glyph[data-state='ascending'] .rt__caret--up,
  .rt__sort-glyph[data-state='descending'] .rt__caret--down {
    opacity: 1;
  }

  .rt__sort-glyph[data-state='ascending'] .rt__caret--down,
  .rt__sort-glyph[data-state='descending'] .rt__caret--up {
    opacity: 0.15;
  }

  /* ----------------------------------------------------------- pinned column */

  .rt__pin {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--color-card);
    /* Drawn rather than bordered: a border on a sticky cell would scroll away with the
       cell's own box, this hairline stays welded to the pinned edge. */
    box-shadow: inset -1px 0 0 var(--color-hairline);
  }

  /* Selector deliberately as specific as `.rt__table thead th` above, which would
     otherwise win and leave the following header cells painting over the pinned one. */
  .rt__table thead .rt__pin {
    /* Above both the rest of the sticky header and the pinned body column. */
    z-index: 3;
    background: var(--color-paper);
  }

  /* -------------------------------------------------------------------- rows */

  .rt__table tbody tr:nth-child(even) > td {
    background: color-mix(in srgb, var(--color-ink) 3%, var(--color-card));
  }

  .rt__table tbody tr:hover > td {
    background: var(--color-accent-tint);
  }

  .rt__empty {
    color: color-mix(in srgb, var(--color-ink) 35%, transparent);
  }

  /*
    Mirrors Citation.astro's scoped .citation-trigger styling — that style can't reach
    markup rendered inside this island, but the site-wide <CitationLayer client:idle /> in
    BaseLayout.astro picks the triggers up through event delegation, so the hover cards
    work here exactly as they do in paper prose. Keep in sync with Citation.astro.
  */
  .citation-trigger {
    all: unset;
    cursor: pointer;
    color: var(--color-accent);
    border-bottom: 1px dotted var(--color-accent);
    font: inherit;
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .citation-trigger:hover,
  .citation-trigger:focus-visible {
    border-bottom-style: solid;
  }

  .citation-trigger:focus-visible {
    outline: 2px solid var(--color-accent-mid);
    outline-offset: 2px;
  }

  .rt__cite-text {
    font-family: var(--font-heading);
    font-weight: 500;
  }

  /* --- cell kinds, mirroring PaperTableCell.astro --- */

  .rt__tags,
  .rt__pills {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .rt__tag {
    display: inline-block;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-family: var(--font-mono);
    line-height: 1.5;
    white-space: nowrap;
    background: color-mix(in srgb, var(--tag-color, var(--color-ink)) 10%, white);
    color: color-mix(in srgb, var(--tag-color, var(--color-ink)) 82%, black);
    border: 1px solid color-mix(in srgb, var(--tag-color, var(--color-ink)) 28%, transparent);
  }

  .rt__tags[data-cap='interpretation'] .rt__tag { --tag-color: var(--color-cap-interpretation); }
  .rt__tags[data-cap='retrieval'] .rt__tag { --tag-color: var(--color-cap-data-retrieval); }
  .rt__tags[data-cap='analysis'] .rt__tag { --tag-color: var(--color-cap-analytical); }
  .rt__tags[data-cap='output'] .rt__tag { --tag-color: var(--color-cap-output-synthesis); }
  .rt__tags[data-cap='governance'] .rt__tag { --tag-color: var(--color-cap-process-governance); }

  .rt__setting {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    white-space: nowrap;
  }

  .rt__setting-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5em;
    padding: 0 0.15em;
    border-radius: 0.3rem;
    background: var(--color-accent-tint);
    color: var(--color-accent);
    font-family: var(--font-mono);
    font-size: 0.73rem;
    font-weight: 600;
  }

  .rt__setting-value {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--color-ink) 70%, transparent);
  }

  /* Marks a value whose reported qualification is available on hover. */
  .rt__setting-value--noted {
    border-bottom: 1px dotted color-mix(in srgb, var(--color-ink) 40%, transparent);
    cursor: help;
  }

  .rt__pill {
    display: inline-block;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-family: var(--font-mono);
    line-height: 1.5;
    white-space: nowrap;
    background: color-mix(in srgb, var(--color-ink) 7%, white);
    color: color-mix(in srgb, var(--color-ink) 80%, transparent);
    border: 1px solid transparent;
  }

  /* Unfilled and muted rather than accent-coloured on purpose: this marks an instance that
     only partially fits the pill's category (it targets an artifact, not an insight), so it
     should read as fainter than a plain pill, not as a highlighted/positive one — the
     accent colour is reserved for actual emphasis elsewhere on the page. */
  .rt__pill--bordered {
    background: transparent;
    border-color: color-mix(in srgb, var(--color-ink) 30%, transparent);
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
  }

  .rt__none {
    margin: 0;
    padding: 2.5rem 1rem;
    text-align: center;
    font-size: 0.9rem;
    color: color-mix(in srgb, var(--color-ink) 60%, transparent);
  }

  @media (max-width: 40rem) {
    .rt__status {
      margin-left: 0;
    }

    .rt__field--search input {
      width: min(100%, 20rem);
    }
  }
</style>
