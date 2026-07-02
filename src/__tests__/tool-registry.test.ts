import { describe, test, expect } from "bun:test";
import { TOOLS, ALL_TOOLS, getLiveModeDeclarations, executeClientTool, getTool, getToolNames, toolUiConfig, UI_ONLY_TOOLS, summarizeToolCall } from "$lib/ai/tool-registry";
import { buildSystemPrompt, buildTextPrompt, buildLivePrompt, getLanguageDirective } from "$lib/ai/prompt";

// ── Tool Registry Tests ─────────────────────────────────────────────────────

describe("tool-registry", () => {
  test("all tools have required fields", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.properties).toBeTypeOf("object");
      expect(Array.isArray(tool.parameters.required)).toBe(true);
      expect(tool.ui.icon).toBeTruthy();
      expect(tool.ui.label).toBeTruthy();
      expect(["shopping", "ui", "memory", "web"]).toContain(tool.category);
    }
  });

  test("tool names are unique", () => {
    const names = ALL_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every tool has a client executor (for live mode)", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.executeClient, `${tool.name} missing executeClient`).toBeTypeOf("function");
    }
  });

  test("getTool returns definition by name", () => {
    expect(getTool("product_search")?.name).toBe("product_search");
    expect(getTool("nonExistent")).toBeUndefined();
  });

  test("getToolNames returns all names", () => {
    const names = getToolNames();
    expect(names).toContain("product_search");
    expect(names).toContain("product_highlight");
    expect(names).toContain("order_create");
    expect(names).toContain("order_track");
    expect(names).toContain("web_search");
    expect(names).toContain("web_fetch_url");
    expect(names.length).toBe(ALL_TOOLS.length);
  });

  test("all 40 tools are registered (25 original + 7 panel-management + 5 order/address + 3 gallery)", () => {
    expect(ALL_TOOLS.length).toBe(40);
  });

  test("shopping tools include order tools and address tools", () => {
    expect(TOOLS.order_create).toBeDefined();
    expect(TOOLS.order_track).toBeDefined();
    expect(TOOLS.product_list_categories).toBeDefined();
    expect(TOOLS.delivery_list_cities).toBeDefined();
    expect(TOOLS.order_create.parameters.properties.cart).toBeDefined();
    expect(TOOLS.order_track.parameters.properties.order_number).toBeDefined();
    expect(TOOLS.order_list).toBeDefined();
    expect(TOOLS.address_list).toBeDefined();
    expect(TOOLS.address_add).toBeDefined();
    expect(TOOLS.address_remove).toBeDefined();
    expect(TOOLS.address_set_default).toBeDefined();
  });

  test("web tools include web_search and web_fetch_url", () => {
    expect(TOOLS.web_search).toBeDefined();
    expect(TOOLS.web_fetch_url).toBeDefined();
  });

  test("toolUiConfig has entry for every tool", () => {
    for (const tool of ALL_TOOLS) {
      expect(toolUiConfig[tool.name], `missing UI config for ${tool.name}`).toBeDefined();
      expect(toolUiConfig[tool.name].label).toBeTruthy();
    }
  });

  test("UI_ONLY_TOOLS contains only ui category tools", () => {
    expect(UI_ONLY_TOOLS.has("product_highlight")).toBe(true);
    expect(UI_ONLY_TOOLS.has("product_open_detail")).toBe(true);
    expect(UI_ONLY_TOOLS.has("product_close_detail")).toBe(true);
    expect(UI_ONLY_TOOLS.has("product_scroll_to")).toBe(true);
    expect(UI_ONLY_TOOLS.has("product_search")).toBe(false);
    expect(UI_ONLY_TOOLS.has("order_create")).toBe(false);
  });
});

// ── Live Mode Adapter Tests ──────────────────────────────────────────────────

describe("getLiveModeDeclarations", () => {
  const declarations = getLiveModeDeclarations();

  test("returns all tools with correct shape", () => {
    expect(declarations.length).toBe(ALL_TOOLS.length);
    for (const d of declarations) {
      expect(d.name).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.parameters.type).toBe("object");
    }
  });

  test("all tool names from registry are present", () => {
    const declNames = declarations.map(d => d.name);
    for (const tool of ALL_TOOLS) {
      expect(declNames).toContain(tool.name);
    }
  });

  test("schemas are Gemini-compatible (no union types)", () => {
    for (const d of declarations) {
      const props = d.parameters.properties;
      for (const [key, val] of Object.entries(props)) {
        const v = val as Record<string, unknown>;
        if (v.type) {
          expect(typeof v.type, `${d.name}.${key} type should be a string`).toBe("string");
        }
      }
    }
  });

  test("required fields are subset of properties", () => {
    for (const d of declarations) {
      const propNames = Object.keys(d.parameters.properties);
      for (const req of d.parameters.required) {
        expect(propNames, `${d.name} requires "${req}" but it's not in properties`).toContain(req);
      }
    }
  });
});

// ── Client Tool Executor Tests ───────────────────────────────────────────────

