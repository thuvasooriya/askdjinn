# Kapruka Agent Tool Reference (TOOLS.md)

This document provides a comprehensive technical registry of all client-side and backend-integrated tools available to the AI agent (via both the Gemini Multimodal Live API and text-mode REST proxy).

---

## Architecture Overview

All tools run on a **unified client-side execution engine** (`src/lib/ai/tool-registry.ts`) powered by the `ClientToolContext` (`src/lib/ai/client-context.ts`).

```mermaid
┌──────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│   Agent (LLM)    │ ───► │  Tool Registry  │ ───► │  Client Context  │
│  (Live or Text)  │       │ (Zod Validation)│       │ (Store Dispatch) │
└──────────────────┘       └─────────────────┘       └──────────────────┘
                                                              │
                                       ┌──────────────────────┼──────────────────────┐
                                       ▼                      ▼                      ▼
                             ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
                             │    UI Store      │   │    Cart Store    │   │  Profile Store   │
                             │ (Layout Tree/Dock)│   │  (Quantities)    │   │  (User Facts)    │
                             └──────────────────┘   └──────────────────┘   └──────────────────┘
```

When the agent triggers a tool:

1. **Schema Check**: Parameters are validated on the client.
2. **Backend Dispatch**: Network-dependent tools call local API routes (e.g. `/api/create-order`) which in turn call the **Kapruka MCP Server** using a rate-limited, cached client (`src/lib/server/mcp.ts`).
3. **Store Mutation**: Results update Svelte 5 reactive stores (`ui`, `cart`, `profile`, `session`, `conversation`).
4. **Layout Integration**: Any UI changes immediately propagate to the recursive layout tree (`Region.svelte`), which reshapes the visible panels on the user's screen.

---

## 1. Shopping & Catalog Tools

### `searchProducts`

- **Description**: Queries the product catalog. Results update the UI automatically.
- **Parameters**:
  - `q` (string, query text)
  - `category` (string, optional filter)
  - `min_price` (number, optional)
  - `max_price` (number, optional)
  - `in_stock_only` (boolean)
  - `limit` (number, default 8, max 12)
- **Implementation**: Calls `ctx.onSearch()`, which sets `ui.searchCriteria` and triggers `ui.triggerSearch()`. This hits the `/api/search` route, executing a `kapruka_search_products` MCP call.
- **UI/Store Impact**: Updates `ui.searchResults` (appended as a new query thread) and opens the `"products"` panel (`ProductThreadsTile.svelte`) if closed.

### `getProduct`

- **Description**: Fetch detailed JSON data of a specific product by ID.
- **Parameters**: `product_id` (string)
- **Implementation**: Directly fetches `/api/product/${id}`, executing a `kapruka_get_product` MCP call.
- **UI/Store Impact**: **Data-only.** Returns the full description, images, and specifications to the agent's LLM context. Does _not_ open any visual panel.
- **Warning / Misleading Detail**: **Do not confuse with `openProductDetails`.** Calling `getProduct` does not show the product card on the user's screen.

---

## 2. Cart Management Tools

### `addToCart`

- **Description**: Add a product to the user's shopping cart.
- **Parameters**:
  - `product_id` (string)
  - `quantity` (number, default 1)
- **Implementation**: Calls `ctx.onAddToCart()`. Validates that the product exists in the `ui.productRegistry` (meaning the user has seen it in a search or detail view). If valid, calls `cart.addItem()`.
- **UI/Store Impact**:
  - Adds/increments the product inside `cart.items`.
  - Triggers the Svelte `flyToCart` animation, flying a clone of the product image into the bottom-right Dock's cart icon.
  - Bumps the cart badge count.

### `removeFromCart`

- **Description**: Remove an item from the cart completely.
- **Parameters**: `product_id` (string)
- **Implementation**: Calls `cart.removeItem()`.
- **UI/Store Impact**: Removes the item from `cart.items` and updates the cart total pricing.

### `updateCartQuantity`

- **Description**: Update the quantity of an item in the cart.
- **Parameters**:
  - `product_id` (string)
  - `quantity` (number)
- **Implementation**: Calls `cart.updateQuantity()`.
- **UI/Store Impact**: Updates the quantity in `cart.items`.

