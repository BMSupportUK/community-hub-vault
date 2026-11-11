// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { roomsWatching, streamClash } from "./player-stream-claim";

const now = Date.parse("2026-11-10T18:30:00Z");
const pc = (id, watching, seenAgoMs = 10_000) => ({ id, name: "BM Player Windows", platform: "windows", last_seen_at: new Date(now - seenAgoMs).toISOString(), watching_kind: watching ? "live" : null, watching_title: watching ? "BBC Two | FHD" : null });

test("one-connection login already watching on another PC asks to take over", () => {
  expect(streamClash([pc("a", true)], "me", 1, now).map((d) => d.id)).toEqual(["a"]);
});
test("two-connection login lets a second device play", () => {
  expect(streamClash([pc("a", true)], "me", 2, now)).toEqual([]);
});
test("other device not watching, or offline over 3 minutes, never blocks", () => {
  expect(streamClash([pc("a", false), pc("b", true, 4 * 60_000)], "me", 1, now)).toEqual([]);
});
test("this device's own stream never counts against it", () => {
  expect(streamClash([pc("me", true)], "me", 1, now)).toEqual([]);
});
test("triple room with one other room watching lets this box open 2 screens, not 3", () => {
  expect(streamClash([pc("a", true)], "me", 3, now, 2)).toEqual([]);
  expect(streamClash([pc("a", true)], "me", 3, now, 3).map((d) => d.id)).toEqual(["a"]);
});
test("multi room (2) with nobody else watching allows 2 screens on one box", () => {
  expect(streamClash([], "me", 2, now, 2)).toEqual([]);
});
test("who's watching lists only other live rooms", () => {
  expect(roomsWatching([pc("a", true), pc("me", true), pc("b", false)], "me", now)).toEqual([{ name: "BM Player Windows", platform: "windows", title: "BBC Two | FHD" }]);
});
