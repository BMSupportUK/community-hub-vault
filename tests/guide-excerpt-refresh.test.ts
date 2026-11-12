import { describe, expect, test } from "bun:test";
import { refreshAutoGuideExcerpt } from "../src/lib/sports-listing-format";

const BODY =
  "<div>Thursday, 12th November</div><div><br></div><div>12:00 GMT</div><div>ATP STOCKHOLM OPEN</div><div>Sky Sports Tennis</div>";

describe("refreshAutoGuideExcerpt", () => {
  test("replaces a stale auto-generated summary with the first listing", () => {
    expect(refreshAutoGuideExcerpt("Wednesday, 23rd September · 09:00 BST", BODY)).toBe(
      "Thursday, 12th November · 12:00 GMT",
    );
  });

  test("fills an empty summary from the first listing", () => {
    expect(refreshAutoGuideExcerpt(null, BODY)).toBe("Thursday, 12th November · 12:00 GMT");
    expect(refreshAutoGuideExcerpt("", BODY)).toBe("Thursday, 12th November · 12:00 GMT");
  });

  test("keeps a staff-typed custom summary", () => {
    expect(refreshAutoGuideExcerpt("All the tennis this week", BODY)).toBe("All the tennis this week");
  });

  test("keeps the summary when the body has no timed listings", () => {
    expect(refreshAutoGuideExcerpt("Custom note", "<div>No listings yet</div>")).toBe("Custom note");
    expect(refreshAutoGuideExcerpt(null, null)).toBeNull();
  });
});
