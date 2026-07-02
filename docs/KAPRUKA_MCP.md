# Kapruka MCP

Reference for the Kapruka Model Context Protocol (MCP) server as used by the
`djinn` agent. Every server-side fact below (tool list, schemas, response
shapes, error formats, rate limits) was captured live against the production
endpoint on 2026-07-01. Code references point at files in this repo.

```
+----------------+        JSON-RPC 2.0 / Streamable HTTP        +------------------+
|   djinn agent  |  <--------------------------------------->  |  kapruka_mcp     |
|  (this repo)   |   POST https://mcp.kapruka.com/mcp  (SSE)   |  v1.27.0         |
+----------------+                                             +------------------+
        |  callMcpTool()                                           |  wraps kapruka.com
        |  src/lib/server/mcp.ts                                   |  read-mostly + guest checkout
        v                                                          v
+------------------+   normalize*()   +---------------------------------+
| API routes       | <--------------  | src/lib/shopping-engine/        |
| /api/search ...  |                  | normalize.ts, types.ts          |
+------------------+                  +---------------------------------+
```

---

## 1. Server identity and protocol

| Property         | Value                                                              | Source |
|------------------|--------------------------------------------------------------------|--------|
| Endpoint         | `https://mcp.kapruka.com/mcp`                                      | `.env.example`, live `initialize` |
| Server name      | `kapruka_mcp`                                                      | live `initialize` result |
| Server version   | `1.27.0`                                                           | live `initialize` result |
| Protocol version | `2025-06-18`                                                       | live `initialize` result |
| Transport        | Streamable HTTP (HTTP POST, response streamed as `text/event-stream`) | live handshake headers |
| Edge             | Cloudflare in front of Caddy (`server: cloudflare`, `via: 1.1 Caddy`) | live headers |

Server `instructions` string (verbatim, from `initialize`):

> "You are connected to the Kapruka MCP server, which provides read-only
> access to Kapruka.com -- Sri Lanka's largest e-commerce platform. Use the
> available tools to search products, browse categories, and look up product
> details. This is a free public tier; treat results as cached for up to 30
> minutes."

NOTE on the "read-only" wording: the server also exposes `kapruka_create_order`,
which creates a real guest-checkout order (a write/side-effecting operation).
The instructions text is therefore narrower than the actual capability set.

### Advertised capabilities (from `initialize`)

```jsonc
{
  "capabilities": {
    "experimental": {},
    "prompts":   { "listChanged": false },
    "resources": { "subscribe": false, "listChanged": false },
    "tools":     { "listChanged": false }
  }
}
```

`resources/list` and `prompts/list` are both implemented but return **empty
arrays** (verified). Only `tools` carry data.

### Streamable HTTP session handshake (observed on the wire)

1. Client `POST initialize` (no session header).
2. Server responds `200` with `content-type: text/event-stream`, sets
   `Mcp-Session-Id: <id>` and the SSE `event: message` line carrying the JSON.
3. Client sends `notifications/initialized` with the session header -> server
   returns `202 Accepted`.
4. Subsequent requests (`tools/list`, `tools/call`) carry `Mcp-Session-Id`.

This matches the MCP `2025-06-18` Streamable HTTP transport: single endpoint,
server-assigned session id at init, optional SSE streaming of responses.

References:
- MCP Streamable HTTP transport: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP `2025-06-18` changelog (adds structured tool output): https://modelcontextprotocol.io/specification/2025-06-18/changelog
- MCP Tools spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools

---

## 2. Argument convention (IMPORTANT)

All Kapruka tools take a single nested `params` object. They do NOT accept
top-level fields. The project enforces this in `toMcpArguments()`:

```ts
// src/lib/mcp-client/client.ts
export function toMcpArguments(args, responseFormat = "json") {
  // Kapruka MCP requires all args nested under "params".
  // Strip null/undefined values -- MCP server rejects null for optional fields.
  const cleanArgs = stripNulls(args);
  return { params: { response_format: responseFormat, ...cleanArgs } };
}
```

Two non-obvious rules baked into that wrapper:

1. Everything is wrapped as `{ params: { ... } }`. The MCP SDK then sends this
   as the tool call's `arguments`.
2. `null` / `undefined` values are stripped before sending. The server rejects
   `null` for optional fields, so the wrapper deletes them instead.

