import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { isPageAllowed } from "../src/lib/page-access";

const sessionPath = `${process.env.HOME}/.cache/lovable-auth/session.json`;
const liveTest = existsSync(sessionPath) && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY ? test : test.skip;

liveTest("saved Link Device permissions allow customers and staff without admin access", async () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("The configured backend is required to verify Link Device access.");
  const session = JSON.parse(readFileSync(sessionPath, "utf8")) as { session: { access_token: string } };
  const response = await fetch(`${url}/rest/v1/page_permissions?select=page_key,allowed_roles&page_key=eq.send-to-app`, {
    headers: { apikey: key, Authorization: `Bearer ${session.session.access_token}` },
  });
  expect(response.ok).toBe(true);
  const rows = await response.json() as { page_key: string; allowed_roles: string[] }[];
  expect(rows).toHaveLength(1);
  const permissions = { "send-to-app": rows[0]?.allowed_roles ?? [] };
  for (const role of ["member", "subscriber", "staff", "moderator", "management"]) {
    expect(isPageAllowed("send-to-app", [role], permissions)).toBe(true);
  }
  expect(isPageAllowed("send-to-app", [], permissions)).toBe(false);
});