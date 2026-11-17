// @ts-nocheck — live database regression tests use bun:test.
import { expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.CREDENTIAL_TEST_URL;
const key = process.env.CREDENTIAL_TEST_KEY;
const session = process.env.CREDENTIAL_TEST_SESSION;
const liveTest = url && key && session ? test : test.skip;

async function adminClient() {
  const client = createClient(url, key, { auth: { persistSession: false } });
  await client.auth.setSession(JSON.parse(session).session);
  return client;
}

liveTest("VPN allocation finds a saved app login on the administrator's own account", async () => {
  const client = await adminClient();
  const { data, error } = await client.rpc("admin_vpn_subscriber_lookup", { p_query: "Boromedia" });
  expect(error).toBeNull();
  expect(data.some(row => row.app_login_name === "Boromedia" && row.owner_id === JSON.parse(session).session.user.id)).toBe(true);
  expect(data.every(row => !("password" in row) && !("email" in row))).toBe(true);
});

liveTest("VPN allocation finds subscribers by their website username", async () => {
  const client = await adminClient();
  const owner = JSON.parse(session).session.user.id;
  const { data: profile, error: profileError } = await client.from("profiles").select("username").eq("id", owner).single();
  expect(profileError).toBeNull();
  expect(profile.username.length).toBeGreaterThanOrEqual(2);
  const { data, error } = await client.rpc("admin_vpn_subscriber_lookup", { p_query: profile.username });
  expect(error).toBeNull();
  expect(data.some(row => row.owner_id === owner && row.app_login_name === "Boromedia")).toBe(true);
});

liveTest("the selected VPN subscriber can be read back for allocation", async () => {
  const client = await adminClient();
  const { data: hits } = await client.rpc("admin_vpn_subscriber_lookup", { p_query: "Boromedia" });
  expect(hits.length).toBeGreaterThan(0);
  const { data, error } = await client.rpc("admin_vpn_subscriber_lookup", { p_credential_id: hits[0].id });
  expect(error).toBeNull();
  expect(data).toEqual([hits[0]]);
});

liveTest("anonymous users cannot search VPN subscribers", async () => {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("admin_vpn_subscriber_lookup", { p_query: "Boromedia" });
  expect(error).not.toBeNull();
  expect(data).toBeNull();
});