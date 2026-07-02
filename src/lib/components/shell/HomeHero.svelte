<script lang="ts">
  import { useProfile } from '$lib/stores/profile.svelte';
  import { useChat } from '$lib/stores/chat.svelte';
  import { useLists } from '$lib/stores/lists.svelte';
  import { useSession } from '$lib/stores/session.svelte';
  import * as persist from '$lib/stores/persistence';
  import { Package, Search, Gift, Truck, Cake, Star, Heart, Bell, RefreshCw, ShoppingCart } from '@lucide/svelte';
  import { fade, fly } from 'svelte/transition';
  import { untrack, onDestroy } from 'svelte';
  import { useUI } from '$lib/stores/ui.svelte';
  import { renderMarkdown } from '$lib/markdown';
  import { DEFAULT_SUGGESTION_ICON, type SuggestionIconKey } from '$lib/suggestion-icons';

  const profile = useProfile();
  const chat = useChat();
  const lists = useLists();
  const session = useSession();
  const ui = useUI();

  // ── Intro state machine ─────────────────────────────────
  type IntroStep = 'spawn' | 'greet' | 'summon' | 'settle' | 'idle';
  let introStep = $state<IntroStep>('spawn');

  // ── Data from helper agent ──────────────────────────────
  let greeting = $state('');
  let summary = $state('');
  let summaryCheckedAt = $state<string | null>(null);
  let suggestions = $state<Array<{ label: string; query: string; icon: SuggestionIconKey }>>([]);

  // ── Orb hold/summon interaction ─────────────────────────
  let holding = $state(false);
  let holdProgress = $state(0);
  let cooldown = $state(false);
  let cooldownRemaining = $state(0);
  let cooldownInterval: ReturnType<typeof setInterval> | null = null;
  let progressRAF: number | null = null;
  let holdStartTime = 0;

  // ── Working / refresh indicators ────────────────────────
  let summoning = $state(false);
  let bubbleUpdating = $state(false);

  const SUMMARY_STORE_ID = 'home-summary';
  const VERSION = 1;
  const TTL_MS = 86_400_000;

  function summarySnapshot() {
    return {
      liked: lists.liked.map(e => ({ id: e.product.id, name: e.product.name, price: e.product.price, currency: e.product.currency, inStock: e.product.inStock })),
      watch: lists.watch.map(e => ({ id: e.product.id, name: e.product.name, price: e.product.price, currency: e.product.currency, inStock: e.product.inStock, targetPrice: e.targetPrice })),
      orderHistory: session.orderHistory,
      preferences: profile.savedFacts.filter(f => f.confirmed).map(f => ({ label: f.text, value: f.text, category: f.category })),
      city: profile.preferredCity ?? undefined,
    };
  }

  function hasContextData() {
    return lists.liked.length > 0 || lists.watch.length > 0 || session.orderHistory.length > 0;
  }

  // ── API calls (all use cerebras/gemma-4-31b server-side) ──

  async function fetchGreeting(): Promise<string> {
    // Always fetch fresh so every visit gets a unique greeting.
    const t0 = performance.now();
    try {
      const res = await fetch('/api/home-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(untrack(() => ({
          agentName: profile.agent.name,
          agentTagline: profile.agent.tagline,
          isReturningUser: session.isReturningUser,
          userName: profile.savedFacts.find(f => f.category === 'preference' && /name/i.test(f.text))?.text ?? null,
          preferredCity: profile.preferredCity,
          language: profile.language,
        }))),
      });
      const data = await res.json();
      console.debug(`[home] greeting ${res.ok ? 'ok' : res.status} ${Math.round(performance.now() - t0)}ms`);
      if (!res.ok) return `Hi, I'm ${profile.agent.name}`;
      return data.greeting || `Hi, I'm ${profile.agent.name}`;
    } catch (e) {
      console.warn('[home] greeting failed', e);
      return `Hi, I'm ${profile.agent.name}`;
    }
  }

  async function fetchSummary(force = false): Promise<void> {
    const cached = persist.load<{ summary: string; checkedAt: string } | null>(SUMMARY_STORE_ID, VERSION, null);
    if (!force && cached && Date.now() - new Date(cached.checkedAt).getTime() < TTL_MS) {
      summary = cached.summary;
      summaryCheckedAt = cached.checkedAt;
      return;
    }
    if (!hasContextData()) return;
    const t0 = performance.now();
    try {
      const res = await fetch('/api/home-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(untrack(() => summarySnapshot())),
      });
      const data = await res.json();
      console.debug(`[home] summary ${res.ok ? 'ok' : res.status} ${Math.round(performance.now() - t0)}ms`);
      if (data.summary) {
        summary = data.summary;
        summaryCheckedAt = data.checkedAt;
        persist.save(SUMMARY_STORE_ID, VERSION, { summary, checkedAt: summaryCheckedAt });
      }
    } catch (e) {
      console.warn('[home] summary failed', e);
    }
  }

  async function fetchSuggestions(): Promise<void> {
    // Always fetch fresh from gemma so cards reflect current context and vary.
    const t0 = performance.now();
    try {
      const res = await fetch('/api/home-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(untrack(() => ({
          liked: lists.liked.map((l: { product: { name: string; price?: number; inStock?: boolean } }) => ({ name: l.product.name, price: l.product.price, inStock: l.product.inStock })),
          watch: lists.watch.map((w: { product: { name: string }; targetPrice?: number }) => ({ name: w.product.name, targetPrice: w.targetPrice })),
          orderHistory: session.orderHistory,
          preferredCity: profile.preferredCity,
          recentSearches: ui.searchThreads.map(t => t.query).slice(0, 5),
          savedFacts: profile.savedFacts.filter(f => f.confirmed).map(f => f.text),
        }))),
      });
      const data = await res.json();
      console.debug(`[home] suggestions ${res.ok ? 'ok' : res.status} ${Math.round(performance.now() - t0)}ms`);
      if (data.suggestions?.length) {
        suggestions = data.suggestions.slice(0, 3);
      }
    } catch (e) {
      console.warn('[home] suggestions failed', e);
    }
  }

  // ── Intro orchestration ─────────────────────────────────
  // Timeline is decoupled from network latency: the orb animates on a schedule
  // and data fades in whenever it lands. Cerebras calls are SERIALIZED
  // (greeting -> summary -> suggestions) so we never fire a concurrent burst
  // that trips gemma's rate limit and triggers multi-second retry backoff --
  // that burst was what made the orb look "stuck" after the greeting.
  async function runIntro() {
    introStep = 'spawn';
    await delay(400);

    greeting = await fetchGreeting();
    introStep = 'greet';
    await delay(450);

    // Summon: orb shows its working animation while summary loads (capped).
    introStep = 'summon';
    await summonSummary(false);

    // Settle; fire suggestions AFTER summary so we never hit cerebras twice at once.
    introStep = 'settle';
    void fetchSuggestions();
    await delay(450);
    introStep = 'idle';
  }

  // Summary fetch with a working indicator + a safety timeout, so the UI can
  // never hang on a slow/stuck gemma call. `glow` flashes the bubble (hold-refresh).
  async function summonSummary(force: boolean, glow = false): Promise<void> {
    summoning = true;
    try {
      await Promise.race([fetchSummary(force), delay(6000)]);
      if (glow) bubbleUpdating = true;
    } finally {
      summoning = false;
    }
  }

  function delay(ms: number): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, ms);
    return promise;
  }

  // ── Orb hold interaction ────────────────────────────────
  function startHold(e?: PointerEvent) {
    if (cooldown) return;
    if (e && e.button !== 0) return;
    holding = true;
    holdProgress = 0;
    holdStartTime = performance.now();

    function tick(now: number) {
      const elapsed = now - holdStartTime;
      const progress = Math.min(1, elapsed / 1200);
      holdProgress = progress;
      if (progress >= 1) {
        untrack(() => {
          holding = false;
          holdProgress = 0;
          void summonSummary(true, true);
          startCooldown();
        });
        return;
      }
      progressRAF = requestAnimationFrame(tick);
    }
    progressRAF = requestAnimationFrame(tick);
  }

  function endHold() {
    holding = false;
    holdProgress = 0;
    if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; }
  }

  function startCooldown() {
    cooldown = true;
    cooldownRemaining = 5;
    if (cooldownInterval) clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
      cooldownRemaining--;
      if (cooldownRemaining <= 0) {
        if (cooldownInterval) { clearInterval(cooldownInterval); cooldownInterval = null; }
        cooldown = false;
      }
    }, 1000);
  }

  // Predetermined icon set -> lucide component. Single source of truth lives in
  // $lib/suggestion-icons; this is the client-side key->component mapping.
  const SUGGESTION_ICONS: Record<SuggestionIconKey, typeof Search> = {
    track: Package, search: Search, gift: Gift, delivery: Truck, cake: Cake,
    star: Star, heart: Heart, bell: Bell, refresh: RefreshCw, cart: ShoppingCart,
  };

  const staticHints: Array<{ label: string; query: string; icon: SuggestionIconKey }> = [
    { label: 'Cakes under LKR 8000', query: 'find chocolate cakes under 8000', icon: 'cake' },
    { label: 'Birthday gifts in Colombo', query: 'gift ideas for a birthday in Colombo', icon: 'gift' },
    { label: 'Track VPAY827982BA', query: 'track my order VPAY827982BA', icon: 'track' },
  ];
  const displayHints = $derived(
    introStep === 'idle' ? (suggestions.length > 0 ? suggestions : staticHints) : []
  );

  onDestroy(() => {
    if (progressRAF) cancelAnimationFrame(progressRAF);
    if (cooldownInterval) clearInterval(cooldownInterval);
  });

  // Kick off the intro on mount
  $effect(() => {
    if (introStep !== 'spawn') return;
    void runIntro();
  });