`response_format` is injected on every call and defaults to `"json"` in this
project (the server default is `"markdown"`). JSON mode returns a JSON document
as a string inside the result envelope (see section 4).

Verified by `src/__tests__/mcp-client/client.test.ts`:
```ts
toMcpArguments({ city: "Colombo", date: null, quantity: 2 })
// -> { params: { response_format: "json", city: "Colombo", quantity: 2 } }
```

---

## 3. Tools (7 total -- authoritatively from `tools/list`)

```
Tool                          Category   readOnly  idempotent  Mutating
kapruka_list_categories       catalog    yes       yes         no
kapruka_get_product           catalog    yes       yes         no
kapruka_search_products       catalog    yes       yes         no
kapruka_list_delivery_cities  logistics  yes       yes         no
kapruka_check_delivery        logistics  yes       NO          no
kapruka_create_order          checkout   NO        yes         YES (write)
kapruka_track_order           post-sale  yes       NO          no
```

`readOnlyHint` / `idempotentHint` come from each tool's `annotations` object in
the `tools/list` response. The two "idempotentHint: false" tools (`check_delivery`,
`track_order`) are effectively still read-only but are not marked idempotent
because their result depends on time / live order state.

> Repo note: `NOTES.md`'s "Tool Architecture Audit" lists 5 named tools and
> flags `(unknown) list_categories / list_delivery_cities`. The live server now
> exposes all 7 with stable names, so those gaps are closed at the MCP layer.

### 3.1 kapruka_search_products

Search the catalog by keyword, with category/price/stock filters and
cursor-based pagination. Category landing pages ("CATSYM" stubs, price 0) are
filtered out by default.

Input (`SearchProductsInput`):

| Field            | Type    | Required | Constraints / default                          |
|------------------|---------|----------|------------------------------------------------|
| `q`              | string  | yes      | 3-200 chars; stopwords-only queries rejected   |
| `category`       | string  | no       | Category name, case-insensitive (e.g. "Birthday") |
| `limit`          | int     | no       | 1-50, default 10                               |
| `cursor`         | string  | no       | from prior `next_cursor`                       |
| `currency`       | string  | no       | LKR (default), USD, GBP, AUD, CAD, EUR         |
| `min_price`      | number  | no       | >= 0, in requested currency                    |
| `max_price`      | number  | no       | >= 0, in requested currency                    |
| `in_stock_only`  | bool    | no       | default false                                   |
| `sort`           | string  | no       | relevance (default), price_asc, price_desc, newest, bestseller |
| `include_stubs`  | bool    | no       | default false (include category landing pages) |
| `response_format`| string  | no       | markdown (default) / json                       |

Output JSON shape:

```jsonc
{
  "results": [
    {
      "id": "FLOWERS00T1875",
      "name": "Rose Elegance Display Vase With 30 Red Roses",
      "summary": "flowers - Redroses ...",
      "price": { "amount": 18000, "currency": "LKR" },
      "compare_at_price": null,
      "in_stock": true,
      "stock_level": "low",                 // "low" | "medium" | "high"
      "image_url": "https://static2.kapruka.com/.../dsc03892.jpg",
      "category": { "id": "cat_general", "name": "General", "slug": "general" },
      "rating": null,                        // always null on this tier
      "ships_internationally": true,
      "url": "https://www.kapruka.com/buyonline/.../kid/flowers00t1875"
    }
  ],
  "next_cursor": "eyJ1IjoiTWc9PSIsInAiOjJ9", // null after page 3
  "applied_filters": { "q": "roses", "limit": 2, "in_stock_only": true }
}
```

Gotchas:
- **Pagination is capped at 3 pages** per query to discourage catalog
  enumeration. `next_cursor` becomes `null` after page 3 even if upstream has
  more. Broaden via `category` or a better query, not deeper paging.
- A no-results query returns a normal (non-error) message:
  `"No products found for 'birthday cake'."` (see section 5).
- The echoed `applied_filters.in_stock_only` was observed as `true` even when
  the documented default is `false`. Treat the documented default as the
  contract, but be defensive: if stock filtering matters, set it explicitly.

### 3.2 kapruka_get_product

Full detail for a single product by ID.

Input (`GetProductInput`):

