<script lang="ts">
  import { fade } from "svelte/transition";
  import { onDestroy, onMount, untrack } from "svelte";
  import { useProfile, type Language, type AgentId, type ThemeId } from "$lib/stores/profile.svelte";
  import { AGENT_LIST } from "$lib/agents";
  import { THEME_LIST } from "$lib/themes";
  import { Check, type ComponentType, languageIcons } from "$lib/icons";
  import { Sun, Moon, Sparkles, ArrowRight } from "@lucide/svelte";
  import AgentOrb from "./AgentOrb.svelte";
  import Button from "$lib/ui/Button.svelte";
  import DjinnBrand from "$lib/components/brand/DjinnBrand.svelte";
  import BrailleSpinner from "$lib/ui/BrailleSpinner.svelte";

  const profile = useProfile();

  let step = $state(0);
  let selectedLang = $state<Language>(profile.language);
  let selectedAgent = $state<AgentId>(profile.agentId);
  let selectedTheme = $state<ThemeId>(profile.themeId);
  let selectedCity = $state<string>(profile.preferredCity ?? "");
  let cityQuery = $state(profile.preferredCity ?? "");
  let cityResults = $state<string[]>(["Colombo", "Kandy", "Galle", "Negombo", "Nugegoda"]);
  let cityDropdownOpen = $state(false);
  let cityLoading = $state(false);
  let cityDropdownEl = $state<HTMLElement>();
  let selectedGender = $state<string>("Not specified");
  let selectedAllergies = $state<string>("");
  let selectedNotes = $state<string>("");
  let hasMicPermission = $state(false);
  let themeDropdownOpen = $state(false);
  let dropdownEl = $state<HTMLElement>();

  function selectTheme(id: ThemeId) {
    selectedTheme = id;
    themeDropdownOpen = false;
  }
  onMount(async () => {
    if (navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({ name: "microphone" as any });
        hasMicPermission = result.state === "granted";
        if (hasMicPermission) {
          micState = "granted";
        }
        result.onchange = () => {
          hasMicPermission = result.state === "granted";
          if (hasMicPermission) {
            micState = "granted";
          } else if (result.state === "denied") {
            micState = "denied";
          } else {
            micState = "idle";
          }
        };
      } catch (e) {}
    }
  });

  let micState = $state<"idle" | "requesting" | "granted" | "denied" | "unsupported">("idle");
  let micLevel = $state(0);
  let micStream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let micAnimFrame = 0;

  const languages: { value: Language; label: string; sub: string; icon: ComponentType }[] = [
    { value: "english", label: "English", sub: "All responses in English", icon: languageIcons.english },
    { value: "sinhala", label: "සිංහල", sub: "Sinhala + English mix", icon: languageIcons.sinhala },
    { value: "tamil", label: "தமிழ்", sub: "Tamil + English mix", icon: languageIcons.tamil },
  ];

  const totalSteps = $derived(hasMicPermission ? 3 : 4);

  async function requestMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      micState = "unsupported";
      return;
    }
    micState = "requesting";
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micState = "granted";

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        micLevel = Math.min(1, avg / 80);
        micAnimFrame = requestAnimationFrame(tick);
      }
      tick();
    } catch (err) {
      micState = "denied";
    }
  }

  function stopMic() {
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    if (micAnimFrame) cancelAnimationFrame(micAnimFrame);
    analyser = null;
  }

  function next() {
    if (step < totalSteps - 1) { step++; return; }
    finish();
  }

  function finish() {
    stopMic();
    profile.setLanguage(selectedLang);
    profile.setAgent(selectedAgent);
    profile.setTheme(selectedTheme);
    if (selectedCity.trim()) profile.setPreferredCity(selectedCity.trim());

    if (selectedGender !== "Not specified") {
      profile.addFact(`Preferred gender/salutation: ${selectedGender}`, "preference");
    }
    if (selectedAllergies.trim()) {
      profile.addFact(`Dietary restrictions/allergies: ${selectedAllergies.trim()}`, "allergy");
    }
    if (selectedNotes.trim()) {
      profile.addFact(`Additional note: ${selectedNotes.trim()}`, "preference");
    }

    profile.setMicTested(micState === "granted");
    profile.completeOnboarding();
  }
  // Query matching delivery cities from Kapruka MCP backend as user types
  $effect(() => {
    const q = cityQuery.trim();
    untrack(async () => {
      if (q.length < 2) {
        cityResults = ["Colombo", "Kandy", "Galle", "Negombo", "Nugegoda"];
        return;
      }
      cityLoading = true;
      try {
        const res = await fetch(`/api/delivery-cities?q=${encodeURIComponent(q)}&limit=15`);
        const data = await res.json();
        if (data.cities) {
          cityResults = data.cities.map((c: any) => typeof c === "string" ? c : c.name || String(c));
        }
      } catch (e) {
        console.error("City autocomplete failed:", e);
      } finally {
        cityLoading = false;
      }
    });
  });

  function skip() {
    stopMic();
    profile.completeOnboarding();
  }

  $effect(() => {
    profile.previewAgent(selectedAgent);
  });
  $effect(() => {
    profile.previewTheme(selectedTheme);
  });

  onDestroy(() => stopMic());
