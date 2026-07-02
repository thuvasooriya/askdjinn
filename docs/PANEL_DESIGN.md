# Panel Design Spec: Orders, Addresses, Memories

Design for three new persistent panels that surface store data to the user,
support manual edits, and accept agent-driven modifications via tools.

## Design Principles

1. **Store-owned, panel-reads** -- panels never hold state. They read from
   the store and call store methods. Same pattern as CartPanelContent.
2. **Dual-edit paths** -- every panel supports BOTH manual user edits
   (buttons, inline forms) AND agent tool calls (panel_fill_field,
   panel_click_action). User edits and agent edits go through the same
   store methods.
3. **List-to-detail flow** -- browse panels show a list; tapping an item
   opens a detail view in-place (not a new panel). No deep nesting.
4. **Contract-registered** -- every new panel type gets a PanelContract so
   the agent discovers it, can open/fill/verify it, and the layout engine
   places it correctly.
5. **Static panel, not dynamic** -- these are browse/manage panels the user
   toggles from the Dock, not transient agent popups. They register as
   static panel types alongside cart/lists/sessions.

---

## 1. Orders Panel (`orders`)

### Purpose
Browse past orders, view tracking details, refresh status, open payment
links. Replaces the transient `order-tracking` dynamic panel for the
browse case. The `order_track` tool still opens a focused tracking view
but now writes into the persistent orders store.

### Panel type: `orders` (static, single-instance)

### Data source: `session.orderRecords: OrderRecord[]`

### Layout: list + detail (in-place toggle)

```
┌─────────────────────────────────────┐
│  Orders                       [X]   │
│ ─────────────────────────────────── │
│                                      │
│  ┌─────────────────────────────────┐│
│  │ VPAY827982BA          Delivered  ││  <- status badge
│  │ LKR 26,060 · Jun 24, 2026       ││  <- amount + delivery date
│  │ Gayathri Fernando · Polgasowita ││  <- recipient + city
│  │                    [Track] [Pay]││  <- actions
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ VPAY123456CD         In Transit  ││
│  │ LKR 12,500 · Jul 05, 2026       ││
│  │ John Silva · Colombo 03          ││
│  │                    [Track]      ││
│  └─────────────────────────────────┘│
│                                      │
│  Empty state:                        │
│  "No orders yet. Your orders will    │
│   appear here after checkout."       │
│                                      │
└─────────────────────────────────────┘
```

### Detail view (taps [Track] or card):

```
┌─────────────────────────────────────┐
│  [< Back]  VPAY827982BA      [⟳]   │  <- back + refresh
│ ─────────────────────────────────── │
│                                      │
│  ● Delivered                         │  <- status badge
│  LKR 26,060 · Visa ending 3645      │  <- amount + payment
│                                      │
│  ┌─ Recipient ─────────────────────┐│
│  │ Ms. Gayathri Fernando           ││
│  │ 077-3517248                     ││
│  │ No. 10/11, Halpita,            ││
│  │ Polgasowita                     ││
│  └─────────────────────────────────┘│
│                                      │
│  ┌─ Gift message ──────────────────┐│
│  │ "Get well soon Gayathri         ││
│  │  (From Kapruka Family)"          ││
│  └─────────────────────────────────┘│
│                                      │
│  ┌─ Timeline ──────────────────────┐│
│  │ ● Order Confirmed    Jun 23 4:40││
│  │ ● Out for delivery   Jun 24 8:23││
│  │ ● Delivered          Jun 24 10:41││
│  └─────────────────────────────────┘│
│                                      │
│  [Refresh status]                   │
│                                      │
└─────────────────────────────────────┘
```

### User actions
- **Tap card** -> expand to detail view in-place
- **[Track]** -> expand detail + scroll to timeline
- **[Pay]** -> open paymentUrl in new tab (if order is pending)
- **[Refresh]** -> calls `order_track` tool or direct API fetch,
   re-fetches from MCP, updates store

### Agent actions (contract-registered, non-destructive)
- `refresh-status` -> re-fetches tracking from MCP for the focused order
- `open-payment` -> opens payment URL (non-destructive: just navigates)

### Agent tools (new)
- `order_list` -> returns `{ orders: OrderRecord[] }` from session store.
  Replaces the current pattern where the agent has no way to discover
  past orders.

### Contract
```typescript
orders: {
  type: "orders",
  instances: "single",
  fillable: false,
  layoutPreference: ["portrait", "landscape", "compact"],
  icon: "package",
  actions: {
    "refresh-status": { run: refreshOrderStatus, destructive: false },
  },
}
```

---

## 2. Address Book Panel (`address-book`)

### Purpose
Browse, add, edit, delete, clone saved addresses. Set default. The
existing `address-select` dynamic panel becomes a mode of this panel
(select mode vs manage mode), not a separate component.

### Panel type: `address-book` (static, single-instance)

### Data source: `addresses.addresses: Address[]`

### Layout: card list + inline edit

