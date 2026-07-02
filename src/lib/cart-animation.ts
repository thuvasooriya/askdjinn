// Fly-to-cart animation: clones a circle from product card to cart button.
// The clone's gradient follows the active theme via the --gradient-primary
// token (derived from --color-primary/--color-accent), so it recolors
// automatically on theme switch.

export function flyToCart(source: HTMLElement, target: HTMLElement): void {
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const clone = document.createElement('div');
  clone.className = 'fly-clone';
  clone.style.left = `${sourceRect.left}px`;
  clone.style.top = `${sourceRect.top}px`;
  clone.style.width = '44px';
  clone.style.height = '44px';
  clone.style.background = 'var(--gradient-primary)';
  document.body.appendChild(clone);
  requestAnimationFrame(() => {
    clone.style.transform = `translate(${targetRect.left - sourceRect.left}px, ${targetRect.top - sourceRect.top}px) scale(0.15)`;
    clone.style.opacity = '0';
  });
  window.setTimeout(() => clone.remove(), 700);
}