| Field             | Type   | Required | Notes                                  |
|-------------------|--------|----------|----------------------------------------|
| `product_id`      | string | yes      | 3-80 chars (e.g. "cake00ka002034")     |
| `currency`        | string | no       | LKR (default), USD, GBP, AUD, CAD, EUR |
| `type`            | string | no       | Optional type hint (e.g. "specialgifts"); rarely needed |
| `response_format` | string | no       | markdown / json                        |

Output JSON shape (real captured example, product `FLOWERS00T1875`):

```jsonc
{
  "id": "flowers00T1875",
  "name": "Rose Elegance Display Vase With 30 Red Roses",
  "description": "...full description...",
  "description_format": "plain",
  "summary": "...",
  "price": { "amount": 18000, "currency": "LKR" },
  "compare_at_price": null,
  "in_stock": true,
  "stock_level": "low",
  "category": { "id": "cat_flowers", "name": "flowers", "slug": "flowers", "path": "flowers" },
  "variants": [
    { "id": "flowers00T1875_default", "name": "Default", "sku": "flowers00T1875",
      "price": { "amount": 18000, "currency": "LKR" }, "in_stock": true,
      "stock_level": "low", "attributes": { "weight": "0" } }
  ],
  "images": [
    "https://www.kapruka.com/shops/flowershop/flowerImages/zooms/1750164720138_dsc03892.jpg",
    "https://www.kapruka.com/shops/specialGifts/additionalImages/flowers00t1875_1.jpg"
  ],
  "attributes": { "type": "flowers", "subtype": "Flowers", "weight": "0", "vendor": "Flowers" },
  "shipping": { "ships_from": "LK", "ships_internationally": true, "restricted_countries": [] },
  "rating": null,
  "url": "https://www.kapruka.com/buyonline/.../kid/flowers00t1875"
}
```

Note: IDs beginning with `CATSYM` are category landing pages, not purchasable
products; the tool flags them.

### 3.3 kapruka_list_categories

Top-level categories by name with their kapruka.com landing-page URLs.

Input (`ListCategoriesInput`):

| Field             | Type | Required | Notes                       |
|-------------------|------|----------|-----------------------------|
| `depth`           | int  | no       | 1 or 2 (sub-category levels), default 1 |
| `response_format` | str  | no       | markdown / json             |

Output JSON shape:

```jsonc
{
  "categories": [
    { "name": "Automobile", "url": "https://www.kapruka.com/online/automobile" },
    { "name": "cakes",      "url": "https://www.kapruka.com/online/cakes" },
    { "name": "flowers",    "url": "https://www.kapruka.com/online/flowers" }
    // ... ~64 entries total (catalog + occasions + holidays)
    // depth=2 adds a "children": [{name, url, children}] array per category
  ]
}
```

Internal IDs and product counts are NOT exposed (only `name` + `url`). The
`name` values are usable as the `category` filter on `kapruka_search_products`.

### 3.4 kapruka_list_delivery_cities

Cities Kapruka delivers to, with vernacular aliases.

Input (`ListDeliveryCitiesInput`):

| Field             | Type   | Required | Notes                              |
|-------------------|--------|----------|------------------------------------|
| `query`           | string | no       | partial match on name or aliases; case-insensitive; omit = first `limit` alphabetically |
| `limit`           | int    | no       | 1-50, default 25                   |
| `response_format` | str    | no       | markdown / json                    |

Output JSON shape:

```jsonc
{
  "cities": [
    { "name": "Colombo 03", "aliases": ["Kolpity colpity colombo3"] },
    { "name": "Colombo 05", "aliases": ["thimbirigasyaya kirulapona narahenpita thibirigas"] }
  ],
  "total_matched": 15,
  "showing": 5
}
```

Use the canonical `name` here as the `city` argument to `kapruka_check_delivery`.

### 3.5 kapruka_check_delivery

Feasibility + flat rate for delivering to a city on a date. Kapruka ships as
one shipment per order at one flat rate regardless of item count.

Input (`CheckDeliveryInput`):

| Field             | Type   | Required | Notes                                        |
|-------------------|--------|----------|----------------------------------------------|
| `city`            | string | yes      | 2-100; canonical name from list_delivery_cities |
| `delivery_date`   | string | no       | YYYY-MM-DD (Asia/Colombo); default today LK time |
| `product_id`      | string | no       | if perishable (cake/flower/combo codes), adds a freshness warning when date > 1 day out |
| `response_format` | str    | no       | markdown / json                              |