describe("executeClientTool", () => {
  function makeMockCtx() {
    return {
      onHighlight: (_items: Array<{ id: string; reason?: string }>) => {},
      onOpenDetail: (_id: string) => {},
      onCloseDetail: () => {},
      onFilter: (_products: unknown[], _query?: string) => {},
      onScrollTo: (_id: string) => {},
      onAddToWishlist: (_id: string) => {},
      onSaveFact: (_text: string, _category: string) => {},
      onForget: () => {},
      onClearHighlight: () => {},
      onGetUserHighlights: () => [] as string[],
      onAddToCart: (_id: string, _qty?: number) => false,
      onRegisterProduct: (_product: { id: string; name: string; price?: number; currency?: string; imageUrl?: string; productUrl?: string }) => {},
      onRemoveFromCart: (_id: string) => {},
      onUpdateCartQuantity: (_id: string, _qty: number) => {},
      onGetCartContents: () => [] as Array<{ id: string; name: string; price?: number; quantity: number }>,
      onOrderCreated: (_order: { orderNumber?: string; paymentUrl?: string }) => {},
      onAskUser: async (_question: string, _options: string[]) => "",
      onSearch: async (_args: any) => [] as any[],
      onShowPanel: async (_config: any) => null,
      // Phase 5 layout/panel-management handlers (no-op stubs for tests that
      // don't exercise them; individual tests override as needed).
      onOpenPanel: (_type: string, _data?: Record<string, unknown>) => ({ id: "mock", status: "idle" }),
      onClosePanel: (_idOrType: string) => {},
      onFocusPanel: (_id: string) => {},
      onMinimizePanel: (_id: string) => {},
      onFillPanelField: (_idOrType: string, _key: string, _value: unknown) => ({ ok: true as const }),
      onClickPanelAction: (_idOrType: string, _action: string, _args?: unknown[]) => ({ ok: true as const, result: undefined }),
      onVerifyPanel: (_idOrType: string) => ({ ok: true as const }),
      onSetDeliveryEstimate: (_estimate: { city: string; rate: number; currency: string; estimatedDate?: string } | null) => {},
      onGetOrderRecord: (_orderNumber: string) => undefined,
      onUpsertOrderRecord: (_record: any) => {},
      onGetOrderRecords: () => [],
      onListAddresses: () => [],
      onAddAddress: (_data: { label: string; recipientName: string; recipientPhone: string; streetAddress: string; city: string; notes?: string }) => "mock-id",
      onRemoveAddress: (_id: string) => {},
      onSetDefaultAddress: (_id: string) => {},
      onGalleryOpen: (_productId: string, _imageIndex?: number) => {},
      onGalleryClose: () => {},
      onGalleryNavigate: (_imageIndex: number) => {},
    };
  }

  test("product_highlight calls onHighlight with items", async () => {
    let highlighted: Array<{ id: string; reason?: string }> = [];
    const ctx = { ...makeMockCtx(), onHighlight: (items: Array<{ id: string; reason?: string }>) => { highlighted = items; } };
    const result = await executeClientTool(
      { id: "1", name: "product_highlight", args: { items: [{ id: "a", reason: "Best value" }, { id: "b" }] } },
      ctx,
    );
    expect(result.response.highlighted).toBe(2);
    expect(highlighted).toEqual([{ id: "a", reason: "Best value" }, { id: "b" }]);
  });

  test("memory_save_fact calls onSaveFact", async () => {
    let savedText = "";
    const ctx = { ...makeMockCtx(), onSaveFact: (text: string) => { savedText = text; } };
    const result = await executeClientTool(
      { id: "2", name: "memory_save_fact", args: { text: "Size 42", category: "size" } },
      ctx,
    );
    expect(result.response.saved).toBe(true);
    expect(savedText).toBe("Size 42");
  });

  test("memory_forget_all calls onForget", async () => {
    let forgot = false;
    const ctx = { ...makeMockCtx(), onForget: () => { forgot = true; } };
    const result = await executeClientTool(
      { id: "3", name: "memory_forget_all", args: {} },
      ctx,
    );
    expect(result.response.forgotten).toBe(true);
    expect(forgot).toBe(true);
  });

  test("unknown tool returns error response", async () => {
    const result = await executeClientTool(
      { id: "4", name: "nonExistent", args: {} },
      makeMockCtx(),
    );
    expect(result.response.error).toContain("Unknown tool");
  });

  test("product_open_detail calls onOpenDetail", async () => {
    let openedId = "";
    const ctx = { ...makeMockCtx(), onOpenDetail: (id: string) => { openedId = id; } };
    await executeClientTool(
      { id: "5", name: "product_open_detail", args: { product_id: "prod-123" } },
      ctx,
    );
    expect(openedId).toBe("prod-123");
  });

  test("wishlist_add calls onAddToWishlist", async () => {
    let wishId = "";
    const ctx = { ...makeMockCtx(), onAddToWishlist: (id: string) => { wishId = id; } };
    await executeClientTool(
      { id: "6", name: "wishlist_add", args: { product_id: "p1" } },
      ctx,
    );
    expect(wishId).toBe("p1");
  });

  test("product_close_detail calls onCloseDetail", async () => {
    let closed = false;
    const ctx = { ...makeMockCtx(), onCloseDetail: () => { closed = true; } };
    await executeClientTool(
      { id: "7", name: "product_close_detail", args: {} },
      ctx,
    );
    expect(closed).toBe(true);
  });

  test("product_scroll_to calls onScrollTo", async () => {
    let scrollId = "";
    const ctx = { ...makeMockCtx(), onScrollTo: (id: string) => { scrollId = id; } };
    await executeClientTool(
      { id: "8", name: "product_scroll_to", args: { product_id: "x" } },
      ctx,
    );
    expect(scrollId).toBe("x");
  });
});

