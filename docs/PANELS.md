# Kapruka Agent Panel System & Registry (PANELS.md)

This document provides a complete audit of the visual panel system in the `askdjinn` codebase. It maps all registered canvas panels, auxiliary overlay panels, and highlights critical architectural conflicts and observations.

---

## 1. Active Canvas Panels (Unified Layout System)

These panels are registered in `src/lib/panel-contracts.ts` and managed under the unified `ui.panels` array. On desktop, they are positioned dynamically by the recursive layout tree (`Region.svelte` + `PanelHost.svelte`). On mobile, they render as full-screen tabs inside the horizontal `MobileStack.svelte` switcher.

### Static Panels (Single Instance or Dedicated Targets)

| Panel ID / Type | Component File | Role & Behavior |
|---|---|---|
| **`products`** | `ProductThreadsTile.svelte` | Renders query threads, search inputs, and the product catalog grid cards. |
| **`conversation`** | `ConversationTile.svelte` | Renders the chat message log. Controlled by `ui.conversationVisible`. |
| **`cart`** | `CartPanelContent.svelte` | Renders active shopping selections. Linked to the `cart` store. |
| **`product-detail`** | `ProductDetailContent.svelte` | Renders specs, reviews, and description for the active `ui.productDetailId`. |
| **`lists`** | `ListsPanel.svelte` | Renders liked products and watch alert cards. Linked to `lists` store. |
| **`sessions`** | `SessionHistoryPanel.svelte` | Renders previous conversation logs from local session cache database. |

### Dynamic / Agent-Driven Panels (Dynamic UUIDs)

These panels are loaded and managed inside the generic `DynamicPanel.svelte` wrapper.

| Panel Type | Target View | Role & Behavior |
|---|---|---|
| **`checkout`** | `DynamicPanel.svelte` | Renders form inputs to collect checkout/billing details (e.g. sender, recipient). |
| **`address-select`** | `DynamicPanel.svelte` | Renders a selectable list of saved delivery address profiles. |
| **`address-form`** | `DynamicPanel.svelte` | Renders form fields to create or edit a saved delivery address profile. |
| **`delivery-info`** | `DynamicPanel.svelte` | Renders check results (availability, price, rates) for `checkDelivery`. |
| **`order-confirmation`**| `DynamicPanel.svelte` | Confirms order creation, displays order number and checkout pay link. |
| **`order-tracking`** | `DynamicPanel.svelte` | Renders a vertical checkpoints timeline tracking ship status for an order number. |
| **`wishlist`** | `DynamicPanel.svelte` | Renders watch alerts (price drops/restocks) for the user's wishlist. |

---

## 2. Inactive / Legacy Overlay Panels & Modals

These components bypass the layout tree and render as full-screen modal overlays or sliding sheets directly in `AppShell.svelte`.

* **`CheckoutPanel.svelte`**: A full-height side sheet that slides in from the right edge of the screen to overlay everything. Renders checkout inputs.
* **`AskUserModal.svelte`**: Modal dialog prompt overlay triggered when the agent requests user decisions.
* **`DebugChatModal.svelte`**: Modal dialog overlay showing turn details, token counts, and MCP tool call traces.
* **`MobileSheet.svelte`**: Legacy sliding sheet wrapper previously used to show details on mobile.

---

## 3. Critical Architectural Conflicts & Observations

### 🚨 Conflict A: Dual Checkout Implementations (Inline vs. Overlay)
The codebase currently contains **two entirely duplicate and competing checkout workflows**:
1. **User Checkout (Overlay)**: When the user clicks the "Checkout" button in the cart panel (`CartPanelContent.svelte`), it fires `onCheckout()`, which sets `checkoutOpen = true` in `AppShell.svelte`. This opens the **legacy sliding sheet** (`CheckoutPanel.svelte`).
2. **Agent Checkout (Inline)**: When the agent calls `showCheckoutPanel`, it triggers `ui.showPanel({ type: "checkout" })`. This opens the **unified checkout panel** (`DynamicPanel.svelte`) inline inside the split layout grid on desktop, or as a tab on mobile.
* **Result**: The application contains duplicate markup, CSS, and validation code for the same forms. User-initiated checkout uses the overlay sheet, while agent-initiated checkout embeds the form into the Svelte canvas.

### 🚨 Conflict B: Static vs. Dynamic Layout Mapping in PanelHost
In `PanelHost.svelte` (lines 78–92):
```html
    {#if panel.type === "products"}
      <ProductThreadsTile ... />
    {:else if panel.type === "conversation"}
      <ConversationTile ... />
    {:else if panel.kind === "dynamic"}
      <DynamicPanel {panel} />
    {:else}
      <PanelContent ... />
    {/if}
```
* **Observation**: Panel types like `delivery-info`, `order-confirmation`, and `order-tracking` have contracts defined as `instances: "multiple"` and `kind: "static"` (or fallback default) in `panel-contracts.ts`.
* However, when they are opened via the tool handlers (`ui.showPanel`), they are forced as `kind: "dynamic"` with a random UUID.
* If a developer attempts to open `"order-tracking"` statically via `ui.open("order-tracking")`, it defaults to `kind: "static"`. Since it falls into `<PanelContent>` and `PanelContent.svelte` has no branch for `order-tracking`, it **renders absolutely nothing**.
* **Impact**: These panels *only* display content if they are created with `kind: "dynamic"`. The contract default is misleading.

### 🚨 Conflict C: Inactive/Dead `MobileSheet.svelte` on Disk
* **Observation**: The `MobileSheet.svelte` component is still present in `src/lib/components/`. 
* It was previously used to slide up panel contents from the bottom of the viewport on mobile devices.
* This has been completely replaced by the horizontal tab bar and full-sheet tabs in `MobileStack.svelte`.
* **Impact**: `MobileSheet.svelte` is now dead code and can be safely deleted.

---

## 4. Key Recommendations & Integration Plan

To achieve clean, non-leaky API boundaries and maintainable components, the following actions are recommended:

1. **Unify the Checkout flow**:
   * Migrate the cart panel's checkout button to open the inline checkout panel:
     `onCheckout={() => ui.open("checkout")}`
   * Delete `CheckoutPanel.svelte` and remove the `checkoutOpen` state and tags from `AppShell.svelte`. This removes 200+ lines of duplicate form markup and styles.
2. **Harmonize Panel Types in `PanelHost.svelte`**:
   * Update the routing conditional in `PanelHost.svelte` to match by **type** rather than `kind`.
   * For example, route `"checkout"`, `"address-select"`, `"delivery-info"`, `"order-tracking"`, and `"order-confirmation"` to `DynamicPanel` based on a lookup array of types, rather than checking `panel.kind === "dynamic"`. This eliminates the risk of silent rendering failures if a panel is opened with the wrong `kind` flag.
3. **Purge `MobileSheet.svelte`**:
   * Delete `src/lib/components/MobileSheet.svelte` from disk to remove legacy code.