Output JSON shape:

```jsonc
{
  "city": "Galle",
  "now": "2026-07-01T02:04:06+05:30",     // ISO, Sri Lanka time
  "checked_date": "2026-07-01",
  "available": true,
  "rate": 1090,                            // flat LKR rate per order
  "currency": "LKR",
  "reason": null,                          // populated when available=false
  "next_available_date": null,             // populated when available=false
  "perishable_warning": null               // populated for stale perishable dates
}
```

### 3.6 kapruka_create_order  (WRITE -- creates a real order)

Builds a guest-checkout order and returns a click-to-pay link. No Kapruka
account required. Prices are locked for the lifetime of the link (60 min). A
fresh idempotency key is generated per call, so retries on transient errors
return the same checkout URL instead of duplicate orders.

Input (`CreateOrderInput`):

| Field             | Type          | Required | Notes                                  |
|-------------------|---------------|----------|----------------------------------------|
| `cart`            | CartItem[]    | yes      | 1-30 items                             |
| `recipient`       | Recipient     | yes      | name + phone                           |
| `delivery`        | Delivery      | yes      | address, city, date (+ location_type, instructions) |
| `sender`          | Sender        | yes      | name (+ anonymous)                     |
| `gift_message`    | string        | no       | <= 300 chars                           |
| `currency`        | string        | no       | LKR default                            |
| `response_format` | string        | no       | markdown / json                        |

`CartItem`: `product_id` (3-80, req), `quantity` (1-99, default 1),
`icing_text` (<=120, cakes only, silently ignored otherwise).
`Recipient`: `name` (1-80), `phone` (E.164 `+9477...` or local `077...`).
`Delivery`: `address` (3-250), `city` (2-100), `location_type`
(house/apartment/office/other, default house), `date` (YYYY-MM-DD Asia/Colombo,
today or future), `instructions` (<=250).
`Sender`: `name` (1-80), `anonymous` (default false).

Output JSON shape:

```jsonc
{
  "checkout_url": "https://www.kapruka.com/...",  // open in browser to pay
  "order_ref": "ORD-20260520-7823",               // pre-payment checkout reference
  "summary": {
    "items_total": 18000,
    "delivery_fee": 1090,
    "addons_total": 0,
    "grand_total": 19090,                          // items + delivery + addons
    "currency": "LKR"
  },
  "expires_at": "2026-05-20T13:45:00+05:30"        // ISO; link dies after this
}
```

CRITICAL identifier distinction:
- `create_order` returns `order_ref` (the pre-payment checkout reference).
- The customer then pays in the browser. Kapruka emails them a SEPARATE
  `order_number` (e.g. `VIMP34456CB2`).
- `track_order` expects that emailed `order_number`, NOT the `order_ref`.

Error codes returned in-band (see section 5): `empty_cart`, `missing_field`,
`past_delivery_date`, `product_not_found`, `product_out_of_stock`,
`city_not_deliverable`, `date_not_deliverable`.

Tier limits: 30 orders / hour / client IP. Cart up to 30 items, qty up to 99.

### 3.7 kapruka_track_order

Status + delivery progress for a paid order.

Input (`TrackOrderInput`):

| Field             | Type   | Required | Notes                              |
|-------------------|--------|----------|------------------------------------|
| `order_number`    | string | yes      | 4-40; from Kapruka confirmation email / order-complete page. NOT the `order_ref`. |
| `response_format` | str    | no       | markdown / json                    |

Output JSON shape:

```jsonc
{
  "order_number": "VIMP34456CB2",
  "pnref": "123456789",                    // internal payment reference (numeric)
  "status": "delivered",                   // received|confirmed|shipped|delivered|cancelled|...
  "status_display": "Delivered",           // human label
  "order_date": "20 May 2026",             // human-formatted Asia/Colombo
  "delivery_date": "21 May 2026",
  "shipped_date": null,
  "amount": "15500.00",                    // LKR string
  "payment_method": "Card",
  "comments": null,
  "recipient": { "name": "...", "phone": "...", "address": "...", "city": "..." },
  "greeting_message": null,
  "special_instructions": null,
  "progress": [ { "step": "Order received", "timestamp": "..." } ],
  "live_tracking_available": false,
  "has_delivery_video": false,
  "has_delivery_photo": false,
  "items": [ { "product_id": "...", "name": "...", "quantity": 1, "selling_price": 15500.0 } ]
}
```

