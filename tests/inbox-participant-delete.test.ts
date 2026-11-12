import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

test("participant deletion removes selected received messages, preserves others and removes a fully deleted conversation", async () => {
  const db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE FUNCTION public.bm_inbox_allowed(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE bm_inbox_threads(id uuid PRIMARY KEY,user_low uuid,user_high uuid);
    CREATE TABLE bm_inbox_messages(id uuid PRIMARY KEY,thread_id uuid REFERENCES bm_inbox_threads(id),sender_id uuid);
    CREATE TABLE bm_inbox_reports(message_id uuid REFERENCES bm_inbox_messages(id));
    INSERT INTO bm_inbox_threads VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
    INSERT INTO bm_inbox_messages VALUES
    ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
    ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');`);
  await db.exec(readFileSync("drizzle/migrations/0346_inbox_participant_delete.sql", "utf8"));
  const call = async (ids: string | null) => (await db.query<{ result: { deleted: number; thread_removed: boolean } }>("SELECT bm_inbox_delete_messages('10000000-0000-0000-0000-000000000001', $1::uuid[]) result", [ids])).rows[0].result;
  expect(await call('{20000000-0000-0000-0000-000000000001}')).toEqual({ deleted: 1, thread_removed: false });
  expect((await db.query("SELECT id FROM bm_inbox_messages")).rows).toEqual([{ id: "20000000-0000-0000-0000-000000000002" }]);
  await db.exec("INSERT INTO bm_inbox_reports VALUES ('20000000-0000-0000-0000-000000000002')");
  expect(await call(null)).toEqual({ deleted: 0, thread_removed: false });
  await db.exec("DELETE FROM bm_inbox_reports");
  expect(await call(null)).toEqual({ deleted: 1, thread_removed: true });
  expect((await db.query("SELECT id FROM bm_inbox_threads")).rows).toEqual([]);
  await expect(db.query("SELECT bm_inbox_delete_messages('10000000-0000-0000-0000-000000000099',NULL)")).rejects.toThrow("Conversation not found");
  await db.close();
});