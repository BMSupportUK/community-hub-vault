import { describe, expect, test } from "bun:test";
import { announcementMatchesUser } from "../src/lib/player-announcement-audience";

describe("bottom-screen announcement audience", () => {
  test("a selected user receives the announcement on all their linked devices only", () => {
    expect(announcementMatchesUser("dane", { user_id: "dane", offsite_customer_id: null })).toBe(true);
    expect(announcementMatchesUser("dane", { user_id: "another-user", offsite_customer_id: null })).toBe(false);
    expect(announcementMatchesUser("dane", { user_id: null, offsite_customer_id: null })).toBe(false);
    expect(announcementMatchesUser("dane", { user_id: null, offsite_customer_id: "dane" })).toBe(false);
    expect(announcementMatchesUser("dane", { user_id: "dane", offsite_customer_id: "other" })).toBe(false);
  });
  test("everyone remains available for existing announcements with no selected user", () => {
    expect(announcementMatchesUser(null, { user_id: "dane", offsite_customer_id: null })).toBe(true);
    expect(announcementMatchesUser(null, { user_id: null, offsite_customer_id: "offsite" })).toBe(true);
  });
});