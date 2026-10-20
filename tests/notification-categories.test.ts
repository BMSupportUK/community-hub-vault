import { test, expect } from "bun:test";
import { notifyCategory, categoriesForRoles } from "../src/lib/notification-categories";

test("alert types map to their own switch", () => {
  expect(notifyCategory("dm", "dm-1", "/inbox")).toBe("messages");
  expect(notifyCategory("ticket_raised")).toBe("new_tickets");
  expect(notifyCategory("ticket-reply", "ticket-reply-1")).toBe("ticket_replies");
  expect(notifyCategory(undefined, "incident-5", "/status")).toBe("outages");
  expect(notifyCategory(undefined, "bplan:u:2026-10-19:Break 1", "/clock")).toBe("breaks");
  expect(notifyCategory(undefined, "slot:1:start:warn", "/clock")).toBe("shifts");
  expect(notifyCategory("order_placed")).toBe("new_orders");
  expect(notifyCategory("order_paid")).toBe("my_orders");
});

test("members only see member alerts", () => {
  const ids = categoriesForRoles([]).map((c) => c.id);
  expect(ids).not.toContain("shifts");
  expect(ids).not.toContain("new_tickets");
  expect(ids).not.toContain("new_orders");
  expect(ids).toContain("messages");
});

test("staff see staff alerts but not admin-only ones", () => {
  const ids = categoriesForRoles(["staff"]).map((c) => c.id);
  expect(ids).toContain("shifts");
  expect(ids).not.toContain("new_orders");
  expect(ids).not.toContain("access_requests");
});

test("moderators see access requests; admins see orders", () => {
  expect(categoriesForRoles(["moderator"]).map((c) => c.id)).toContain("access_requests");
  expect(categoriesForRoles(["admin"]).map((c) => c.id)).toContain("new_orders");
});

test("every alert the site sends has its own switch, none fall into Other", () => {
  for (const k of ["order","ticket","signup","ticket_reply","ticket_picked_up","shift_start","shift_end","guide_passcode","content_report","cover_request","staff_missed_clock_in","ticket_handover","incident_created","install_guides_access_request","app_download_access_request","ticket_help_requested","live_help_assist"]) {
    expect(notifyCategory(k)).not.toBe("general");
  }
  expect(categoriesForRoles(["admin"]).map((c) => c.id)).not.toContain("general");
});