### `checkCart`

- **Description**: Inspect the current shopping cart contents.
- **Parameters**: None.
- **Implementation**: Queries `cart.items`.
- **UI/Store Impact**: Read-only context helper. Returns `{ items, count }` to the agent.

---

## 3. Order & Checkout Tools

### `checkDelivery`

- **Description**: Checks delivery availability and pricing for a city.
- **Parameters**:
  - `city` (string)
  - `delivery_date` (string, YYYY-MM-DD, optional)
- **Implementation**: Fetches `/api/check-delivery` (triggering `kapruka_check_delivery` MCP call).
- **UI/Store Impact**: Automatically opens the `"delivery-info"` panel via `ctx.onShowPanel()` to show delivery rates and availability.
- **Inconsistency Note (Fixed)**: Previously, this tool only returned data to the agent and did not display a panel. It has been aligned to mirror `trackOrder` and now automatically pushes the `"delivery-info"` card onto the screen.

### `selectAddress`

- **Description**: Displays an address selector panel.
- **Parameters**: Pre-fill variables (`recipient_name`, `recipient_phone`, `street_address`, `city`).
- **Implementation**: Calls `ctx.onShowPanel()` with type `"address-select"`. Returns a Promise that resolves with the chosen address object or `null` if cancelled.
- **UI/Store Impact**: Launches the `"address-select"` dynamic form panel (`DynamicPanel.svelte`). Captures user interaction.

### `showCheckoutPanel`

- **Description**: Displays the full checkout details and billing form.
- **Parameters**: Pre-fill variables (`recipient_name`, `recipient_phone`, `street_address`, `delivery_city`, `delivery_date`, `sender_name`, `gift_message`).
- **Implementation**: Calls `ctx.onShowPanel()` with type `"checkout"`. Returns a Promise that resolves with the final checkout details.
- **UI/Store Impact**: Opens the `"checkout"` dynamic form panel. If already open, reuses the existing panel promise to prevent duplicate checkout prompts.

### `createOrder`

- **Description**: Create a real Kapruka click-to-pay checkout transaction.
- **Parameters**: `cart` (items array), `recipient`, `delivery`, `sender`, `gift_message`.
- **Implementation**: Fetches `/api/create-order` (Zod validated, past date guarded) -> calls `kapruka_create_order` MCP tool.
- **UI/Store Impact**:
  - Fires `ctx.onOrderCreated()`, which writes to `ui.lastOrder` and persists the order ID to the tracking history (`session.addOrder`).
  - Displays the floating **Order Ready Banner** at the top center with a **Pay Now** link.
  - Opens the `"order-confirmation"` panel with payment links.
  - Clears the user's active cart.

### `trackOrder`

- **Description**: Retrieve real-time shipping checkpoints for an order.
- **Parameters**: `order_number` (string)
- **Implementation**: Fetches `/api/track-order` -> calls `kapruka_track_order` MCP tool.
- **UI/Store Impact**: Automatically opens the `"order-tracking"` panel, rendering a vertical shipment timeline.

### `searchDeliveryCities`

- **Description**: Autocomplete search for supported Kapruka delivery cities.
- **Parameters**: `query` (string), `limit` (number, default 15)
- **Implementation**: Fetches `/api/delivery-cities` -> calls `kapruka_list_delivery_cities` MCP.
- **UI/Store Impact**: Data-only helper to assist the agent in validating cities.

---

## 4. UI Layout & Panel Tools (Phase 5)

These tools give the agent direct control over the **Unified Panel System** layout.

### `openPanel`

- **Description**: Open a layout panel by type and optionally pre-fill its parameters.
- **Parameters**: `type` (string), `data` (object, optional)
- **Implementation**: Calls `ui.open()`.
- **UI/Store Impact**: Spawns or focuses the panel. Static panels map directly to their type (e.g. `"cart"`), while dynamic panels generate a fresh UUID.

### `closePanel`

- **Description**: Close an open panel.
- **Parameters**: `id` (string, UUID or static panel type)
- **Implementation**: Calls `ui.close()`.
- **UI/Store Impact**: Removes the panel from `ui.panels`. If dynamic, resolves its pending form promise with `null`.

### `focusPanel`