</script>

<div class="home-hero" data-step={introStep}>
  <!-- Greeting -->
  {#if introStep !== 'spawn'}
    <div class="greeting-zone" transition:fade={{ duration: 400 }}>
      <p class="greeting-text">{greeting || `Hi, I'm ${profile.agent.name}`}</p>
    </div>
  {/if}

  <!-- Smoke bubble (summary, light markdown) -->
  {#if summary}
    <section class="smoke-bubble" class:updating={bubbleUpdating}
      onanimationend={() => (bubbleUpdating = false)}
      transition:fly={{ y: 16, duration: 400 }}>
      <div class="smoke-text">{@html renderMarkdown(summary)}</div>
    </section>
  {/if}

  <!-- Orb resting on a divider rail, between summary and suggestions -->
  <div class="orb-rail">
    <span class="rail-line"></span>
    <div class="orb-zone" class:holding class:loading={holdProgress > 0} class:summoning={summoning}>
      {#if holdProgress > 0}
        <svg class="hold-ring" viewBox="0 0 120 120" transition:fade={{ duration: 100 }}>
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-primary)" stroke-width="3"
            stroke-dasharray="314.16" stroke-dashoffset={314.16 * (1 - holdProgress)} stroke-linecap="round" />
        </svg>
      {/if}
      <button
        type="button"
        class="orb-btn"
        class:cooldown
        onpointerdown={startHold}
        onpointerup={endHold}
        onpointerleave={endHold}
        aria-label="Summon summary"
        title={cooldown ? `Cooldown (${cooldownRemaining}s)` : 'Hold to summon'}
        disabled={cooldown}
      >
        <span class="orb-core"></span>
      </button>
    </div>
    <span class="rail-line"></span>
    {#if summaryCheckedAt}
      <span class="orb-tooltip">Last summoned {new Date(summaryCheckedAt).toLocaleTimeString()}</span>
    {/if}
  </div>

  <!-- Suggestion cards (idle only): horizontal scroll-snap row with icons -->
  {#if introStep === 'idle' && displayHints.length}
    <ul class="suggestion-list">
      {#each displayHints as hint, i (hint.query)}
        {@const Icon = SUGGESTION_ICONS[hint.icon] ?? SUGGESTION_ICONS[DEFAULT_SUGGESTION_ICON]}
        <li class="suggestion-card" style="animation-delay: {i * 70}ms">
          <button type="button" class="suggestion-btn" onclick={() => chat.send(hint.query)}>
            <Icon class="card-icon" />
            <span class="card-label">{hint.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .home-hero {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 1.1rem;
    padding: 1.5rem 1rem;
    max-width: 24rem;
    margin: 0 auto;
  }

  /* ── Greeting ──────────────────────────────────────────── */
  .greeting-zone {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .greeting-text {
    font-family: var(--font-display);
    font-size: clamp(1.15rem, 3vw, 1.4rem);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--color-foreground);
    margin: 0;
  }

  /* ── Smoke Bubble (summary) ────────────────────────────── */
  .smoke-bubble {
    position: relative;
    overflow: hidden;
    width: min(100%, 22rem);
    padding: 0.875rem 1rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-xl);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 6%, transparent), transparent 60%),
      color-mix(in srgb, var(--color-surface) 72%, transparent);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    box-shadow: var(--shadow-float);
    text-align: left;
  }
  .smoke-text {
    margin: 0;
    font-size: var(--fs-md);
    line-height: 1.55;
    color: var(--color-foreground);
  }
  /* Light markdown rendering (bold key terms); reset stray block margins */
  .smoke-text :global(p) { margin: 0; }
  .smoke-text :global(* + *) { margin-top: 0.4em; }
  .smoke-text :global(strong) { font-weight: 650; color: var(--color-foreground); }
  /* Refresh sweep: a glow wipes across the bubble when the summary updates */
  .smoke-bubble.updating::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(110deg,
      transparent 30%,
      color-mix(in srgb, var(--color-accent) 38%, transparent) 50%,
      transparent 70%);
    transform: translateX(-120%);
    animation: bubble-sweep 1.1s ease;
    pointer-events: none;
  }
  @keyframes bubble-sweep {
    to { transform: translateX(120%); }
  }

  /* ── Orb rail (divider with the orb resting on it) ─────── */
  .orb-rail {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: min(100%, 22rem);
  }
  .rail-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--color-border-subtle), transparent);
  }

  /* ── CSS Gradient Orb ──────────────────────────────────── */
  .orb-zone {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4.5rem;
    height: 4.5rem;
    transform: translateY(0) scale(1);
    opacity: 1;
    transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease;
  }
  /* Intro: orb drops into its rail rest spot from above */
  .home-hero[data-step="spawn"] .orb-zone { transform: translateY(-3rem) scale(1.3); opacity: 0.5; }
  .home-hero[data-step="greet"] .orb-zone { transform: translateY(-1.8rem) scale(1.05); opacity: 1; }
  .home-hero[data-step="summon"] .orb-zone { transform: translateY(-0.6rem) scale(1); opacity: 1; }
  .home-hero[data-step="settle"] .orb-zone { transform: translateY(0) scale(0.7); opacity: 1; }
  .home-hero[data-step="idle"] .orb-zone { transform: translateY(0) scale(0.55); opacity: 1; }

  .orb-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    border: none;
    border-radius: var(--radius-full);
    background: none;
    cursor: pointer;
    outline: none;
    padding: 0;
    transition: transform 0.2s ease;
  }
  .orb-btn:active { transform: scale(0.94); }
  .orb-btn.cooldown { opacity: 0.4; cursor: not-allowed; }

  .orb-core {
    display: block;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: var(--radius-full);
    background: radial-gradient(circle at 35% 35%,
      color-mix(in srgb, var(--color-accent) 60%, white 20%),
      var(--color-primary) 60%,
      color-mix(in srgb, var(--color-primary) 70%, black 30%) 100%);
    box-shadow:
      0 0 20px color-mix(in srgb, var(--color-primary) 40%, transparent),
      0 0 40px color-mix(in srgb, var(--color-primary) 20%, transparent),
      inset 0 1px 2px rgba(255, 255, 255, 0.3);
    transition: box-shadow 0.3s ease, transform 0.3s ease;
  }
  .orb-zone.holding .orb-core {
    animation: orb-pulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes orb-pulse {
    from {
      box-shadow:
        0 0 20px color-mix(in srgb, var(--color-primary) 40%, transparent),
        0 0 40px color-mix(in srgb, var(--color-primary) 20%, transparent);
      transform: scale(1);
    }
    to {
      box-shadow:
        0 0 32px color-mix(in srgb, var(--color-accent) 50%, transparent),
        0 0 64px color-mix(in srgb, var(--color-accent) 25%, transparent);
      transform: scale(1.08);
    }
  }

  /* Orb "working" indicator while a summary is being summoned */
  .orb-zone.summoning .orb-core {
    animation: orb-processing 0.95s ease-in-out infinite;
  }
  @keyframes orb-processing {
    0%, 100% {
      transform: scale(1);
      box-shadow:
        0 0 20px color-mix(in srgb, var(--color-primary) 40%, transparent),
        0 0 40px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }
    50% {
      transform: scale(1.12);
      box-shadow:
        0 0 30px color-mix(in srgb, var(--color-accent) 55%, transparent),
        0 0 60px color-mix(in srgb, var(--color-accent) 30%, transparent);
    }
  }

  .hold-ring {
    position: absolute;
    width: 5rem;
    height: 5rem;
    z-index: 2;
    pointer-events: none;
  }

  /* ── Orb tooltip (last summoned time, on hover) ────────── */
  .orb-tooltip {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 50%;
    transform: translateX(-50%) translateY(3px);
    white-space: nowrap;
    font-size: var(--fs-xs);
    color: var(--color-foreground);
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    border: 1px solid var(--color-border-subtle);
    padding: 0.25rem 0.55rem;
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    pointer-events: none;
    z-index: 5;
    opacity: 0;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }
  /* Reveal when the resting orb is hovered (tooltip is a later sibling) */
  .orb-zone:hover ~ .orb-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  /* ── Suggestion cards ──────────────────────────────────── */
  .suggestion-list {
    width: min(100%, 24rem);
    margin: 0;
    padding: 0.15rem 0.25rem;
    list-style: none;
    display: flex;
    flex-direction: row;
    gap: 0.55rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }
  /* Desktop: plenty of room -- drop the scroll, show every card. */
  @media (min-width: 640px) {
    .suggestion-list {
      flex-wrap: wrap;
      justify-content: center;
      overflow-x: visible;
      scroll-snap-type: none;
    }
  }
  .suggestion-card {
    flex: 0 0 auto;
    scroll-snap-align: start;
    width: 6.75rem;
    height: 6rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-surface) 60%, transparent);
    backdrop-filter: blur(8px);
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
    animation: suggest-in 0.4s ease backwards;
  }
  .suggestion-card:hover {
    border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
    background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
    transform: translateY(-2px);
  }
  .suggestion-btn {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.6rem 0.5rem;
    background: none;
    border: none;
    color: var(--color-muted-foreground);
    font: inherit;
    cursor: pointer;
    text-align: center;
  }
  /* Icon class is forwarded onto the lucide component -> use :global */
  .suggestion-btn :global(.card-icon) {
    color: var(--color-primary);
    width: 1.5rem;
    height: 1.5rem;
    flex: 0 0 auto;
  }
  .card-label {
    font-size: var(--fs-xs);
    line-height: 1.25;
    color: var(--color-foreground);
    white-space: normal;
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    line-clamp: 3;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  @keyframes suggest-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb-core, .suggestion-card, .orb-tooltip { transition-duration: 0.01ms; animation: none; }
    .orb-zone.summoning .orb-core,
    .smoke-bubble.updating::after { animation: none; }
  }
</style>
