import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Guard the deployed database write boundary as well as the UI filter.
const sql = readFileSync(new URL("../drizzle/migrations/0359_stop_preview_connection_recording.sql", import.meta.url), "utf8");

test("preview polls return before inserting or extending connection history", () => {
  const guard = sql.indexOf("IF NEW.watching_since IS NULL OR NEW.watching_preview IS TRUE THEN RETURN NEW; END IF;");
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(sql.indexOf("INSERT INTO public.player_connection_log"));
});

test("preview-to-fullscreen transitions trigger real playback logging", () => {
  expect(sql).toContain("UPDATE OF watching_since, last_seen_at, watching_title, watching_preview");
  expect(sql).toContain("preview = false");
});