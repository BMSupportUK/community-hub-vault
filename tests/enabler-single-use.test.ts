import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { connectionReady } from "../src/lib/ticket-remote-setup";

const owner = "00000000-0000-0000-0000-000000000001";
const scope = "00000000-0000-0000-0000-000000000002";
const first = "00000000-0000-0000-0000-000000000003";
const next = "00000000-0000-0000-0000-000000000004";
const checks = JSON.stringify({ adb: true, helper: true, control: true, accessibility: true });

for (const kind of ["ticket", "order"] as const) {
  test(`${kind}: every share consumes a new Enabler session without extending the 24-hour reference`, async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth; create function auth.uid() returns uuid language sql as $$ select '${owner}'::uuid $$;
        create table tickets(id uuid primary key,user_id uuid,status text,subject text);
        create table orders(id uuid primary key,order_ref text,existing_username text);
        create table enabler_confirm_codes(code_hash text primary key,expires_at timestamptz,created_at timestamptz default now(),bound_ticket_id uuid,bound_order_id uuid,session_id uuid,device text,checks jsonb,used_at timestamptz);
        create table tv_remote_sessions(id uuid primary key,code_hash text,status text,expires_at timestamptz,link_id uuid,link_kind text,requested_at timestamptz);
        create table ticket_remote_setup(ticket_id uuid,device text,pending_session_id uuid,verified_session_id uuid,updated_at timestamptz,app_checks jsonb,app_checked_at timestamptz,checks_used_at timestamptz,completed_at timestamptz);
        create table order_remote_setup(order_id uuid,device text,pending_session_id uuid,verified_session_id uuid,updated_at timestamptz,app_checks jsonb,app_checked_at timestamptz,checks_used_at timestamptz,completed_at timestamptz);
        create table tv_remote_events(session_id uuid,actor_id uuid,kind text);
        create table staff_notifications(kind text,title text,body text,link_path text,entity_id uuid);
      `);
      await db.exec(await Bun.file("drizzle/migrations/0226_enabler_connection_renewal.sql").text());
      await db.exec(await Bun.file("drizzle/migrations/0227_single_use_enabler_connections.sql").text());
      await db.query(`insert into tickets values($1,$2,'open','Test'); insert into orders values('${scope}','TEST','Test')`, [scope, owner]);
      await db.query(`insert into ${kind}_remote_setup(${kind}_id,device) values($1,'amazon')`, [scope]);
      await db.query(`insert into tv_remote_sessions values($1,'first','pending',now()+interval '1 hour',null,null,null),($2,'next','pending',now()+interval '1 hour',null,null,null)`, [first, next]);
      await db.query(`insert into enabler_confirm_codes(code_hash,expires_at,session_id,device,checks,refresh_token_hash) values('reference',now()+interval '24 hours',$1,'amazon',$2,'secret')`, [first, checks]);
      const result = async (sql: string, args: unknown[] = []) => (await db.query<{ result: unknown }>(sql, args)).rows[0]?.result;
      const expiry = await result(`select expires_at as result from enabler_confirm_codes`);
      expect(await result(`select apply_enabler_confirmation($1,$2,'reference') as result`, [kind, scope])).toBe("ok");
      const connect = kind === "ticket" ? `select connect_ticket_remote_setup($1) as result` : `select consume_enabler_connection('order',$1) as result`;
      expect(await result(connect, [scope])).toBe(true);
      expect(await result(connect, [scope])).toBe(false);
      await db.query(`update tv_remote_sessions set status='ended' where id=$1`, [first]);
      expect(await result(`select apply_enabler_confirmation($1,$2,'reference') as result`, [kind, scope])).toBe("ok");
      expect(await result(connect, [scope])).toBe(false);
      expect(await result(`select pending_session_id as result from ${kind}_remote_setup`)).toBeNull();
      expect(await result(`select request_enabler_connection($1,$2) as result`, [kind, scope])).toBe("queued");
      const task = await result(`select enabler_refresh_task('secret') as result`) as { state: string; requestId: string };
      expect(task.state).toBe("refresh");
      expect((await result(`select enabler_refresh_task('secret',$1,'next',$2) as result`, [task.requestId, checks]) as { state: string }).state).toBe("done");
      expect(await result(`select pending_session_id as result from ${kind}_remote_setup`)).toBe(next);
      expect(await result(connect, [scope])).toBe(true);
      expect(await result(connect, [scope])).toBe(false);
      expect(await result(`select count(*)::int as result from staff_notifications`)).toBe(2);
      expect(await result(`select expires_at as result from enabler_confirm_codes`)).toEqual(expiry);
      // Even corrupted/stale pointers cannot reconnect an already requested session.
      await db.query(`update tv_remote_sessions set status='pending',link_id=null where id=$1`, [next]);
      await db.query(`update ${kind}_remote_setup set pending_session_id=$1,verified_session_id=null,checks_used_at=null,app_checked_at=now()`, [next]);
      expect(await result(connect, [scope])).toBe(false);
      await expect(db.query(`select connect_ticket_remote_setup('00000000-0000-0000-0000-000000000099')`)).rejects.toThrow("Only the ticket customer");
    } finally { await db.close(); }
  });
}

test("Connect requires a new automatically delivered connection, never a consumed session", () => {
  const row = { app_checks: { adb: true, helper: true, accessibility: true }, app_checked_at: new Date().toISOString(), pending_session_id: first };
  expect(connectionReady(row)).toBe(true);
  expect(connectionReady({ ...row, verified_session_id: first })).toBe(false);
  expect(connectionReady({ ...row, pending_session_id: null })).toBe(false);
  expect(connectionReady({ ...row, checks_used_at: row.app_checked_at })).toBe(false);
});