// ── Prompt Builder Tests ─────────────────────────────────────────────────────

describe("prompt builder", () => {
  test("buildSystemPrompt for text mode contains agent name", () => {
    const prompt = buildTextPrompt({ agentId: "ruka", language: "english" });
    expect(prompt).toContain("Ruka");
    expect(prompt).toContain("TEXT CHAT mode");
  });

  test("buildSystemPrompt for live mode contains voice instructions", () => {
    const prompt = buildLivePrompt({ agentId: "mithu", language: "tamil" });
    expect(prompt).toContain("Mithu");
    expect(prompt).toContain("LIVE VOICE mode");
    expect(prompt).toContain("phone call");
  });

  test("both modes share the same base prompt content", () => {
    const textPrompt = buildTextPrompt({ agentId: "ruka", language: "english" });
    const livePrompt = buildLivePrompt({ agentId: "ruka", language: "english" });
    expect(textPrompt).toContain("Kapruka");
    expect(livePrompt).toContain("Kapruka");
    expect(textPrompt).toContain("SHOPPING POLICY");
    expect(livePrompt).toContain("SHOPPING POLICY");
    expect(textPrompt).toContain("CREATE ORDER SAFETY");
    expect(livePrompt).toContain("CREATE ORDER SAFETY");
  });

  test("language directive is injected", () => {
    const sinhalaPrompt = buildTextPrompt({ agentId: "ruka", language: "sinhala" });
    expect(sinhalaPrompt).toContain("Sinhala");
    expect(sinhalaPrompt).toContain("Singlish");
  });

  test("tamil language directive is injected", () => {
    const tamilPrompt = buildTextPrompt({ agentId: "ruka", language: "tamil" });
    expect(tamilPrompt).toContain("Tamil");
    expect(tamilPrompt).toContain("Tanglish");
  });

  test("getLanguageDirective returns correct string for each language", () => {
    expect(getLanguageDirective("english")).toContain("English");
    expect(getLanguageDirective("sinhala")).toContain("Sinhala");
    expect(getLanguageDirective("tamil")).toContain("Tamil");
  });

  test("saved facts are injected", () => {
    const prompt = buildTextPrompt({
      agentId: "ruka",
      language: "english",
      savedFacts: [{ text: "Shoe size is 42", category: "size" }],
    });
    expect(prompt).toContain("Shoe size is 42");
    expect(prompt).toContain("Remembered facts");
  });

  test("session context is injected", () => {
    const prompt = buildTextPrompt({
      agentId: "ruka",
      language: "english",
      sessionContext: {
        isReturningUser: true,
        preferredCity: "Colombo",
        orderCount: 5,
      },
    });
    expect(prompt).toContain("returning user");
    expect(prompt).toContain("Colombo");
    expect(prompt).toContain("5 orders");
  });

  test("cart context is injected", () => {
    const prompt = buildTextPrompt({
      agentId: "ruka",
      language: "english",
      cartContext: "1. Chocolate Cake x1 (LKR 3500)",
    });
    expect(prompt).toContain("Chocolate Cake");
    expect(prompt).toContain("Current cart");
  });

  test("agent personality is injected", () => {
    const rukaPrompt = buildTextPrompt({ agentId: "ruka", language: "english" });
    const mithuPrompt = buildTextPrompt({ agentId: "mithu", language: "english" });
    expect(rukaPrompt).toContain("BOLD AND EMOTIONAL");
    expect(mithuPrompt).toContain("CONCISE AND MOODY");
  });

  test("empty context produces valid prompt", () => {
    const prompt = buildSystemPrompt("text");
    expect(prompt).toContain("Kapruka");
    expect(prompt).toContain("English");
  });

  test("live and text prompts are different (mode overlay)", () => {
    const textPrompt = buildTextPrompt({ agentId: "ruka", language: "english" });
    const livePrompt = buildLivePrompt({ agentId: "ruka", language: "english" });
    expect(textPrompt).not.toBe(livePrompt);
    expect(textPrompt).toContain("TEXT CHAT");
    expect(livePrompt).toContain("LIVE VOICE");
  });
});
