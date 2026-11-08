// @ts-nocheck — optional rollback-only integration tests use bun test.
import { test, expect } from "bun:test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const databaseTest = process.env.SUPABASE_DB_URL ? test : test.skip;
databaseTest("database blocks duplicate channel tickets and clears faults on resolved or closed", async () => {
  const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, onnotice: () => {} });
  const session = JSON.parse(readFileSync(`${homedir()}/.cache/lovable-auth/session.json`, "utf8"));
  const owner = session.session.user.id;
  let verified = false;
  try {
    await sql.begin(async tx => {
      const name = `Channel fault test ${crypto.randomUUID()}`;
      const call = async () => {
        const [ticket] = await tx`insert into public.tickets(user_id,category_id,subject,player_channel_name) values (${owner}, (select id from public.ticket_categories where slug = 'live-tv'), ${'BM Player: Channel – ' + name}, ${name}) returning id`;
        return [{ result: { ok: true, ticket_id: ticket.id } }];
      };
      const [first] = await call();
      expect(first.result.ok).toBe(true);
      let blocked = false;
      try { await tx.savepoint(async () => { await call(); }); }
      catch (error) { blocked = error.code === 'P0001'; }
      expect(blocked).toBe(true);
      const [active] = await tx`select count(*)::int as count from public.tickets where player_channel_name = ${name} and status not in ('resolved','closed')`;
      expect(active.count).toBe(1);
      await tx`update public.tickets set status = 'resolved' where id = ${first.result.ticket_id}::uuid`;
      const [cleared] = await tx`select count(*)::int as count from public.tickets where player_channel_name = ${name} and status not in ('resolved','closed')`;
      expect(cleared.count).toBe(0);
      const [second] = await call();
      expect(second.result.ok).toBe(true);
      expect(second.result.ticket_id).not.toBe(first.result.ticket_id);
      await tx`update public.tickets set status = 'closed' where id = ${second.result.ticket_id}::uuid`;
      const [complete] = await tx`select count(*)::int as count from public.tickets where player_channel_name = ${name} and status not in ('resolved','closed')`;
      expect(complete.count).toBe(0);
      verified = true;
      throw new Error('ROLLBACK_FAULT_TEST');
    });
  } catch (error) {
    if (!verified || error.message !== 'ROLLBACK_FAULT_TEST') throw error;
  } finally { await sql.end(); }
});