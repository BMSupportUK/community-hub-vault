import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const user = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const ticket = "00000000-0000-4000-8000-000000000003", order = "00000000-0000-4000-8000-000000000004", guest = "00000000-0000-4000-8000-000000000005";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE TABLE public.tickets(id uuid, user_id uuid);
    CREATE TABLE private.orders(id uuid, user_id uuid);
    CREATE TABLE public.enabler_login_pins(id uuid DEFAULT gen_random_uuid(), ticket_id uuid, order_id uuid,
      user_id uuid, pin_hash text UNIQUE, pin_encrypted text, created_at timestamptz DEFAULT now(), expires_at timestamptz, revoked_at timestamptz);
    INSERT INTO public.tickets VALUES ('${ticket}','${user}');
    INSERT INTO private.orders VALUES ('${order}','${user}'),('${guest}',NULL);
    INSERT INTO public.enabler_login_pins(ticket_id,pin_hash,pin_encrypted,expires_at)
      VALUES ('${ticket}','legacy-hash','existing-pin',now()+interval '24 hours');`);
  await db.exec(readFileSync(new URL("../drizzle/migrations/0250_shared_enabler_account_pin.sql", import.meta.url), "utf8"));
});
afterAll(() => db.close());
async function issue(scope: string, id: string, value: string) {
  return (await db.query<{ pin: { pin_encrypted: string; expires_at: string } }>(
    "SELECT public.get_or_create_enabler_login_pin($1,$2,$3,$3) AS pin", [scope, id, value])).rows[0]?.pin;
}
test("valid legacy ticket PIN is shared across account, tickets and orders without extending expiry", async () => {
  const settings = await issue("user_id", user, "unused-settings");
  expect(settings?.pin_encrypted).toBe("existing-pin");
  expect(await issue("ticket_id", ticket, "unused-ticket")).toEqual(settings);
  expect(await issue("order_id", order, "unused-order")).toEqual(settings);
  const status = await db.query<{ pin: unknown }>("SELECT public.active_enabler_login_pin('order_id',$1) AS pin", [order]);
  expect(status.rows[0]?.pin).toEqual(settings);
});
test("another customer and an unowned order never share the customer's PIN", async () => {
  expect((await issue("user_id", other, "other-pin"))?.pin_encrypted).toBe("other-pin");
  expect((await issue("order_id", guest, "guest-pin"))?.pin_encrypted).toBe("guest-pin");
});
test("explicit account reset replaces the PIN across all scopes including legacy ticket PINs", async () => {
  await db.query("SELECT public.revoke_account_enabler_pins($1)", [user]);
  const fresh = await issue("user_id", user, "reset-pin");
  expect(fresh?.pin_encrypted).toBe("reset-pin");
  expect(await issue("ticket_id", ticket, "unused-reset-ticket")).toEqual(fresh);
  expect(await issue("order_id", order, "unused-reset-order")).toEqual(fresh);
  const revoked = await db.query<{ revoked: boolean }>("SELECT revoked_at IS NOT NULL AS revoked FROM public.enabler_login_pins WHERE pin_hash='legacy-hash'");
  expect(revoked.rows[0]?.revoked).toBe(true);
});
test("expired PIN is replaced with a new 24-hour PIN shared everywhere", async () => {
  await db.query("UPDATE public.enabler_login_pins SET expires_at=now()-interval '1 second' WHERE user_id=$1", [user]);
  const fresh = await issue("ticket_id", ticket, "after-expiry");
  expect(fresh?.pin_encrypted).toBe("after-expiry");
  expect(await issue("user_id", user, "unused-expiry-account")).toEqual(fresh);
  const duration = await db.query<{ hours: number }>("SELECT extract(epoch from (expires_at-clock_timestamp()))/3600 AS hours FROM public.enabler_login_pins WHERE pin_hash='after-expiry'");
  expect(Number(duration.rows[0]?.hours)).toBeGreaterThan(23.99);
  expect(Number(duration.rows[0]?.hours)).toBeLessThanOrEqual(24);
});