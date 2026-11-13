import { describe, expect, test } from "bun:test";
import { KB_FRONT_GUIDE_IDS, KB_CATEGORY_IDS, knowledgeFrontGuides, knowledgeCategoryOrder, isLockedKnowledgeGuide, isLockedKnowledgeCategory } from "../src/lib/knowledge-base-front-page";

describe("approved Knowledge Base front page", () => {
  test("a new guide cannot displace any of the four approved guides", () => {
    const articles = [{ id: "new-guide", sort_order: -100 }, ...[...KB_FRONT_GUIDE_IDS].reverse().map((id) => ({ id, sort_order: 0 }))];
    expect(knowledgeFrontGuides(articles).map((a) => a.id)).toEqual([
      "2425814c-fc19-4294-9f3b-696c66024c27", "2cdd5514-f5d6-40d2-b53e-fbe63524599c",
      "86265c25-cd0c-4c3c-bb16-279fcd9b96bc", "b4c52ea5-1fda-472c-b748-f62fc7b15fe3",
    ]);
  });
  test("new categories follow all eight existing categories even with earlier sort order", () => {
    const categories = [{ id: "new-category", sort_order: -100 }, ...[...KB_CATEGORY_IDS].reverse().map((id) => ({ id, sort_order: 0 }))];
    expect(knowledgeCategoryOrder(categories).map((c) => c.id)).toEqual([...KB_CATEGORY_IDS, "new-category"]);
  });
  test("all four screenshot guides are protected, while new articles remain editable", () => {
    expect(KB_FRONT_GUIDE_IDS.map(isLockedKnowledgeGuide)).toEqual([true, true, true, true]);
    expect(isLockedKnowledgeGuide("new-guide")).toBe(false);
  });
  test("existing categories are protected, while added categories remain editable", () => {
    expect(KB_CATEGORY_IDS.map(isLockedKnowledgeCategory)).toEqual(Array(8).fill(true));
    expect(isLockedKnowledgeCategory("new-category")).toBe(false);
  });
});