import { test, expect } from "bun:test";
import { readdirSync } from "node:fs";
import { PHONE_ALERTS } from "../src/lib/phone-alerts";

test("website has the same recording for every phone alert", () => {
  const web = new Set(readdirSync("src/assets/phone-tones"));
  expect(PHONE_ALERTS.length).toBe(31);
  for (const a of PHONE_ALERTS) expect(web.has(`${a.tone}.mp3`)).toBe(true);
});
