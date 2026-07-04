<script lang="ts">
  import { Heart, Copyright } from "@lucide/svelte";
</script>

<div class="made-with-wrapper">
  <div class="plaque">
    <div class="col-made">made with</div>
    <div class="col-love">
      <a href="https://github.com/sponsors/thuvasooriya" target="_blank" rel="noopener noreferrer" aria-label="GitHub Sponsors">
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
    <a href="https://github.com/thuvasooriya/askdjinn" target="_blank" rel="noopener noreferrer" aria-label="Source on GitHub">
      <svg width="11" height="11" class="gh-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.001 2c-5.525 0-10 4.475-10 10a9.99 9.99 0 0 0 6.837 9.488c.5.087.688-.213.688-.476c0-.237-.013-1.024-.013-1.862c-2.512.463-3.162-.612-3.362-1.175c-.113-.288-.6-1.175-1.025-1.413c-.35-.187-.85-.65-.013-.662c.788-.013 1.35.725 1.538 1.025c.9 1.512 2.337 1.087 2.912.825c.088-.65.35-1.087.638-1.337c-2.225-.25-4.55-1.113-4.55-4.938c0-1.088.387-1.987 1.025-2.687c-.1-.25-.45-1.275.1-2.65c0 0 .837-.263 2.75 1.024a9.3 9.3 0 0 1 2.5-.337c.85 0 1.7.112 2.5.337c1.913-1.3 2.75-1.024 2.75-1.024c.55 1.375.2 2.4.1 2.65c.637.7 1.025 1.587 1.025 2.687c0 3.838-2.337 4.688-4.562 4.938c.362.312.675.912.675 1.85c0 1.337-.013 2.412-.013 2.75c0 .262.188.574.688.474A10.02 10.02 0 0 0 22 12c0-5.525-4.475-10-10-10"/>
      </svg>
    </a>
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

  :global(.copy-icon),
  :global(.gh-icon) {
    color: var(--color-muted-foreground);
  }
  :global(.gh-icon):hover {
    color: var(--color-foreground);
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