- **Description**: Bring a panel to focus.
- **Parameters**: `id` (string)
- **Implementation**: Calls `ui.focus()`.
- **UI/Store Impact**: On mobile, activates the panel's tab. On desktop, bumps its recency key (`createdAt = Date.now()`) to protect it from eviction.

### `minimizePanel`

- **Description**: Collapse a panel into the dock.
- **Parameters**: `id` (string)
- **Implementation**: Calls `ui.minimize()`.
- **UI/Store Impact**: Minimizes the panel on desktop, converting its canvas tile into a floating chip in the bottom-right Dock. No-op on mobile.

### `fillPanelField`

- **Description**: Pre-fill or modify a specific form field in an open panel.
- **Parameters**: `panelId` (string), `key` (string), `value` (string)
- **Implementation**: Resolves the panel and calls `ui.fillPanelField()`, executing the contract validators.
- **UI/Store Impact**: Updates `panel.data[key]`. If validation fails, rejects the edit and returns the error to the agent.

### `clickPanelAction`

- **Description**: Trigger a registered action inside a panel.
- **Parameters**: `panelId` (string), `action` (string), `args` (array, optional)
- **Implementation**: Inspects the panel's contract (`panel-contracts.ts`). If the action is registered and marked **non-destructive**, executes its handler.
- **Security Guard**: Destructive or financial actions (e.g., placing orders, triggers for payments) are blocked here (`destructive: true`) and must be clicked directly by the user.

### `verifyPanel`

- **Description**: Force a full validation check on all fields of a panel.
- **Parameters**: `panelId` (string)
- **Implementation**: Calls `ui.verifyPanel()`, mapping missing required keys and field validation errors.
- **UI/Store Impact**: Returns `{ ok, missing: [], invalid: [] }` to the agent. The agent should always call this before recommending checkout confirmation.

---

## 5. UI Presentation & Selection Tools

### `highlightProducts`

- **Description**: Draw the user's attention to specific products by dimming others.
- **Parameters**: `items` (array of objects containing `id` and optional `reason` text annotations).
- **Implementation**: Calls `ui.highlight()`.
- **UI/Store Impact**: Restricts highlighted states on the product grid and renders tool-provided annotations directly on the targeted product cards.

### `openProductDetails`

- **Description**: Open the detail page for a product.
- **Parameters**: `product_id` (string)
- **Implementation**: Sets `ui.productDetailId = id` and opens the `"product-detail"` panel.

### `closeProductDetails`

- **Description**: Close the currently open product detail panel.
- **Parameters**: None.
- **Implementation**: Clears `ui.productDetailId` and closes the `"product-detail"` panel.

### `scrollToProduct`

- **Description**: Smoothly scroll the products grid to center a product.
- **Parameters**: `product_id` (string)
- **Implementation**: Sets `ui.scrollToId = id`.

### `clearHighlights`

- **Description**: Remove all active agent highlights from the screen.
- **Parameters**: None.
- **Implementation**: Clears `ui.highlightedIds` and `ui.annotations`.

### `readUserHighlights`

- **Description**: Check which items the user has clicked on/highlighted.
- **Parameters**: None.
- **Implementation**: Returns `ui.userHighlights` set values to the agent.

### `askUser`

- **Description**: Show a multiple-choice question dialog overlay.
- **Parameters**: `question` (string), `options` (string array, 2-5 choices).
- **Implementation**: Returns a Promise that resolves when the user clicks an option or dismisses the modal.
- **UI/Store Impact**: Renders the modal overlay. Replaces full modal layouts with compact, non-intrusive floating chips at the bottom.

---

## 6. General Web Tools

### `webSearch`

- **Description**: Search the web for reviews, gift guides, or trends.
- **Parameters**: `query` (string)
- **Implementation**: Fetches `/api/web-search` -> queries Search API.
- **UI/Store Impact**: Data-only helper.

### `fetchUrl`

- **Description**: Scrape a web page and return readable markdown.
- **Parameters**: `url` (string)
- **Implementation**: Fetches `/api/fetch-url` -> scrapes the page content.
- **UI/Store Impact**: Data-only helper.

---

## 7. Memory & Personalization Tools

### `saveUserFact`

