# Kapruka Agent Panel System & Registry (PANELS.md)

This document provides a complete audit of the visual panel system in the `askdjinn` codebase. It maps all registered canvas panels, auxiliary overlay panels, and highlights critical architectural conflicts and observations.

> **Status update (2026-07-04):** Conflicts A and C resolved (CheckoutPanel and MobileSheet deleted). Conflict B resolved by `ui.open()` auto-determining `kind` from the contract (`instances: "multiple"` → `"dynamic"`). The Orders, AddressBook, and Memories static panels from PANEL_DESIGN.md are now implemented. See each section for details.

---

## 1. Active Canvas Panels (Unified Layout System)

These panels are registered in `src/lib/panel-contracts.ts` and managed under the unified `ui.panels` array. On desktop, they are positioned dynamically by the recursive layout tree (`Region.svelte` + `PanelHost.svelte`). On mobile, they render as full-screen tabs inside the horizontal `MobileStack.svelte` switcher.

  | **`products`** | `ProductThreadsTile.svelte` | Renders query threads, search inputs, and the product catalog grid cards. |
  | **`conversation`** | `ConversationTile.svelte` | Renders the chat message log. Controlled by `ui.conversationVisible`. |
  | **`cart`** | `CartPanelContent.svelte` | Renders active shopping selections. Linked to the `cart` store. |
  | **`product-detail`** | `ProductDetailContent.svelte` | Renders specs, reviews, and description for the active `ui.productDetailId`. |
  | **`wishlist`** | `WishlistPanel.svelte` | Renders liked products and price-drop alerts. |
  | **`sessions`** | `SessionHistoryPanel.svelte` | Renders previous conversation logs from local session cache database. |
  | **`orders`** | `OrdersPanel.svelte` | Lists past orders with tracking and payment links. |
  | **`address-book`** | `AddressBookPanel.svelte` | Browse, add, edit, delete saved addresses. |
  | **`memories`** | `MemoriesPanel.svelte` | View and manage agent-saved user facts. |

### Dynamic / Agent-Driven Panels (Dynamic UUIDs)

These panels are loaded and managed inside the generic `DynamicPanel.svelte` wrapper.

| Panel Type | Target View | Role & Behavior |
|---|---|---|
| **`create-order`** | `DynamicPanel.svelte` | Order creation form with cart summary, address/delivery fields. |
| **`address-select`** | `DynamicPanel.svelte` | Selectable list of saved delivery addresses. |
| **`address-form`** | `DynamicPanel.svelte` | Form to create or edit a saved delivery address. |
| **`delivery-info`** | `DynamicPanel.svelte` | Delivery check results (availability, price, rates). |
| **`order-tracking`** | `DynamicPanel.svelte` | Vertical timeline tracking order shipment status. |

---

## 2. Legacy Overlay Panels & Modals

These components bypass the layout tree and render as full-screen modal overlays or sliding sheets directly in `AppShell.svelte`.

* **`AskUserModal.svelte`**: Modal dialog prompt overlay triggered when the agent requests user decisions.
* **`DebugChatModal.svelte`**: Modal dialog overlay showing turn details, token counts, and MCP tool call traces.

> **Note**: `CheckoutPanel.svelte` and `MobileSheet.svelte` were deleted as part of the panel system refactor (2026-07-04). The checkout flow now opens a `create-order` dynamic panel instead.

---

## 3. Critical Architectural Conflicts & Observations (History)

The following conflicts were identified during the initial panel system audit. All have been resolved.

### ✅ Conflict A: Dual Checkout Implementations (RESOLVED)
_Original issue:_ The codebase contained two duplicate checkout workflows — a legacy overlay sheet (`CheckoutPanel.svelte`) triggered by the cart's checkout button, and an inline dynamic panel triggered by the agent's `showCheckoutPanel` tool.
_Fix:_ Deleted `CheckoutPanel.svelte` and removed `checkoutOpen` state from `AppShell.svelte`. Both user and agent checkout now open a `create-order` dynamic panel.

### ✅ Conflict B: Static vs. Dynamic Layout Mapping (RESOLVED)
_Original issue:_ Panels like `order-tracking` could be opened with `kind: "static"` (from their contract default) but then rendered nothing in `PanelContent` since it had no matching branch.
_Fix:_ `ui.open()` now auto-determines `kind` from the contract — `instances: "multiple"` panels default to `kind: "dynamic"` and route correctly to `DynamicPanel.svelte`. Single-instance non-fillable panels default to `kind: "static"` and route to `PanelContent`.

### ✅ Conflict C: Dead `MobileSheet.svelte` (RESOLVED)
_Original issue:_ The `MobileSheet.svelte` component was unused, replaced by `MobileStack.svelte`.
_Fix:_ Deleted `MobileSheet.svelte`.

---

## 4. Key Recommendations — Completion Status

The original recommendations and their current status:

1. **Unify the Checkout flow** — ✅ Done. `CheckoutPanel.svelte` deleted. Both user and agent paths now use `create-order` dynamic panel.
2. **Harmonize Panel Types in `PanelHost.svelte`** — ✅ Done (indirectly). `ui.open()` auto-selects `kind` from the contract, eliminating silent rendering failures.
3. **Purge `MobileSheet.svelte`** — ✅ Done. File deleted.