App-level error example: `Error (order_not_found): No order exists with the
given order number` (captured from a bogus order number).

---

## 4. Response wire format

All tools return an MCP `CallToolResult`. Two content channels are populated:

- `content`: array of content parts; Kapruka returns a single
  `{ "type": "text", "text": "<string>" }`.
- `structuredContent.result`: the SAME payload as a string. The project reads
  this channel via `extractDataUnsafe()` / `extractTextUnsafe()`.

Every tool's declared `outputSchema` is `{ "result": string }` -- i.e. the
server's structured output is a STRING that is either markdown or a
JSON-stringified document. The project parses that string back into JSON when
`response_format=json`.

Envelope (real captured, `response_format=json`, search):

```jsonc
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      { "type": "text", "text": "{\n  \"results\": [ ... ]\n}" }
    ],
    "structuredContent": {
      "result": "{\n  \"results\": [ ... ]\n}"     // same string as content[0].text
    },
    "isError": false
  }
}
```

Markdown mode (`response_format` omitted) for `check_delivery` returns:

```
## Delivery to Galle on 2026-07-01
**Available** -- flat rate LKR 1,090
```

This is why the project's normalizers are defensive: they accept either a parsed
object, a JSON string, or raw text, and they probe many possible key names
(e.g. `price` / `amount`, `image` / `image_url` / `imageUrl`). See
`src/lib/shopping-engine/normalize.ts`.

---

## 5. Error handling (two distinct tiers)

Tier A -- transport / JSON-RPC level (`isError: true` at the MCP envelope):
returned for things the server itself rejects, e.g. unknown tool.

```jsonc
{
  "jsonrpc": "2.0", "id": 13,
  "result": {
    "content": [ { "type": "text", "text": "Unknown tool: kapruka_does_not_exist" } ],
    "isError": true
  }
}
```

Tier B -- application level (`isError: false`, but the text is an error string):
the tool "succeeded" at the MCP layer but the business operation failed.

```jsonc
{
  "jsonrpc": "2.0", "id": 12,
  "result": {
    "content": [ { "type": "text", "text": "Error (order_not_found): No order exists with the given order number" } ],
    "structuredContent": { "result": "Error (order_not_found): No order exists with the given order number" },
    "isError": false
  }
}
```

The project's client maps errors in `mapMcpError()` and the error classes in
`src/lib/mcp-client/errors.ts`:

| Class                  | code                     | retryable | Triggered by                                   |
|------------------------|--------------------------|-----------|------------------------------------------------|
| `McpConnectionError`   | `mcp_connection_error`   | yes       | closed/connect/fetch/network/socket/transport  |
| `McpToolError`         | `mcp_tool_error`         | no        | `result.isError === true`, or generic failures |
| `McpTimeoutError`      | `mcp_timeout_error`      | yes       | abort/timeout                                  |
| `McpRateLimitError`    | `mcp_rate_limit_error`   | yes       | HTTP 429 / rate messages                       |

Application-level error strings (Tier B) flow through `extractTextUnsafe()` and
are surfaced by the relevant normalizer as a `warning` / `rawText` rather than
a thrown error, so the UI can show "delivery unavailable" gracefully.

---

## 6. Rate limiting, caching, and retries (project layer)

Implemented in `src/lib/server/mcp.ts` on top of the raw client:

- Global MCP rate limit: 50 calls / 60s (`MCP_RATE_LIMIT`, `MCP_RATE_WINDOW`).
- Cache: 30-min TTL (`CACHE_TTL_MS = 1_800_000`) for the cacheable read tools
  `kapruka_search_products`, `kapruka_get_product`, `kapruka_list_categories`,
  `kapruka_list_delivery_cities`. Cache key = `mcp:<tool>:<stableHash(args)>`
  (stableHash sorts object keys so argument order does not matter).
- Retry: one retry with a 250ms backoff when the failure is an
  `McpConnectionError` (transient transport blip). On connection errors the
  client also resets its underlying SDK `Client` so the next call reconnects.