- **Description**: Retain a durable user fact in memory.
- **Parameters**: `text` (string), `category` (string: preference, size, allergy, address, etc.)
- **Implementation**: Calls `profile.addFact()`.
- **UI/Store Impact**: Persists the fact in local profile storage.

### `forgetUserFacts`

- **Description**: Clear the user's conversational history, cached UI views, and facts.
- **Parameters**: None.
- **Implementation**: Clears history, cart, and profile facts. Re-initializes a new session.

### `addToWishlist`

- **Description**: Toggle a product's presence in the user's list.
- **Parameters**: `product_id` (string)
- **Implementation**: Queries `ui.productRegistry` and calls `lists.toggleLike()`.
- **UI/Store Impact**: Updates `lists` store and bumps the `"lists"` panel badge.

---

## Known Issues, Inconsistencies & Safety Limits

1. **`getProduct` vs `openProductDetails` (Potential Misunderstanding)**:
   - `getProduct` is a pure data tool. It retrieves product info for the LLM to read but does not alter the screen.
   - `openProductDetails` is a layout tool. It renders the visual `"product-detail"` panel on screen.
   - _Resolution_: Ensure the agent's instructions warn against calling `getProduct` when the goal is to visually display details.

2. **Panel ID Inconsistency (`delivery` vs `delivery-info`)**:
   - The Svelte component files and schemas define the delivery status panel type as `"delivery-info"`.
   - However, `ui.svelte.ts` contains a legacy `"delivery"` enum string inside `PanelId` and calls `this.openPanel("delivery")` inside its `setDeliveryCheck` helper.
   - _Resolution_: The UI store is back-compatible, but new panel placements and agent tools should exclusively request `"delivery-info"` to conform to the contract registry.

3. **`clickPanelAction` Destructive Gating**:
   - The tool `clickPanelAction` verifies action metadata. Any action marked `destructive: true` (e.g. placing orders or final checkout transactions) is rejected on invocation. The LLM must instruct the user to click the final confirm buttons themselves.

## Stores & Cache Redesign Proposal

A critical audit of the codebase reveals that while the client-side execution engine is unified, the Svelte stores (`src/lib/stores/`) and persistence layers contain several legacy overlaps, duplicate properties, and simplified structures.

Decoupling and refining these stores provides a robust, offline-first cache architecture that directly supports the agent's tools (`createOrder`, `trackOrder`, `checkDelivery`, etc.) and eliminates redundant backend calls.

---

### 1. Wishlist & Price/Stock Watcher (`lists.svelte.ts`)

#### 📝 Commentary & Current State:

- The current wishlist store (`lists.svelte.ts`) actually contains a sophisticated watch registry (`watch: WatchEntry[]`) that closely aligns with your design thought. It tracks:
  - `targetPrice` and `priceWhenAdded`
  - `previousPrices` (historical chart tracking)
  - `notifyOnPriceDrop` and `notifyOnRestock` (booleans)
- **Legacy Merge / Cleanup**: The existing wishlist store has a legacy `preferences: PreferenceEntry[]` array. In the redesigned system, **this array must be deleted**. User preferences and facts are now handled in the unified **Profile Store** (`profile.svelte.ts`) via `savedFacts`. Keeping both causes configuration drift.

#### 📦 Redesigned Data Model:

```typescript
interface WishlistItem {
  productId: string;
  liked: boolean;
  addedAt: number;
  watch: {
    targetPrice?: number;
    priceWhenAdded: number;
    previousPrices: Array<{ price: number; date: number }>;
    notifyOnPriceDrop: boolean;
    notifyOnRestock: boolean;
  };
  lastFetchedPrice?: number;
  inStock?: boolean;
  updatedAt: number;
}
```

#### 🔗 Tool Integrations:

- **`addToWishlist`**: Toggles the `liked` state in the store. - should be renamed addProductToWishlist. discourage ambiguous tool names
- **`trackProductPrice`**: Activates/updates the `watch.targetPrice` and toggles `watch.notifyOnPriceDrop`.
- **`trackProductStock`**: Toggles `watch.notifyOnRestock` when the product is out of stock.
- **Background Cron Integration**: A background agent (e.g. `gemma-4-31b` helper running with a TTL on load) can read this watch list, trigger `getProduct` (which fetches `/api/product/${id}` using the `kapruka_get_product` MCP), compare the current price/stock, push updates to `watch.previousPrices`, and dispatch Svelte notifications when thresholds are met.