</script>

<svelte:window onclick={(e) => {
  if (themeDropdownOpen && dropdownEl && !dropdownEl.contains(e.target as Node)) themeDropdownOpen = false;
  if (cityDropdownOpen && cityDropdownEl && !cityDropdownEl.contains(e.target as Node)) cityDropdownOpen = false;
}} />

<div class="onboarding-overlay" transition:fade={{ duration: 300 }}>
  <div class="gradient-glow pointer-events-none fixed inset-0"></div>

  <div class="onboarding-card">
    <div class="step-container-grid">
      {#if step === 0}
      <div class="welcome-step" transition:fade={{ duration: 200 }}>
        <div class="welcome-brand-wrap">
          <DjinnBrand size={160} />
        </div>

        <h1 class="welcome-headline">wish it get it</h1>

        <div class="welcome-actions-row">
          <button type="button" class="welcome-cta" onclick={next}>
            <BrailleSpinner name="cascade" size="sm" label="Loading" />
            <span>get your wish</span>
            <ArrowRight class="welcome-arrow" size={18} />
          </button>
          <button type="button" class="welcome-skip" onclick={skip}>skip</button>
        </div>

        <p class="welcome-footer">Made with love 🇱🇰</p>
      </div>


    {:else if step === 1}
      <!-- Customize Djinn: Lang, Agent, Theme -->
      <div class="step-panel" transition:fade={{ duration: 200 }}>
        <div class="step-header">
          <p class="step-number">Step 1 of {totalSteps - 1}</p>
          <h2 class="step-title">Customize your Djinn</h2>
          <p class="step-subtitle">Configure your language, assistant personality, and theme in one place.</p>
        </div>

        <div class="unified-config-scroll overflow-y-auto px-4 py-1 space-y-5 max-h-[58vh]">
          <!-- 1. Language Selection -->
          <div class="section-group">
            <span class="section-label">Preferred Language</span>
            <div class="grid grid-cols-3 gap-2 mt-2">
              {#each languages as lang (lang.value)}
                <button
                  type="button"
                  onclick={() => selectedLang = lang.value}
                  class="compact-opt-card {selectedLang === lang.value ? 'compact-opt-card--active' : ''}"
                >
                  <lang.icon style="width: 0.875rem; height: 0.875rem;" />
                  <span class="compact-opt-title font-medium">{lang.label}</span>
                  {#if selectedLang === lang.value}
                    <div class="option-check-dot"><Check class="h-2 w-2" /></div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>

          <!-- 2. Agent Personality Selection -->
          <div class="section-group">
            <span class="section-label">Assistant Personality</span>
            <div class="grid grid-cols-2 gap-2 mt-2">
              {#each AGENT_LIST as agent (agent.id)}
                <button
                  type="button"
                  onclick={() => selectedAgent = agent.id}
                  class="compact-opt-card text-left {selectedAgent === agent.id ? 'compact-opt-card--active' : ''}"
                >
                  <div class="compact-orb-preview">
                    <AgentOrb mode="llm" phase="idle" size={24} />
                  </div>
                  <div class="flex flex-col min-w-0">
                    <span class="compact-opt-title font-semibold">{agent.name}</span>
                    <span class="compact-opt-subtitle truncate text-[9px] text-[var(--color-muted-foreground)]">{agent.tagline}</span>
                  </div>
                  {#if selectedAgent === agent.id}
                    <div class="option-check-dot"><Check class="h-2 w-2" /></div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>

          <!-- 3. Theme Selection via Custom Dropdown -->
          <div class="section-group">
            <span class="section-label">Visual Theme</span>
            <div class="relative mt-2" bind:this={dropdownEl}>
              <button
                type="button"
                onclick={() => themeDropdownOpen = !themeDropdownOpen}
                class="dropdown-trigger flex items-center justify-between w-full"
                aria-haspopup="listbox"
                aria-expanded={themeDropdownOpen}
              >
                {#if THEME_LIST.find(t => t.id === selectedTheme)}
                  {@const activeTheme = THEME_LIST.find(t => t.id === selectedTheme) ?? THEME_LIST[0]}
                  <div class="flex items-center gap-3">
                    <div class="compact-swatch">
                      {#each activeTheme.swatch as color}
                        <span class="swatch-dot" style="background: {color}"></span>
                      {/each}
                    </div>
                    <span class="compact-theme-name font-medium">{activeTheme.name}</span>
                  </div>
                {/if}
                <span class="text-[var(--color-muted-foreground)] text-xs">
                  {#if themeDropdownOpen}▲{:else}▼{/if}
                </span>
              </button>

              {#if themeDropdownOpen}
                <div class="dropdown-list-container" transition:fade={{ duration: 100 }}>
                  {#each THEME_LIST as theme (theme.id)}
                    <button
                      type="button"
                      onclick={() => selectTheme(theme.id)}
                      class="dropdown-item flex items-center justify-between w-full {selectedTheme === theme.id ? 'dropdown-item--active' : ''}"
                    >
                      <div class="flex items-center gap-3">
                        <div class="compact-swatch">
                          {#each theme.swatch as color}
                            <span class="swatch-dot" style="background: {color}"></span>
                          {/each}
                        </div>
                        <span class="compact-theme-name">{theme.name}</span>
                      </div>
                      {#if selectedTheme === theme.id}
                        <Check class="h-3 w-3 text-[var(--color-primary)]" />
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>

    {:else if step === 2}
      <!-- About you: city + preferences / memories -->
      <div class="step-panel" transition:fade={{ duration: 200 }}>
        <div class="step-header">
          <p class="step-number">Step 2 of {totalSteps - 1}</p>
          <h2 class="step-title">Tell us about yourself</h2>
          <p class="step-subtitle">These details help your djinn serve you better. All saved to your profile.</p>
        </div>
        <div class="about-scroll">
          <!-- Delivery city -->
          <div class="about-section" bind:this={cityDropdownEl}>
            <span class="about-label">Your delivery city</span>
            <p class="about-hint">We'll filter products to what's deliverable to you. Type to search cities.</p>
            <div class="relative">
              <input
                type="text"
                bind:value={cityQuery}
                onfocus={() => cityDropdownOpen = true}
                oninput={() => cityDropdownOpen = true}
                placeholder="e.g. Colombo, Kandy, Galle"
                class="about-input"
              />
              {#if cityLoading}
                <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                  <div class="spinner-mini"></div>
                </div>
              {/if}

              {#if cityDropdownOpen && cityResults.length > 0}
                <div class="city-dropdown-list" transition:fade={{ duration: 100 }}>
                  {#each cityResults as city}
                    <button
                      type="button"
                      onclick={() => {
                        selectedCity = city;
                        cityQuery = city;
                        cityDropdownOpen = false;
                      }}
                      class="city-dropdown-item flex items-center justify-between w-full {selectedCity === city ? 'city-dropdown-item--active' : ''}"
                    >
                      <span>{city}</span>
                      {#if selectedCity === city}
                        <Check class="h-3.5 w-3.5 text-[var(--color-primary)]" />
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <div class="about-divider"></div>

          <!-- Gender -->
          <div class="about-section">
            <span class="about-label">Gender / Salutation</span>
            <div class="chip-row">
              {#each ["Not specified", "Female", "Male", "Other"] as g}
                <button
                  type="button"
                  onclick={() => selectedGender = g}
                  class="chip {selectedGender === g ? 'chip--active' : ''}"
                >
                  {g}
                </button>
              {/each}
            </div>
          </div>

          <!-- Dietary / Allergies -->
          <div class="about-section">
            <span class="about-label">Dietary / Allergies</span>
            <input
              type="text"
              bind:value={selectedAllergies}
              placeholder="e.g. eggless, nut allergy, gluten-free"
              class="about-input"
            />
          </div>

          <!-- Additional notes -->
          <div class="about-section">
            <span class="about-label">Anything else we should know?</span>
            <textarea
              bind:value={selectedNotes}
              placeholder="e.g. Shopping for kids, preference for local brands..."
              rows="2"
              class="about-textarea"
            ></textarea>
          </div>
        </div>
      </div>

    {:else}
      <!-- Mic permission -->
      <div class="step-panel" transition:fade={{ duration: 200 }}>
        <div class="step-header">
          <p class="step-number">Step {totalSteps - 1} of {totalSteps - 1}</p>
          <h2 class="step-title">Enable voice mode</h2>
          <p class="step-subtitle">Hold the orb to talk to your djinn. We need mic access for live voice.</p>
        </div>

        {#if micState === "idle"}
          <button
            type="button"
            onclick={requestMic}
            class="mic-card"
          >
            <div class="mic-icon-shell">
              <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            </div>
            <span class="mic-label">Test microphone</span>
          </button>
        {:else if micState === "requesting"}
          <div class="mic-status-card">
            <div class="mic-spinner"></div>
            <span class="mic-status-text">Requesting permission...</span>
          </div>
        {:else if micState === "granted"}
          <div class="mic-status-card mic-status-card--granted">
            <div class="mic-icon-shell mic-icon-shell--granted">
              <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            </div>
            <div class="mic-bars">
              {#each Array(16) as _, i (i)}
                <div
                  class="mic-bar"
                  style="height: {4 + micLevel * 28 * (0.5 + 0.5 * Math.sin(i * 0.5 + Date.now() * 0.005) ** 2 + (i < micLevel * 16 ? micLevel * 20 : 0))}px"
                ></div>
              {/each}
            </div>
            <span class="mic-status-text mic-status-text--granted">Microphone ready!</span>
          </div>
        {:else if micState === "denied"}
          <div class="mic-status-card">
            <div class="mic-icon-shell mic-icon-shell--denied">
              <svg class="mic-icon mic-icon--denied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2a7 7 0 0 0-9.06-6.71"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M12 19v3"/><path d="M8 19h8"/></svg>
            </div>
            <span class="mic-status-text">Microphone blocked</span>
            <p class="mic-hint">You can still type. Enable mic in browser settings for voice mode.</p>
          </div>
        {:else}
          <div class="mic-status-card">
            <div class="mic-icon-shell">
              <svg class="mic-icon mic-icon--denied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/></svg>
            </div>
            <span class="mic-status-text">Voice mode not supported on this device.</span>
          </div>
        {/if}
      </div>
      {/if}
    </div>

  <!-- Actions (hidden for step 0 which has its own CTA inside the step) -->
  {#if step > 0}
    <div class="actions-row">
      {#if step > 0}
        <Button variant="ghost" size="lg" onclick={() => step--}>Back</Button>
      {/if}
      <Button variant="primary" size="lg" class="flex-1" onclick={next}>
        {#if step === totalSteps - 1}
          <Sparkles class="h-4 w-4" /> Make a wish!
        {:else}
          Continue
        {/if}
      </Button>
    </div>

    <!-- Skip link -->
    <button type="button" onclick={skip} class="skip-link">
      Skip setup and start shopping
    </button>

    <!-- Progress dots -->
    <div class="progress-dots">
      {#each Array(totalSteps - 1) as _, i (i)}
        <div class="progress-dot {i === step - 1 ? 'progress-dot--active' : ''}"></div>
      {/each}
    </div>
  {/if}
  </div>
</div>

<style>
  /* ── Overlay ── */
  .onboarding-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1.5rem 3rem;
    background: color-mix(in srgb, var(--color-background) 92%, var(--color-primary) 2%);
    overflow-y: auto;
  }
  .onboarding-card {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 28rem;
    margin: auto;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .step-container-grid {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    flex: 1;
  }
  .welcome-step,
  .step-panel {
    grid-area: 1 / 1 / 2 / 2;
  }


  /* ── Welcome Step ── */
  .welcome-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-height: 100%;
    padding: 2rem 1.5rem 0;
  }

  .welcome-brand-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .welcome-headline {
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 4vw, 2rem);
    font-weight: 300;
    font-style: italic;
    line-height: 1.05;
    letter-spacing: -0.04em;
    color: var(--color-foreground);
    text-align: center;
    margin: 0 0 2rem 0;
    overflow-wrap: break-word;
    /* Passing glow sweep — gradient sweeps across via bg-position, creating a
       traveling highlight effect on the text without a permanent color change. */
    background: linear-gradient(
      90deg,
      var(--color-foreground) 0%,
      var(--color-foreground) 35%,
      var(--color-primary) 50%,
      var(--color-foreground) 65%,
      var(--color-foreground) 100%
    );
    background-size: 200% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    animation: glow-sweep 4s ease-in-out infinite;
  }

  @keyframes glow-sweep {
    0% { background-position: 200% 0; }
    50% { background-position: 0% 0; }
    100% { background-position: -100% 0; }
  }

  .welcome-actions-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: auto;
  }

  .welcome-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: var(--radius-2xl);
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-family: var(--font-display);
    font-size: var(--fs-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
    cursor: pointer;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--color-primary) 25%, transparent);
    transition: transform 0.15s ease, box-shadow 0.2s ease;
  }
  .welcome-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--color-primary) 35%, transparent);
  }
  .welcome-cta:active { transform: scale(0.97); box-shadow: 0 1px 4px color-mix(in srgb, var(--color-primary) 20%, transparent); }
  :global(.welcome-arrow) {
    transition: transform 0.2s ease;
  }
  .welcome-cta:hover :global(.welcome-arrow) { transform: translateX(3px); }

  .welcome-skip {
    background: none;
    border: none;
    color: var(--color-muted-foreground);
    font-size: var(--fs-sm);
    cursor: pointer;
    padding: 0.5rem 0.75rem;
    transition: color 0.15s ease;
  }
  .welcome-skip:hover { color: var(--color-foreground); }

  .welcome-footer {
    font-size: var(--fs-xs);
    color: var(--color-muted-foreground);
    text-align: center;
    margin: auto 0 0 0;
    padding-top: 2rem;
    opacity: 0.6;
  }




  /* ── Step Panel ── */
  .step-panel {
    padding: 2rem 1.5rem;
  }

  .step-header {
    text-align: center;
    margin-bottom: 1.75rem;
  }

  .step-number {
    font-size: var(--fs-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-muted-foreground);
    margin: 0 0 0.35rem 0;
    opacity: 0.6;
  }

  .step-title {
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 700;
    color: var(--color-foreground);
    margin: 0 0 0.5rem 0;
    line-height: 1.05;
    letter-spacing: -0.04em;
  }

  .step-subtitle {
    font-size: var(--fs-md);
    color: var(--color-muted-foreground);
    margin: 0;
    line-height: 1.4;
  }

  /* ── Theme Picker ── */
  /* ── Unified Config / Section Groups ── */
  .section-group {
    display: flex;
    flex-direction: column;
  }
  .section-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-muted-foreground);
  }

  /* Compact Options Cards */
  .compact-opt-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface) 82%, transparent);
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
  }
  .compact-opt-card:hover {
    border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  }
  .compact-opt-card--active {
    border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
    background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent);
  }
  .compact-opt-title {
    font-size: var(--fs-sm);
    color: var(--color-foreground);
  }
  .compact-opt-subtitle {
    color: var(--color-muted-foreground);
  }
  .compact-orb-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Option check dots */
  .option-check-dot {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  /* Custom Theme Dropdown */
  .dropdown-trigger {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface) 82%, transparent);
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
  }
  .dropdown-trigger:hover {
    border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border));
  }
  .dropdown-list-container {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 0.25rem;
    z-index: 60;
    display: flex;
    flex-direction: column;
    max-height: 12rem;
    overflow-y: auto;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface) 88%, transparent);
    box-shadow: var(--shadow-float);
    backdrop-filter: blur(12px);
  }
  .dropdown-item {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    background: none;
    border: none;
    transition: background-color 0.15s;
    text-align: left;
  }
  .dropdown-item:hover {
    background: var(--color-muted);
  }
  .dropdown-item--active {
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-muted));
  }

  /* Compact Swatch for Dropdown */
  .compact-swatch {
    position: relative;
    display: flex;
    width: 2.25rem;
    height: 1.15rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    overflow: hidden;
    flex-shrink: 0;
  }
  .swatch-dot {
    flex: 1;
  }
  .compact-theme-name {
    font-size: var(--fs-sm);
    color: var(--color-foreground);
  }
  /* ── About You ── */
  .about-scroll {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 22rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--color-muted) transparent;
    padding: 0.25rem 0.75rem;
  }

  .about-section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .about-label {
    font-size: var(--fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted-foreground);
  }

  .about-hint {
    font-size: var(--fs-sm);
    color: var(--color-muted-foreground);
    margin: 0;
    line-height: 1.3;
  }

  .about-input {
    width: 100%;
    padding: 0.65rem 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-xl);
    background: color-mix(in srgb, var(--color-surface) 84%, transparent);
    font-size: var(--fs-lg);
    color: var(--color-foreground);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .about-input:focus {
    border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 18%, transparent);
  }
  .about-input::placeholder {
    color: color-mix(in srgb, var(--color-muted-foreground) 50%, transparent);
  }

  .about-textarea {
    width: 100%;
    padding: 0.65rem 0.875rem;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-xl);
    background: color-mix(in srgb, var(--color-surface) 84%, transparent);
    font-size: var(--fs-lg);
    color: var(--color-foreground);
    outline: none;
    resize: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .about-textarea:focus {
    border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 18%, transparent);
  }
  .about-textarea::placeholder {
    color: color-mix(in srgb, var(--color-muted-foreground) 50%, transparent);
  }

  .about-divider {
    height: 1px;
    background: var(--color-border);
    margin: 0.25rem 0;
  }

  /* ── Chips ── */
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip {
    padding: 0.35rem 0.75rem;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s, color 0.15s;
  }
  .chip:hover {
    border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border));
  }
  .chip--active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
    color: var(--color-primary);
  }

  /* ── Mic Step ── */
  .mic-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2xl);
    background: var(--color-surface);
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .mic-card:hover {
    border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border));
  }

  .mic-icon-shell {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }
  .mic-icon-shell--granted {
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
  }
  .mic-icon-shell--denied {
    background: color-mix(in srgb, var(--color-destructive) 10%, transparent);
  }

  .mic-icon {
    width: 1.5rem;
    height: 1.5rem;
    color: var(--color-primary);
  }
  .mic-icon--denied {
    color: var(--color-destructive);
  }

  .mic-label {
    font-size: var(--fs-lg);
    font-weight: 500;
    color: var(--color-foreground);
  }

  .mic-status-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2xl);
    background: var(--color-surface);
  }
  .mic-status-card--granted {
    border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  }

  .mic-spinner {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    animation: pulse-scale 1s ease-in-out infinite;
  }

  .mic-bars {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    height: 2rem;
  }

  .mic-bar {
    width: 0.25rem;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    transition: height 75ms;
  }

  .mic-status-text {
    font-size: var(--fs-lg);
    font-weight: 500;
    text-align: center;
    color: var(--color-foreground);
  }
  .mic-status-text--granted {
    color: var(--color-primary);
  }

  .mic-hint {
    font-size: var(--fs-sm);
    color: var(--color-muted-foreground);
    text-align: center;
    margin: 0;
    line-height: 1.4;
  }

  /* ── Actions ── */
  .actions-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }


  .skip-link {
    display: block;
    width: 100%;
    margin-top: 0.75rem;
    text-align: center;
    font-size: var(--fs-sm);
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: color 0.15s;
  }
  .skip-link:hover {
    color: var(--color-foreground);
  }

  /* ── Progress Dots ── */
  .progress-dots {
    display: flex;
    justify-content: center;
    gap: 0.375rem;
    margin-top: 1rem;
  }

  .progress-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--color-muted);
    transition: all 0.2s;
  }

  .progress-dot--active {
    width: 1.25rem;
    border-radius: var(--radius-full);
    background: var(--color-primary);
  }


  @keyframes pulse-scale {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 1; }
  }
  /* City Autocomplete Dropdown */
  .city-dropdown-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    z-index: 60;
    display: flex;
    flex-direction: column;
    max-height: 10rem;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-float);
  }
  .city-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.875rem;
    cursor: pointer;
    background: none;
    border: none;
    font-size: var(--fs-sm);
    color: var(--color-foreground);
    transition: background-color 0.15s;
    text-align: left;
  }
  .city-dropdown-item:hover {
    background: var(--color-muted);
  }
  .city-dropdown-item--active {
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-muted));
    font-weight: 500;
  }
  .spinner-mini {
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  /* ── Responsive ── */
  @media (max-width: 480px) {
    .onboarding-overlay {
      padding: 1.5rem 1rem;
    }
    .onboarding-card {
      max-width: 100%;
    }
    .welcome-headline {
      font-size: clamp(1.15rem, 5vw, 1.5rem);
    }
    .welcome-cta {
      font-size: var(--fs-md);
      padding: 0.625rem 1.25rem;
    }
    .step-title {
      font-size: clamp(1.25rem, 5vw, 1.5rem);
    }
    .unified-config-scroll {
      max-height: 50vh;
    }
    .about-scroll {
      max-height: 18rem;
    }
  }

  @media (max-width: 360px) {
    .onboarding-overlay {
      padding: 1rem 0.75rem;
    }
    .welcome-step {
      padding: 1.5rem 0.75rem 0;
    }
    .step-panel {
      padding: 1.5rem 0.75rem;
    }
    .welcome-cta {
      padding: 0.5rem 1rem;
      font-size: var(--fs-sm);
    }
    .welcome-actions-row {
      flex-direction: column;
      gap: 0.5rem;
    }
    .welcome-skip {
      font-size: var(--fs-xs);
    }
  }
</style>
