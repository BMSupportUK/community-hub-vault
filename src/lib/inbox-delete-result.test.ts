// @ts-ignore -- Bun supplies the test runtime, outside app types.
import { expect, test } from "bun:test";
import { inboxDeletionResult, visibleInboxThreads } from "./inbox-delete-result";

test("deleted selected messages disappear while reported messages remain selected", () => {
  expect(inboxDeletionResult(["deleted", "reported"], ["reported", "received"])).toEqual({ removed: ["deleted"], kept: ["reported"] });
});
test("a conversation with no remaining messages disappears from the inbox list", () => {
  expect(visibleInboxThreads([{ id: "empty", last_at: null }, { id: "received", last_at: "2026-11-12T09:10:00Z" }])).toEqual([{ id: "received", last_at: "2026-11-12T09:10:00Z" }]);
});