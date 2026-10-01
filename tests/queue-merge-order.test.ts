import { describe, expect, test } from "bun:test";
import { sortForMerge } from "../src/lib/queue-merge-order";

describe("merging queued posts", () => {
  test("oldest post first, split parts in numeric order", () => {
    const t = "2026-10-01T07:00:00.000Z";
    const items = [
      { id: "newest", created_at: "2026-10-01T07:10:00.000Z", source_ref: "discord:3" },
      { id: "p10", created_at: t, source_ref: "discord:1#10" },
      { id: "p2", created_at: t, source_ref: "discord:1#2" },
      { id: "middle", created_at: "2026-10-01T07:05:00.000Z", source_ref: "discord:2" },
      { id: "p1", created_at: t, source_ref: "discord:1#part1" },
    ];
    expect(sortForMerge(items).map((i) => i.id)).toEqual(["p1", "p2", "p10", "middle", "newest"]);
  });
});
