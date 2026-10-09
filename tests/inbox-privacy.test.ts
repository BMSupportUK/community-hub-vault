import { expect, test } from "bun:test";
import { canMessage } from "../src/lib/inbox-privacy";

test("everyone allows any member", () => expect(canMessage("everyone", ["user"], false)).toBe(true));
test("friends only blocks non-friends", () => expect(canMessage("friends", ["user"], false)).toBe(false));
test("friends only allows friends", () => expect(canMessage("friends", ["user"], true)).toBe(true));
test("staff only allows moderators", () => expect(canMessage("staff", ["moderator"], false)).toBe(true));
test("staff only blocks members", () => expect(canMessage("staff", ["user"], true)).toBe(false));
test("nobody blocks staff", () => expect(canMessage("nobody", ["staff"], true)).toBe(false));
test("admin can always message", () => expect(canMessage("nobody", ["admin"], false)).toBe(true));
test("management can always message", () => expect(canMessage("nobody", ["management"], false)).toBe(true));
