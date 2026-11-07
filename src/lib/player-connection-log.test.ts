// @ts-nocheck — tests run with bun:test.
import { expect, test } from "bun:test";
import { watchedConnections } from "./player-connection-log";

test("Connection log excludes previews while preserving full-screen playback", () => {
  expect(watchedConnections([
    { id: "preview", preview: true },
    { id: "fullscreen", preview: false },
    { id: "legacy", preview: null },
  ]).map((row) => row.id)).toEqual(["fullscreen", "legacy"]);
});