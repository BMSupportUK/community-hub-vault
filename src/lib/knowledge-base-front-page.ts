// Stable identities, not sort_order/newest/badges, define the approved front page.
export const KB_FRONT_CATEGORY_ID = "7f3789fb-e9d8-408e-893d-0c933ed80f83";
export const KB_FRONT_GUIDE_IDS = [
  "2425814c-fc19-4294-9f3b-696c66024c27",
  "2cdd5514-f5d6-40d2-b53e-fbe63524599c",
  "86265c25-cd0c-4c3c-bb16-279fcd9b96bc",
  "b4c52ea5-1fda-472c-b748-f62fc7b15fe3",
] as const;
export const KB_CATEGORY_IDS = [
  KB_FRONT_CATEGORY_ID,
  "22b99c85-97cf-4546-96c2-a0ad944e3eff",
  "0aeef402-5f79-4857-a56b-09107dad8096",
  "16aa8433-2c8f-559c-bde1-974d336d2864",
  "9244bba3-808f-4cd6-b651-07d959510a75",
  "2088f72f-c902-4d63-b523-74698b2dddeb",
  "dc5ea405-ffdd-48aa-bd97-8587c4c97b90",
  "616d69de-2510-4ad4-9da3-d784aceb4ade",
] as const;

export const isLockedKnowledgeGuide = (id: string) => KB_FRONT_GUIDE_IDS.some((locked) => locked === id);
export const isLockedKnowledgeCategory = (id: string) => KB_CATEGORY_IDS.some((locked) => locked === id);

export function knowledgeFrontGuides<T extends { id: string }>(articles: T[]): T[] {
  return KB_FRONT_GUIDE_IDS.flatMap((id) => {
    const article = articles.find((item) => item.id === id);
    return article ? [article] : [];
  });
}

export function knowledgeCategoryOrder<T extends { id: string; sort_order: number }>(categories: T[]): T[] {
  const rank = (id: string) => KB_CATEGORY_IDS.findIndex((item) => item === id);
  return [...categories].sort((a, b) => {
    const ar = rank(a.id), br = rank(b.id);
    if (ar >= 0 || br >= 0) return (ar < 0 ? KB_CATEGORY_IDS.length : ar) - (br < 0 ? KB_CATEGORY_IDS.length : br);
    return a.sort_order - b.sort_order;
  });
}