```
┌─────────────────────────────────────┐
│  Address Book                [X]    │
│  [+ Add address]                    │
│ ─────────────────────────────────── │
│                                      │
│  ┌─────────────────────────────────┐│
│  │ ★ Home                    [⋮]   ││  <- default star + menu
│  │ Gayathri Fernando               ││
│  │ 077-3517248                     ││
│  │ No. 10/11, Halpita,            ││
│  │ Polgasowita                     ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │   Office                  [⋮]   ││
│  │ John Silva                      ││
│  │ 077-1234567                     ││
│  │ 45 Galle Road,                 ││
│  │ Colombo 03                      ││
│  └─────────────────────────────────┘│
│                                      │
│  Empty state:                        │
│  "No saved addresses. Add one to    │
│   speed up checkout."                │
│                                      │└─────────────────────────────────────┘
```

### Card menu [⋮]:
- Edit (opens inline form)
- Set as default
- Clone
- Delete (confirm)

### Inline edit/add form (expands in-place):
```
┌─────────────────────────────────────┐
│  Edit: Home                   [✕]   │
│ ─────────────────────────────────── │
│  Label      [Home             ]     │
│  Recipient  [Gayathri Fernando]     │
│  Phone      [077-3517248      ]     │
│  Address    [No. 10/11, Halpita]    │
│  City       [Polgasowita      ]     │
│  Notes      [Gate code: 4421  ]     │
│   [x] Default address                │
│                                      │
│  [Save]  [Cancel]                   │
└─────────────────────────────────────┘
```

### User actions
- **[+ Add]** -> opens blank inline form
- **[⋮] -> Edit** -> opens inline form pre-filled
- **[⋮] -> Set default** -> calls `addresses.setDefault(id)`
- **[⋮] -> Clone** -> calls `addresses.clone(id)`
- **[⋮] -> Delete** -> confirm dialog -> `addresses.remove(id)`
- **[Save]** -> `addresses.add()` or `addresses.update()`
- **[Cancel]** -> closes form, no save

### Agent actions (contract-registered)
- `select-address` -> marks an address as selected for the current
  checkout flow (used by `address_select` tool)
- `set-default` -> calls `addresses.setDefault(id)`

### Agent tools (new)
- `address_list` -> returns `{ addresses: Address[] }`
- `address_add` -> adds a new address (label, recipientName, phone,
  streetAddress, city, notes) -> returns `{ id }`
- `address_update` -> updates fields on an existing address by id
- `address_remove` -> removes an address by id
- `address_set_default` -> sets default by id

### Contract
```typescript
"address-book": {
  type: "address-book",
  instances: "single",
  fillable: true,   // agent can pre-fill the add/edit form
  layoutPreference: ["portrait", "compact", "landscape"],
  icon: "map-pin",
  fields: [
    { key: "label", label: "Label", type: "text", required: true, placeholder: "Home, Office..." },
    { key: "recipientName", label: "Recipient Name", type: "text", required: true },
    { key: "recipientPhone", label: "Phone", type: "tel", required: true },
    { key: "streetAddress", label: "Street Address", type: "textarea", required: true },
    { key: "city", label: "City", type: "text", required: true, optionsRef: "delivery_list_cities" },
    { key: "notes", label: "Notes", type: "textarea", required: false },
  ],
  actions: {
    "set-default": { run: setDefaultAction, destructive: false },
    "select-address": { run: selectAddressAction, destructive: false },
  },
}
```

### Relationship to `address-select`
The existing `address-select` dynamic panel type stays as a **mode** of
the address book. When the agent calls `address_select`, it opens the
`address-book` panel in "select" mode (cards show a [Select] button,
tapping resolves the promise). In normal mode, cards show [⋮] menu.
The panel reads `panel.data.mode === "select"` to know which UI to show.

---

## 3. Memories Panel (`memories`)

### Purpose
Show everything the agent remembers about the user. Allow editing,
deleting, and adding facts. This is the transparency/control layer --
the user can see and manage what the AI knows.

### Panel type: `memories` (static, single-instance)

### Data source: `profile.savedFacts: SavedFact[]`

### Layout: grouped by category, inline cards

```
┌─────────────────────────────────────┐
│  Memories                    [X]    │
│  What I know about you              │
│  [+ Add memory]                     │
│ ─────────────────────────────────── │
│                                      │
│  PREFERENCES                         │
│  ┌─────────────────────────────────┐│
│  │ Prefers delivery on weekends    ││
│  │                          [🗑]   ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ Likes dark chocolate            ││
│  │                          [🗑]   ││
│  └─────────────────────────────────┘│
│                                      │
│  SIZES                               │
│  ┌─────────────────────────────────┐│
│  │ Shoe size is 42                 ││
│  │                          [🗑]   ││
│  └─────────────────────────────────┘│
│                                      │
│  DATES                               │
│  ┌─────────────────────────────────┐│
│  │ Wife's birthday is March 15     ││
│  │                          [🗑]   ││
│  └─────────────────────────────────┘│
│                                      │
│  Empty state:                        │
│  "No memories yet. Tell me about    │
│   yourself and I'll remember it     │
│   for next time."                    │
│                                      │
└─────────────────────────────────────┘
```

