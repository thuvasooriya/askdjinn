import { describe, expect, test } from "bun:test";
import {
  isBubbleTool,
  getToolBubbleRender,
  registerToolBubble,
} from "../lib/stores/tool-render-registry";

describe("tool-render-registry defaults", () => {
  test("delivery_check is registered as a bubble tool", () => {
    expect(isBubbleTool("delivery_check")).toBe(true);
  });

  test("order_create is registered as a bubble tool", () => {
    expect(isBubbleTool("order_create")).toBe(true);
  });

  test("unregistered tools are not bubble tools", () => {
    expect(isBubbleTool("product_search")).toBe(false);
    expect(isBubbleTool("nonexistent")).toBe(false);
  });

  test("delivery_check render has correct options", () => {
    const render = getToolBubbleRender("delivery_check");
    expect(render).toBeDefined();
    expect(render!.options.evictable).toBe(true);
    expect(render!.options.timeout).toBe(20_000);
  });

  test("order_create render is permanent (not evictable)", () => {
    const render = getToolBubbleRender("order_create");
    expect(render).toBeDefined();
    expect(render!.options.evictable).toBe(false);
    expect(render!.options.timeout).toBe(30_000);
  });

  test("cart_add is registered as a bubble tool", () => {
    expect(isBubbleTool("cart_add")).toBe(true);
    const render = getToolBubbleRender("cart_add");
    expect(render).toBeDefined();
    expect(render!.options.evictable).toBe(true);
    expect(render!.options.timeout).toBe(12_000);
  });

  test("getToolBubbleRender returns undefined for unknown tools", () => {
    expect(getToolBubbleRender("unknown")).toBeUndefined();
  });
});

describe("registerToolBubble", () => {
  test("registers a new tool dynamically", () => {
    const noop = () => null;
    registerToolBubble({
      tool: "test_custom_tool",
      extract: noop,
      component: noop as never,
      options: { timeout: 5_000, evictable: true },
    });
    expect(isBubbleTool("test_custom_tool")).toBe(true);
    const render = getToolBubbleRender("test_custom_tool");
    expect(render!.options.timeout).toBe(5_000);
  });
});