---

### 2. Cart Store (`cart.svelte.ts`)

#### 📝 Commentary & Current State:

- Currently tracks items, quantities, and cake icing texts, computing local subtotals.
- **Redesign Linkage**: When a delivery check is completed (`checkDelivery` tool), the resulting delivery charges (`rate`) should be cached directly inside the cart store. This allows the cart panel to display an accurate, complete price breakdown (subtotal + delivery fee + grand total) _prior_ to checkout, rather than forcing the user into the checkout panel to see the shipping fee.

#### 📦 Redesigned Data Model:

```typescript
interface CartStoreState {
  items: Array<{
    product: Product;
    quantity: number;
    icingText?: string;
  }>;
  deliveryEstimate?: {
    city: string;
    rate: number;
    estimatedDate?: string;
  };
  subtotal: number;
  grandTotal: number;
}
```

#### 🔗 Tool Integrations:

- **`addToCart` / `removeFromCart` / `updateCartQuantity`**: Modify the `items` array.
- **`checkDelivery`**: Triggers a backend fetch and, on success, writes to `deliveryEstimate`.

tools can be renamed for less ambiguity and proper namespacing

- ***

### 3. Orders History Cache (`session.svelte.ts` / `orderHistory`)

#### 📝 Commentary & Current State:

- The current `SessionStore` (`session.svelte.ts`) only holds a flat array of order number strings: `orderHistory: string[]`.
- **Redesign Proposal (Offline-First Tracker)**: We will upgrade this flat array into a structured `OrderRecord[]` cache. When an order is created, or when the user tracks an order, the result is cached.
- This allows the `"order-tracking"` visual panel to render instantly from the local store cache on reload, avoiding repeated, slow MCP network requests on every mount.
- we'll be adding the test order number of VPAY827982BA to this store by default for testing purposes. so that agent can detect this completed order and will be able to use well designed tools to track this id. (we don't want to hardcode id in tool definition)

#### 📦 Redesigned Data Model:

```typescript
interface OrderRecord {
  orderNumber: string; // e.g. "KAP-2026-8927"
  paymentUrl?: string;
  createdAt: number;
  expiresAt?: number;
  status: "pending" | "completed" | "expired" | "shipped" | "delivered";
  summary?: {
    itemsTotal: number;
    deliveryFee: number;
    grandTotal: number;
    currency: string;
  };
  trackingTimeline?: Array<{
    step: string;
    timestamp?: string;
  }>;
  lastCheckedAt: number; // TTL key for cache eviction
}
```

#### 🔗 Tool Integrations:

- **`createOrder`**: Resolves the payment details, creates an `OrderRecord` with status `"pending"`, caches it in the session store, and resets the cart.
- **`trackOrder`**:
  1. Inspects the `OrderRecord[]` in `SessionStore` first.
  2. If the record exists and `Date.now() - lastCheckedAt` is under a TTL (e.g. 5 minutes), it immediately returns the cached details (instant render).
  3. On cache miss or TTL expiry, it fetches the `/api/track-order` route, normalizes the MCP tracking timeline, updates the cache record, sets `lastCheckedAt = Date.now()`, and triggers a Svelte update.

---

### 4. Address Book Store (`addresses.svelte.ts`)

#### 📝 Commentary & Current State:

- Tracks the user's saved delivery addresses. Address cards can be added, updated, cloned, or deleted.
- **Redesign Linkage**: The dynamic panel `"address-select"` reads directly from this store to present a list of saved address profiles. The **`selectAddress` tool** matches pre-filled recipient parameters against this store to auto-select a match or open the edit panel if fields differ.

#### 📦 Redesigned Data Model:

```typescript
interface Address {
  id: string; // UUID
  label: string; // e.g. "Home", "Office"
  recipientName: string;
  recipientPhone: string; // Sri Lankan phone format
  streetAddress: string;
  city: string; // Validated city
  notes?: string; // Delivery hints/gate codes
  isDefault?: boolean; // Primary delivery target
  createdAt: number;
}
```

