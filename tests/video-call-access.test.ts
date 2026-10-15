import { describe, expect, it } from "vitest";
import { canAnswerTicketVideoCall, canStartTicketVideoCall, canTakeVideoCalls } from "../src/lib/video-call-access";

describe("video call access", () => {
  it("only staff, admin and management take calls", () => {
    expect(canTakeVideoCalls(["staff"])).toBe(true);
    expect(canTakeVideoCalls(["management"])).toBe(true);
    expect(canTakeVideoCalls(["admin"])).toBe(true);
    expect(canTakeVideoCalls(["moderator"])).toBe(false);
    expect(canTakeVideoCalls(["subscriber"])).toBe(false);
  });
  it("calls only start during opening hours", () => {
    expect(canStartTicketVideoCall({ roles: [], isOwner: true, ticketStatus: "open", businessOpen: false })).toBe(false);
    expect(canStartTicketVideoCall({ roles: [], isOwner: true, ticketStatus: "open", businessOpen: true })).toBe(true);
  });
  it("other members can't start a call on someone else's ticket", () => {
    expect(canStartTicketVideoCall({ roles: ["subscriber"], isOwner: false, ticketStatus: "open", businessOpen: true })).toBe(false);
  });
  it("a customer's call is answered by staff, a staff call by the customer", () => {
    expect(canAnswerTicketVideoCall({ roles: ["staff"], isOwner: false, startedByOwner: true })).toBe(true);
    expect(canAnswerTicketVideoCall({ roles: [], isOwner: true, startedByOwner: true })).toBe(false);
    expect(canAnswerTicketVideoCall({ roles: [], isOwner: true, startedByOwner: false })).toBe(true);
  });
});
