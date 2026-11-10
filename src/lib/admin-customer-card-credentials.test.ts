// @ts-nocheck — live integration checks run with bun:test when a test session is supplied.
import { expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.CREDENTIAL_TEST_URL;
const key = process.env.CREDENTIAL_TEST_KEY;
const session = process.env.CREDENTIAL_TEST_SESSION;
const liveTest = url && key && session ? test : test.skip;

liveTest("admin customer card includes the newly saved second login on their own account", async () => {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { session: credentials } = JSON.parse(session);
  await client.auth.setSession(credentials);
  const { data, error } = await client.rpc("admin_customer_card_credentials", { p_owner: credentials.user.id });
  expect(error).toBeNull();
  expect(data.some(row => row.id === "84ca4d41-073d-4f45-8db8-60d2b4a51863" && row.app_login_name === "test" && row.account_number === 2)).toBe(true);
  expect(data.every(row => row.owner_id === credentials.user.id)).toBe(true);
});

liveTest("anonymous visitors cannot read customer card credentials", async () => {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("admin_customer_card_credentials", { p_owner: "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7" });
  expect(error).not.toBeNull();
  expect(data).toBeNull();
});
liveTest("Link Device returns both owner logins for separate account tabs", async () => {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { session: credentials } = JSON.parse(session);
  await client.auth.setSession(credentials);
  const { data, error } = await client.rpc("player_owner_saved_logins");
  expect(error).toBeNull();
  expect(data.map(row => row.app_login_name)).toEqual(["Boromedia", "test"]);
  expect(data.map(row => row.account_number)).toEqual([1, 2]);
});
liveTest("anonymous visitors cannot read owner player logins", async () => {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("player_owner_saved_logins");
  expect(error).not.toBeNull();
  expect(data).toBeNull();
});