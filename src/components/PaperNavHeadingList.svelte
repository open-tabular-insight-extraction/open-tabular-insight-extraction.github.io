<script>
  export let headings = [];
  export let activePath = [];
  export let onNavigate;
  export let depth = 1;
</script>

<ul class="paper-nav__sublist" style={`--depth: ${depth}`}>
  {#each headings as node (node.anchor)}
    {@const isActive = activePath[activePath.length - 1] === node.anchor}
    {@const isExpanded = activePath.includes(node.anchor) && node.children.length > 0}
    <li>
      <button
        class="paper-nav__link paper-nav__link--sub"
        class:active={isActive}
        on:click={() => onNavigate(node.anchor)}
      >
        <span class="paper-nav__number">{node.number}</span>
        {node.title}
      </button>
      {#if isExpanded}
        <svelte:self headings={node.children} {activePath} {onNavigate} depth={depth + 1} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .paper-nav__sublist {
    list-style: none;
    margin: 0.25rem 0 0.25rem 0;
    padding-left: calc(0.6rem * var(--depth, 1));
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-left: 1px solid var(--color-hairline);
  }

  .paper-nav__link--sub {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.35rem 0.6rem;
    background: none;
    border: none;
    border-left: 2px solid transparent;
    color: color-mix(in srgb, var(--color-ink) 80%, transparent);
    cursor: pointer;
    font-family: var(--font-heading);
    font-size: 0.82rem;
    line-height: 1.4;
    border-radius: 0.2rem;
    transition: all 160ms ease;
  }

  .paper-nav__link--sub:hover {
    background: var(--color-accent-tint);
    color: var(--color-accent);
  }

  .paper-nav__link--sub:focus-visible {
    outline: 2px solid var(--color-accent-mid);
    outline-offset: -2px;
  }

  .paper-nav__link--sub.active {
    background: var(--color-accent-tint);
    color: var(--color-accent);
    border-left-color: var(--color-accent);
    font-weight: 500;
  }

  .paper-nav__number {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--color-ink) 55%, transparent);
    margin-right: 0.4em;
  }

  .paper-nav__link--sub.active .paper-nav__number {
    color: var(--color-accent);
  }
</style>