#### 🔗 Store Mutations:

- `add(data)`: Saves a new address record, auto-generates a UUID, and persists changes.
- `update(id, patch)`: Modifies fields inside a targeted address record.
- `remove(id)`: Deletes an address record.
- `setDefault(id)`: Configures a target address as default and clears others.

---

### 5. Profile Store (`profile.svelte.ts` / `profile-schema.ts`)

#### 📝 Commentary & Current State:

- The **Profile Store** is the central brain for user preferences, personalization states, and extracted facts.
- **Core Design (Orthogonality)**: Separates the reactive store (`profile.svelte.ts` holding Svelte 5 runes) from pure schemas/migration logic (`profile-schema.ts`), allowing headless unit testing without Svelte compilation overhead.
- Theme selection (`themeId`) is orthogonal to Agent personality (`agentId`) — all colors are CSS custom properties applied when `document.documentElement.dataset.theme` is updated.
- **Memory Integration**: The agent uses the Profile store as its long-term associative memory to save user details (sizes, preferences, salutations, allergies) extracted during conversation.

#### 📦 Redesigned Data Model:

```typescript
interface SavedFact {
  id: string; // UUID
  text: string; // e.g. "Prefers delivery on weekends"
  category: "preference" | "address" | "size" | "allergy" | "date" | "other";
  createdAt: number;
  confirmed: boolean; // Gated fact confirmation
}

interface UserProfile {
  language: Language; // "english" | "sinhala" | "tamil"
  agentId: AgentId; // "ruka" | "mithu" | "kavi" | "neel"
  provider: ProviderId; // active LLM host
  model: string; // active model name
  themeId: ThemeId; // active CSS theme ID
  onboarded: boolean; // onboarding flow status
  micTested: boolean; // microphone permission status
  preferredCity: string | null;
  savedFacts: SavedFact[]; // Associative user memory
}
```

#### 🔗 Tool Integrations:

- **`saveUserFact`**: Evaluates conversation context, categories the preference/allergy, and appends a new `SavedFact` record into `profile.savedFacts`.
- **`forgetUserFacts`**:
  1. Wipes all elements in `profile.savedFacts`.
  2. Re-sets `onboarded = false` and `micTested = false` to re-trigger the onboarding panel flow.
  3. Calls `conv.clearAll()` (Conversation store) and `ui.resetView()` to start a completely clean user session.

---

### 6. Summary of Other Auxiliary Stores

For completeness, the application layers additional transient and communication stores:

#### 💬 Conversation Store (`conversation.svelte.ts`)

- **Purpose**: Tracks the full thread history (`turns: Turn[]`) representing the exact state of chat messages, visual cards, tool executions, and voice transcription segments.
- **Tool Linkage**: Cleared during `forgetUserFacts` to start a new chat thread. Maintains order references.

#### 🎙️ Live Voice Store (`live-voice.svelte.ts`)

- **Purpose**: Manages WebSocket connections to the Gemini Multimodal Live API, handling low-level PCM audio captures, playback buffers, speech levels (`audioLevel`), and voice activity states (`listening` | `speaking` | `thinking`).
- **Tool Linkage**: Resolves incoming `functionCall` events by executing matching tools in `ClientToolContext` and transmitting results back to Gemini.

#### 💬 Chat Interface Store (`chat.svelte.ts`)

- **Purpose**: Manages text-mode messaging queues, stream proxies, loading states, and highlight annotations.

#### 🔔 Toast Store (`toast.svelte.ts`)

- **Purpose**: App-wide alert notifications.
- **Tool Linkage**: Displays error logs if a backend MCP action (like `createOrder`) throws an exception.

#### 🧠 Agent Status Store (`agent-status.svelte.ts`)

- **Purpose**: Tracks what the agent is currently doing (e.g. `"searching"`, `"thinking"`, `"speaking"`) to drive the glowing status display pill.
- **Tool Linkage**: Bumps statuses dynamically as tools are executed (e.g. `searchProducts` triggers `"searching"`, `createOrder` triggers `"thinking"`).

Agent status store should be modified a bit to respect tool names as is. so no need to rephrase it just displaying the tool names in the status pill when they are being called is fine
