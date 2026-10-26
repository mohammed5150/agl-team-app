import { describe, it, expect } from "vitest";
import {
  sanitizeStudioBlocks, validateStudioPage, blankChecklistItem,
  MAX_TITLE_LENGTH, MAX_BLOCK_TEXT_LENGTH, MAX_CHECKLIST_ITEMS, MAX_BLOCKS_PER_PAGE,
} from "../src/studioPages.js";

describe("sanitizeStudioBlocks", () => {
  it("drops blocks with no content", () => {
    expect(sanitizeStudioBlocks([
      { type:"text", text:"  " },
      { type:"heading", text:"" },
      { type:"checklist", items:[] },
    ])).toEqual([]);
  });

  it("keeps well-formed blocks and trims text", () => {
    expect(sanitizeStudioBlocks([
      { type:"heading", text:"  Shift Handover  " },
      { type:"text", text:"Runway 13L inspected" },
    ])).toEqual([
      { type:"heading", text:"Shift Handover" },
      { type:"text", text:"Runway 13L inspected" },
    ]);
  });

  it("drops empty checklist items but keeps the rest", () => {
    expect(sanitizeStudioBlocks([
      { type:"checklist", items:[{ text:"Check CCR", checked:true }, { text:"  " }, { text:"Lock gate", checked:false }] },
    ])).toEqual([
      { type:"checklist", items:[{ text:"Check CCR", checked:true }, { text:"Lock gate", checked:false }] },
    ]);
  });

  it("drops a checklist block whose items are all empty", () => {
    expect(sanitizeStudioBlocks([{ type:"checklist", items:[{ text:"" }] }])).toEqual([]);
  });

  it("drops unknown block types rather than crashing", () => {
    expect(sanitizeStudioBlocks([{ type:"video", text:"x" }, { type:"text", text:"ok" }]))
      .toEqual([{ type:"text", text:"ok" }]);
  });

  it("is tolerant of non-array input", () => {
    expect(sanitizeStudioBlocks(null)).toEqual([]);
    expect(sanitizeStudioBlocks(undefined)).toEqual([]);
  });

  it("caps blocks per page and checklist items per block", () => {
    const many = Array.from({ length: MAX_BLOCKS_PER_PAGE + 10 }, (_, i) => ({ type:"text", text:`b${i}` }));
    expect(sanitizeStudioBlocks(many)).toHaveLength(MAX_BLOCKS_PER_PAGE);

    const manyItems = Array.from({ length: MAX_CHECKLIST_ITEMS + 10 }, (_, i) => ({ text:`i${i}` }));
    expect(sanitizeStudioBlocks([{ type:"checklist", items:manyItems }])[0].items).toHaveLength(MAX_CHECKLIST_ITEMS);
  });

  it("caps text length", () => {
    const long = "x".repeat(MAX_BLOCK_TEXT_LENGTH + 500);
    expect(sanitizeStudioBlocks([{ type:"text", text:long }])[0].text).toHaveLength(MAX_BLOCK_TEXT_LENGTH);
  });
});

describe("blankChecklistItem", () => {
  it("defaults to unchecked with trimmed text", () => {
    expect(blankChecklistItem("  hello ")).toEqual({ text:"hello", checked:false });
    expect(blankChecklistItem()).toEqual({ text:"", checked:false });
  });
});

describe("validateStudioPage", () => {
  it("requires a title", () => {
    const v = validateStudioPage({ title:"", blocks:[{ type:"text", text:"hi" }] });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("Give the page a title");
  });

  it("rejects a title over the length cap", () => {
    const v = validateStudioPage({ title:"x".repeat(MAX_TITLE_LENGTH + 1), blocks:[{ type:"text", text:"hi" }] });
    expect(v.ok).toBe(false);
  });

  it("requires at least one block with real content", () => {
    const v = validateStudioPage({ title:"Handover", blocks:[{ type:"text", text:"  " }] });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("Add at least one block with content");
  });

  it("accepts a well-formed page and returns the sanitized title and blocks", () => {
    const v = validateStudioPage({ title:"  Handover  ", blocks:[{ type:"heading", text:"Night Shift" }] });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.title).toBe("Handover");
    expect(v.blocks).toEqual([{ type:"heading", text:"Night Shift" }]);
  });
});
