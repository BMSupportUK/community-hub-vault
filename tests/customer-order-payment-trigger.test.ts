import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const owner = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";
const other = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e8";
const order = "3de3a26b-03d5-4f5f-bd2a-e87eded4f9d8";
beforeAll(async () => {
  await db.exec(`CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.user',true),'')::uuid $$;
    CREATE TABLE private.orders(id uuid,user_id uuid,paid_at timestamptz,status text,order_ref text);
    CREATE TABLE public.order_checkout_links(order_id uuid,token text,password text,claimed_by uuid);
    CREATE TABLE public.user_notifications(user_id uuid,kind text,title text,body text,link_path text,source_type text,source_id uuid);
    INSERT INTO private.orders VALUES('${order}','${owner}',null,'pending','TEST-ORDER');`);
  await db.exec(readFileSync(new URL("../drizzle/migrations/0181_customer_order_payment_notification.sql", import.meta.url), "utf8"));
});
afterAll(() => db.close());
test("new owned checkout sends a payment notice without leaking secure credentials", async () => {
  await db.query("INSERT INTO public.order_checkout_links VALUES($1,'secret-token','secret-password',$2)", [order, owner]);
  const notices = (await db.query<{ user_id: string; kind: string; source_id: string; link_path: string }>("SELECT * FROM public.user_notifications")).rows;
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ user_id: owner, kind: "customer_order_payment", source_id: order, link_path: "/shop?tab=orders" });
  expect(JSON.stringify(notices)).not.toContain("secret-token");
  expect(JSON.stringify(notices)).not.toContain("secret-password");
});
test("only the signed-in order owner can retrieve the secure chat password", async () => {
  await db.query("SELECT set_config('app.user',$1,false)", [owner]);
  expect((await db.query("SELECT * FROM public.get_my_order_chat_access($1)", [order])).rows).toEqual([{ token: "secret-token", password: "secret-password" }]);
  await db.query("SELECT set_config('app.user',$1,false)", [other]);
  await expect(db.query("SELECT * FROM public.get_my_order_chat_access($1)", [order])).rejects.toThrow("Not authorized");
  await db.query("SELECT set_config('app.user','',false)");
  await expect(db.query("SELECT * FROM public.get_my_order_chat_access($1)", [order])).rejects.toThrow("Not signed in");
});
test("unclaimed manual checkouts do not send the staff order owner's customer reminder", async () => {
  await db.exec("DELETE FROM public.user_notifications;");
  await db.query("INSERT INTO public.order_checkout_links VALUES($1,'manual-token','manual-password',null)", [order]);
  expect((await db.query("SELECT * FROM public.user_notifications")).rows).toHaveLength(0);
});