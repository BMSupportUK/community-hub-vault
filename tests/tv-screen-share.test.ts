import { describe, expect, test } from "bun:test";
import { screenShareInProgress, screenShareDestination, screenShareRequestDestination, canOpenTvRemoteOverview, canUseTvRemote, orderScreenShareAllowed } from "../src/lib/tv-remote";

describe("screen share destinations and overview access", () => {
  test("request box opens the linked secure order on Screen share", () => {
    expect(screenShareRequestDestination("order", "order-123")).toEqual({ to: "/admin-secure-page", search: { order: "order-123", tab: "screen" } });
  });
  test("request box opens the linked ticket screen, never TV Remote", () => {
    expect(screenShareRequestDestination("ticket", "ticket-456")).toEqual({ to: "/tickets", search: { id: "ticket-456", tab: "screen" } });
    expect(screenShareRequestDestination("order", null)).toBeNull();
  });
  test("order joins open the same order screen", () => {
    expect(screenShareDestination("order", "order-123")).toEqual({ to: "/screen-share/order/$orderId", params: { orderId: "order-123" } });
  });
  test("ticket joins open the same ticket screen", () => {
    expect(screenShareDestination("ticket", "ticket-456")).toEqual({ to: "/tickets", search: { id: "ticket-456", tab: "screen" } });
  });
  test("only admin can open the TV overview", () => {
    expect(canOpenTvRemoteOverview(["admin"])).toBe(true);
    for (const role of ["management", "staff", "moderator", "user"]) expect(canOpenTvRemoteOverview([role])).toBe(false);
  });
  test("staff and management retain order and ticket help", () => {
    expect(canUseTvRemote(["staff"])).toBe(true);
    expect(canUseTvRemote(["management"])).toBe(true);
  });
});

describe("repeat screen share requests", () => {
  test("customers cannot start order sharing until staff invite them", () => {
    expect(orderScreenShareAllowed(false, null)).toBe(false);
    expect(orderScreenShareAllowed(false, "ended")).toBe(false);
    expect(orderScreenShareAllowed(true, null)).toBe(true);
    expect(orderScreenShareAllowed(false, "active")).toBe(true);
  });
  test("an ended session allows another request immediately", () => {
    expect(screenShareInProgress("ended")).toBe(false);
    expect(screenShareInProgress(null)).toBe(false);
  });
  test("an expired session allows another request", () => {
    expect(screenShareInProgress("expired")).toBe(false);
  });
  test("a waiting or connected session remains in progress", () => {
    for (const status of ["pending", "claimed", "active"]) {
      expect(screenShareInProgress(status)).toBe(true);
    }
  });
});