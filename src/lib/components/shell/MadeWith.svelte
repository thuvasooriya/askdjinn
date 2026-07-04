<script lang="ts">
  import { Heart, Copyright } from "@lucide/svelte";
</script>

<div class="made-with-wrapper">
  <div class="plaque">
    <div class="col-made">made with</div>
    <div class="col-love">
      <a href="https://github.com/thuvasooriya" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
        <Heart size={18} class="love-icon" />
      </a>
    </div>
    <div class="col-for-from">
      <span>for</span>
      <span>from</span>
    </div>
    <div class="col-sl">
      <img src="/brand/sl-icon.svg" width="28" height="26" alt="Sri Lanka" draggable="false" />
    </div>
  </div>
  <div class="subtitle">
    <Copyright size={11} class="copy-icon" />
    <span>{new Date().getFullYear()}</span>
    <a href="https://www.thuvasooriya.me/" target="_blank" rel="noopener noreferrer">thuvasooriya</a>
  </div>
</div>

<style>
  .made-with-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    /* Anchored to the bottom of the welcome step's flex column. */
    margin-top: auto;
    padding-top: 1.25rem;
    font-family: var(--font-mono);
  }

  .plaque {
    display: grid;
    grid-template-columns: auto auto auto auto;
    align-items: center;
    gap: 0 0.6rem;
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-lg);
    padding: 0.5rem 1rem;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: var(--shadow-sm);
  }

  .col-made {
    grid-row: 1 / 3;
    grid-column: 1;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-foreground);
    text-transform: lowercase;
  }

  .col-love {
    grid-row: 1 / 3;
    grid-column: 2;
    display: flex;
    align-items: center;
  }

  :global(.love-icon) {
    color: var(--color-primary);
    fill: var(--color-primary);
    transition: transform 0.2s;
  }

  :global(.love-icon):hover {
    transform: scale(1.15);
  }

  .col-for-from {
    grid-row: 1 / 3;
    grid-column: 3;
    display: flex;
    flex-direction: column;
    justify-content: center;
    font-size: 0.65rem;
    line-height: 1.2;
    color: var(--color-muted-foreground);
    text-align: left;
    text-transform: lowercase;
  }

  /* Sri Lanka emblem: clean rounded-rect container, emblem shown whole via
     object-fit: contain (the old circular crop + empty backing group made the
     rectangular lion emblem read as broken fragments). */
  .col-sl {
    grid-row: 1 / 3;
    grid-column: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 26px;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .col-sl img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    pointer-events: none;
  }

  .subtitle {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: 0.65rem;
    color: var(--color-muted-foreground);
  }

  :global(.copy-icon) {
    color: var(--color-muted-foreground);
  }

  .subtitle a {
    color: inherit;
    text-decoration: none;
    transition: color 0.2s;
  }
  .subtitle a:hover {
    color: var(--color-foreground);
    text-decoration: underline;
  }
</style>
