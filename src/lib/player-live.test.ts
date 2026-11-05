// @ts-nocheck — bun:test types are not part of the app typecheck; tests run with `bun test`.
import { expect, test } from "bun:test";
import { formatElapsed, isLive, presenceUpdate } from "./player-live";

const base = { login: "joe", version: "2.35", watching: null, ip: "1.2.3.4", cf: { city: "Leeds", country: "GB", latitude: "53.8", longitude: "-1.5" }, headerCountry: null };

test("device seen within 3 minutes is live, older is not", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  expect(isLive("2026-11-02T11:57:30Z", now)).toBe(true);
  expect(isLive("2026-11-02T11:56:00Z", now)).toBe(false);
});

test("connection time continues while online and restarts after going offline", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  expect(presenceUpdate({ ...base, now, lastSeenAt: "2026-11-02T11:59:00Z", connectedSince: "2026-11-02T10:00:00Z" }).connected_since).toBe("2026-11-02T10:00:00Z");
  expect(presenceUpdate({ ...base, now, lastSeenAt: "2026-11-02T11:00:00Z", connectedSince: "2026-11-02T10:00:00Z" }).connected_since).toBe("2026-11-02T12:00:00.000Z");
});

test("stores location and what is playing", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const u = presenceUpdate({ ...base, now, lastSeenAt: null, connectedSince: null, watching: { kind: "live", title: "Sky Sports 1", since: now + 60_000 } });
  expect(u.geo_city).toBe("Leeds"); expect(u.geo_lat).toBe(53.8);
  expect(u.watching_title).toBe("Sky Sports 1");
  expect(u.watching_since).toBe("2026-11-02T12:00:00.000Z");
});

test("elapsed time format", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  expect(formatElapsed("2026-11-02T10:55:51Z", now)).toBe("1h 04m 09s");
  expect(formatElapsed("2026-11-02T11:58:55Z", now)).toBe("1m 05s");
});

import { watchCredit as wc } from "./player-live";
test("watch credit counts the minute since the last check-in while playing", () => {
  const now = Date.parse("2026-11-05T08:00:00Z");
  expect(wc({ now, lastSeenAt: "2026-11-05T07:59:00Z", watchingKind: "live" })).toEqual({ kind: "live", seconds: 60 });
});
test("watch credit is nothing when nothing was playing or the app went offline", () => {
  const now = Date.parse("2026-11-05T08:00:00Z");
  expect(wc({ now, lastSeenAt: "2026-11-05T07:59:00Z", watchingKind: null })).toBeNull();
  expect(wc({ now, lastSeenAt: "2026-11-05T07:50:00Z", watchingKind: "film" })).toBeNull();
});

test("previews are flagged so viewing hours skip them, real playback is not", () => {
  const now = Date.parse("2026-11-05T08:00:00Z");
  const preview = presenceUpdate({ ...base, now, lastSeenAt: null, connectedSince: null, watching: { kind: "live", title: "Sky Sports 1", since: now, preview: true } });
  expect(preview.watching_preview).toBe(true);
  expect(preview.watching_title).toBe("Sky Sports 1"); // still shown on Live connections
  const real = presenceUpdate({ ...base, now, lastSeenAt: null, connectedSince: null, watching: { kind: "live", title: "Sky Sports 1", since: now } });
  expect(real.watching_preview).toBe(false);
  const idle = presenceUpdate({ ...base, now, lastSeenAt: null, connectedSince: null });
  expect(idle.watching_preview).toBe(false);
});
