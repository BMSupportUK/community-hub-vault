import { beforeAll, afterAll, test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { ticketScreenShareInvite, isTicketScreenShareInvite } from "../src/lib/ticket-screen-share";
const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const staff = "00000000-0000-0000-0000-000000000002";
const ticket = "00000000-0000-0000-0000-000000000010";
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TYPE public.app_role AS ENUM('admin','management','staff','member');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('test.uid')::uuid$$;
    CREATE FUNCTION public.has_any_role(uuid,public.app_role[]) RETURNS boolean LANGUAGE sql AS $$SELECT $1='${staff}'::uuid AND 'staff'::public.app_role=ANY($2)$$;
    CREATE FUNCTION public.staff_ticket_scope_allowed(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $2 IS NULL$$;
    CREATE TABLE tickets(id uuid,user_id uuid,status text,subject text,category_id uuid,order_id uuid);
    CREATE TABLE ticket_messages(id uuid default gen_random_uuid(),ticket_id uuid,sender_id uuid,is_internal boolean,content text);
    CREATE TABLE tv_remote_sessions(id uuid default gen_random_uuid(),status text,expires_at timestamptz,code_hash text,link_kind text,link_id uuid,requested_at timestamptz);
    CREATE TABLE tv_remote_events(id uuid default gen_random_uuid(),session_id uuid,actor_id uuid,kind text,created_at timestamptz default now());
    CREATE TABLE staff_notifications(kind text,title text,body text,link_path text,entity_id uuid);
    INSERT INTO tickets VALUES('${ticket}','${owner}','open','TV help',NULL,NULL);
    SET test.uid='${owner}';`);
  await db.exec(readFileSync(new URL("../drizzle/migrations/0199_ticket_screen_share_pairing.sql", import.meta.url), "utf8"));
});
afterAll(async () => { await db.close(); });
test("customer waits for a public staff invitation", async () => {
  await expect(db.query(`SELECT request_ticket_screen_share('${ticket}','123456')`)).rejects.toThrow("Wait for staff");
  await db.query("INSERT INTO ticket_messages(ticket_id,sender_id,is_internal,content) VALUES($1,$2,false,$3)", [ticket,staff,ticketScreenShareInvite()]);
  expect(isTicketScreenShareInvite(ticketScreenShareInvite())).toBe(true);
});
test("only the ticket customer can bind their TV code", async () => {
  await db.exec(`SET test.uid='${staff}'`);
  await expect(db.query(`SELECT request_ticket_screen_share('${ticket}','123456')`)).rejects.toThrow("Only the ticket customer");
  await db.exec(`SET test.uid='${owner}'`);
});
test("wrong codes persist attempts and eight attempts block retry", async () => {
  for (let i=0;i<8;i++) await db.query(`SELECT request_ticket_screen_share('${ticket}','999999')`);
  expect((await db.query<{n:number}>("SELECT count(*)::int n FROM tv_remote_events")).rows[0]?.n).toBe(8);
  await expect(db.query(`SELECT request_ticket_screen_share('${ticket}','999999')`)).rejects.toThrow("Too many wrong codes");
  await db.exec("DELETE FROM tv_remote_events WHERE kind LIKE 'ticket_code_failed:%'");
});
test("code belongs only to this ticket and notification opens its share tab", async () => {
  await db.exec("INSERT INTO tv_remote_sessions(status,expires_at,code_hash) VALUES('pending',now()+interval '10 minutes',encode(sha256(convert_to('123456','UTF8')),'hex'))");
  const r=await db.query<{id:string}>(`SELECT request_ticket_screen_share('${ticket}','123456') id`);
  expect(r.rows[0]?.id).toBeTruthy();
  const session=(await db.query<{link_kind:string;link_id:string}>("SELECT link_kind,link_id FROM tv_remote_sessions")).rows[0];
  expect(session).toEqual({link_kind:"ticket",link_id:ticket});
  expect((await db.query<{link_path:string}>("SELECT link_path FROM staff_notifications")).rows[0]?.link_path).toBe(`/tickets?id=${ticket}&tab=screen`);
  await expect(db.query(`SELECT request_ticket_screen_share('${ticket}','123456')`)).rejects.toThrow("already in progress");
});
test("closed ticket refuses another screen share", async () => {
  await db.exec(`UPDATE tickets SET status='closed' WHERE id='${ticket}'`);
  await expect(db.query(`SELECT request_ticket_screen_share('${ticket}','123456')`)).rejects.toThrow("closed");
});