### Add/edit form (inline):
```
┌─────────────────────────────────────┐
│  Add memory                   [✕]   │
│ ─────────────────────────────────── │
│  Category   [Preference      v]     │
│  Memory     [Prefers morning   ]    │
│             [delivery              ]│
│  [Save]  [Cancel]                   │
└─────────────────────────────────────┘
```

### Categories (grouped display)
```
preference  -> "Preferences"
address     -> "Addresses"
size        -> "Sizes"
allergy     -> "Allergies"
date        -> "Important Dates"
other       -> "Other"
```

### User actions
- **[+ Add]** -> opens inline form (category dropdown + text field)
- **[🗑]** -> confirm -> `profile.removeFact(id)`
- **Tap card** -> inline edit mode

### Agent actions (contract-registered)
No destructive actions exposed -- the agent uses `memory_save_fact` and
`memory_forget_all` tools directly. But the panel shows what exists.

### Agent tools (existing, no change needed)
- `memory_save_fact` -> adds fact (already works)
- `memory_forget_all` -> clears all (already works)

### Contract
```typescript
memories: {
  type: "memories",
  instances: "single",
  fillable: true,
  layoutPreference: ["portrait", "landscape", "compact"],
  icon: "brain",
  fields: [
    { key: "text", label: "Memory", type: "textarea", required: true, placeholder: "e.g. Shoe size is 42" },
    { key: "category", label: "Category", type: "select", required: true, placeholder: "preference" },
  ],
}
```

---

## 4. Wishlist Panel (upgrade existing)

The `wishlist` contract type already exists but renders a placeholder in
DynamicPanel. Since `ListsPanel.svelte` already renders liked + watch
lists well, the upgrade is:

1. **Register `lists` as the static panel** that the Dock/MobileStack
   toggles (already done).
2. **Add `wishlist` as a dynamic panel type** that the agent opens when
   it specifically wants to draw attention to the wishlist/price-watch
   view. It renders `ListsPanel` with `initialTab="watch"`.
3. No new component needed -- reuse `ListsPanel`.

---

## 5. Order Tracking Panel (upgrade existing)

The `order-tracking` dynamic panel already renders a timeline. Upgrade:
1. When opened with `panel.data.orderNumber`, it reads from the
   `session.orderRecords` cache instead of only `panel.data`.
2. Add a **[Refresh]** button that calls the `order_track` tool to
   re-fetch from MCP.
3. Keep it as a dynamic panel (agent-driven, multiple instances) but
   wire it to the persistent cache.

---

## New PanelType registrations

```typescript
// Add to PanelType union:
| "orders" | "address-book" | "memories"

// Add to PANEL_TYPES array:
"orders", "address-book", "memories"

// Add to CONTRACTS:
orders: { ... },
"address-book": { ... },
memories: { ... },
```

## Static panel wiring

Register in PanelContent.svelte alongside cart/lists/sessions:

```svelte
{:else if id === "orders"}
  <OrdersPanel />
{:else if id === "address-book"}
  <AddressBookPanel />
{:else if id === "memories"}
  <MemoriesPanel />
```

## Dock / MobileStack icon registration

Add to the icon maps:
```typescript
orders: Package,
"address-book": MapPin,
memories: Brain,
```

## New agent tools (summary)

| Tool | Purpose |
|------|---------|
| `order_list` | Returns all OrderRecords from session cache |
| `address_list` | Returns all saved addresses |
| `address_add` | Adds a new address |
| `address_update` | Updates an address by id |
| `address_remove` | Removes an address by id |
| `address_set_default` | Sets default address by id |

Existing tools that already cover memories (`memory_save_fact`,
`memory_forget_all`) and orders (`order_track`) need no changes.

## File plan

| File | Change |
|------|--------|
| `src/lib/panel-contracts.ts` | Add `orders`, `address-book`, `memories` types + contracts |
| `src/lib/components/OrdersPanel.svelte` | **New** - browse/detail orders |
| `src/lib/components/AddressBookPanel.svelte` | **New** - manage addresses |
| `src/lib/components/MemoriesPanel.svelte` | **New** - view/edit facts |
| `src/lib/components/shell/PanelContent.svelte` | Wire 3 new static panels |
| `src/lib/components/shell/Dock.svelte` | Add icons for new panels |
| `src/lib/components/shell/MobileStack.svelte` | Add tab entries |
| `src/lib/ai/tool-registry.ts` | Add `order_list`, `address_*` tools |
| `src/lib/ai/client-context.ts` | Wire new tool handlers |
| `src/lib/components/DynamicPanel.svelte` | Upgrade order-tracking to read cache |

## Execution order

1. Register panel types + contracts (panel-contracts.ts)
2. Build OrdersPanel.svelte
3. Build AddressBookPanel.svelte
4. Build MemoriesPanel.svelte
5. Wire into PanelContent + Dock + MobileStack
6. Add agent tools (order_list, address_*)
7. Upgrade order-tracking dynamic panel to use cache
8. Verify: check + test + build