- Client identity sent in `initialize`: `{ name: "djinn", version: "0.1.0" }`.
- Connection is memoized on `globalThis` so hot serverless invocations reuse it.

Server-side headers observed: `ratelimit-limit: 60`, `ratelimit-remaining`,
`ratelimit-reset: 60` (a 60/min ceiling at the edge).

---

## 7. How the project consumes the MCP (data flow)

```
Agent tool (searchProducts / getProduct / checkDelivery / ...)
   |  src/lib/ai/server-executors.ts   (text mode, server-side)
   |  src/lib/ai/tool-registry.ts      (live mode, client -> API route)
   v
API route  /api/search  /api/product/[id]  /api/check-delivery
   |       /api/create-order  /api/track-order  /api/categories  /api/delivery-cities
   |  (Zod validation + origin guard + per-IP rate limit)
   v
callMcpTool(name, args)            src/lib/server/mcp.ts
   |  toMcpArguments -> { params: { response_format, ... } }
   v
HttpMcpClient.callTool              src/lib/mcp-client/client.ts
   |  @modelcontextprotocol/sdk StreamableHTTPClientTransport
   v
normalize* (raw -> typed shapes)   src/lib/shopping-engine/normalize.ts
   v
typed result -> JSON response -> agent / UI
```

Mapping of project API routes to MCP tools:

| API route                    | MCP tool                  | Normalizer              |
|------------------------------|---------------------------|-------------------------|
| `POST /api/search`           | `kapruka_search_products` | `normalizeProductSearch`|
| `GET  /api/product/[id]`     | `kapruka_get_product`     | `normalizeProductDetail`|
| `POST /api/check-delivery`   | `kapruka_check_delivery`  | `normalizeDeliveryCheck`|
| `POST /api/create-order`     | `kapruka_create_order`    | `normalizeOrder`        |
| `POST /api/track-order`      | `kapruka_track_order`     | `normalizeTracking`     |
| `GET  /api/categories`       | `kapruka_list_categories` | `normalizeCategories`   |
| `GET  /api/delivery-cities`  | `kapruka_list_delivery_cities` | `extractData`       |

The typed shapes the rest of the app uses live in
`src/lib/shopping-engine/types.ts` (`Product`, `ProductSearchResult`,
`DeliveryCheck`, `OrderResult`, `TrackingResult`, `Category`, ...).

---

## 8. Practical call recipes (verified arguments)

```bash
# 0) handshake (one time) -> grab Mcp-Session-Id from the response headers
curl -sS -X POST https://mcp.kapruka.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-06-18","capabilities":{},
                 "clientInfo":{"name":"djinn","version":"0.1.0"}}}'

# 1) notify initialized (uses the session id from step 0)
curl -sS -X POST https://mcp.kapruka.com/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <ID>" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'   # -> 202

# 2) list tools
curl -sS -X POST https://mcp.kapruka.com/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <ID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3) call a tool -- note everything is nested under arguments.params
curl -sS -X POST https://mcp.kapruka.com/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <ID>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"kapruka_search_products",
                 "arguments":{"params":{"q":"roses","limit":3,"response_format":"json"}}}}'
```

The `/api/health` route uses `listTools()` as a liveness probe: it reports
`{ mcp: "connected", tools: <count> }` or `503 { mcp: "degraded" }`.

---

## 9. References

Spec & docs:
- MCP specification (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18
- MCP Streamable HTTP transport: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP Tools (tools/list, tools/call, annotations, outputSchema): https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP 2025-06-18 changelog (structured tool output PR #371): https://modelcontextprotocol.io/specification/2025-06-18/changelog
- SDK used: `@modelcontextprotocol/sdk` ^1.29.0 (see `package.json`)

Repo files:
- Client: `src/lib/mcp-client/client.ts`, `types.ts`, `errors.ts`
- Server wrapper (cache/rate/retry): `src/lib/server/mcp.ts`
- Normalizers + typed shapes: `src/lib/shopping-engine/normalize.ts`, `types.ts`
- API routes: `src/routes/api/{search,product/[id],check-delivery,create-order,track-order,categories,delivery-cities,health}/+server.ts`
- Tests: `src/__tests__/mcp-client/client.test.ts`
