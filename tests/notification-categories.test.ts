import { test, expect } from "bun:test";
import { notifyCategory } from "../src/lib/notification-categories";

test("alert types map to their own switch", () => {
  expect(notifyCategory("dm", "dm-1", "/inbox")).toBe("messages");
  expect(notifyCategory("ticket", null, "/tickets/1")).toBe("tickets");
  expect(notifyCategory(undefined, "incident-5", "/status")).toBe("outages");
  expect(notifyCategory("break", "break-x-start", "/clock")).toBe("shifts");
  expect(notifyCategory(undefined, "something", "/home")).toBe("general");
});
