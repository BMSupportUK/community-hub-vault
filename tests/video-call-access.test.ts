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

import { pickCallHost, leavingEndsCall, assistWaitSeconds } from "../src/lib/video-call-access";

const m = (userId: string, joinedAt: number, host = false) => ({ userId, name: userId, role: "staff", joinedAt, host });

it("the flagged host keeps carrying the call", () => {
  expect(pickCallHost([m("a", 1), m("b", 2, true)])).toBe("b");
});
it("when the host leaves the longest-present staff member takes over", () => {
  expect(pickCallHost([m("c", 30), m("b", 20)])).toBe("b");
});
it("a staff member leaving never ends the call while others remain", () => {
  expect(leavingEndsCall([m("a", 1), m("b", 2)], "a")).toBe(false);
  expect(leavingEndsCall([m("a", 1)], "a")).toBe(true);
});
it("help requests wait two minutes between sends", () => {
  expect(assistWaitSeconds(null, 1000)).toBe(0);
  expect(assistWaitSeconds(0, 60_000)).toBe(60);
  expect(assistWaitSeconds(0, 120_000)).toBe(0);
});

import { isVideoCommand, canUseVideoCommand, parseVideoInvite, videoInviteMessage } from "../src/lib/video-call-access";

it("/video command is only for admin, management and staff", () => {
  expect(canUseVideoCommand(["staff"])).toBe(true);
  expect(canUseVideoCommand(["management"])).toBe(true);
  expect(canUseVideoCommand(["admin"])).toBe(true);
  expect(canUseVideoCommand(["moderator"])).toBe(false);
  expect(canUseVideoCommand(["member"])).toBe(false);
});
it("recognises the /video command exactly", () => {
  expect(isVideoCommand("/video")).toBe(true);
  expect(isVideoCommand(" /VIDEO ")).toBe(true);
  expect(isVideoCommand("/video please")).toBe(false);
  expect(isVideoCommand("video")).toBe(false);
});
it("invite messages carry the token for the QR code", () => {
  const t = "a".repeat(64);
  expect(parseVideoInvite(videoInviteMessage(t))?.token).toBe(t);
  expect(parseVideoInvite("hello")).toBeNull();
});
