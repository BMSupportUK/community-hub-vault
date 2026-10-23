import { describe, expect, test } from "bun:test";
import { screenShareInProgress, screenShareDestination, canOpenTvRemoteOverview, canUseTvRemote } from "../src/lib/tv-remote";

describe("screen share destinations and overview access", () => {
  test("order joins open the same order screen", () => {
    expect(screenShareDestination("order", "order-123")).toEqual({ to: "/screen-share/order/$orderId", params: { orderId: "order-123" } });
  });
  test("ticket joins open the same ticket screen", () => {
    expect(screenShareDestination("ticket", "ticket-456")).toEqual({ to: "/screen-share/ticket/$ticketId", params: { ticketId: "ticket-456" } });
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