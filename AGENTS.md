## UI DESIGN RULES

CONSISTENT AND INTUITIVE
MODULAR REUSABLE COMPONENTS
consistent and useful snappy TRANSITIONS and ANIMATIONS for intuitive feedback and user interaction on any and all elements and actions
named and well maintained styles and themes

## SVELTE 5 RULES

Svelte 5's CSS analyzer is scoped and static — it only sees classes applied to
elements _in the same component's markup_. It CANNOT see classes forwarded into
child components (e.g. `<ShoppingBag class="icon" />`, `<Button class="cta" />`).
That produces false "Unused CSS selector" warnings. Follow these rules:

- NEVER style a class that is only ever passed to a child component with a plain
  `.class { ... }` selector — Svelte will warn and the rule is fragile.
- When a class is forwarded onto a child component, style it with `:global()`:
  `:global(.icon) { ... }` instead of `.icon { ... }`.
- For a descendant selector where the parent is local but the child class lives
  on a forwarded component, scope only the inner class:
  `.parent :global(.child) { ... }`.
- Prefer styling component _props_ (e.g. `<Button size="lg">`) over classes when
  the component exposes a prop for the effect you want — props are tracked.
- `<svelte:self>` is DEPRECATED in Svelte 5. For recursive components, import the
  component itself (`import Self from "./This.svelte"`) and render `<Self />`.
- Never leave unused CSS selectors in a component — every rule must be
  statically reachable or marked `:global()` with a comment explaining why.

## CODE DESIGN

MODULAR MAINTAINABLE AND WELL TESTED LEAN LIBRARIES
WELL DESIGNED NON LEAKY WELL NAME-SPACED API and INTERFACE DESIGN

## CRITICAL RULE

Any stubbed/faked implementation is a CRITICAL ERROR and must be identified
immediately and fixed before readiness. Every implementation must be real --
accurate error handling, proper status codes, no mock data.
