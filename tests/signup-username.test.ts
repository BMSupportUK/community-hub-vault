import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), username text CONSTRAINT profiles_username_key UNIQUE, display_name text);
    CREATE TABLE public.user_roles (user_id uuid, role text);
    CREATE TABLE public.fan_zone_members (user_id uuid UNIQUE, status text, fan_alias text);
    CREATE TABLE public.gate_applications (id uuid DEFAULT gen_random_uuid(), user_id uuid);
    CREATE TABLE public.gate_messages (application_id uuid, sender_id uuid, content text);
    CREATE FUNCTION public.is_blacklisted(email text, ip text) RETURNS boolean LANGUAGE sql AS $$ SELECT email = 'blocked@example.test' $$;
  `);
  await db.exec(await Bun.file(new URL("../drizzle/migrations/0259_deduplicate_signup_usernames.sql", import.meta.url)).text());
  await db.exec("CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()");
});

afterEach(async () => { await db.close(); });

async function signup(id: number, displayName: string, intent = "bm-support", email = `test${id}@example.test`) {
  await db.query("INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)", [
    `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    email,
    JSON.stringify({ username: displayName.toLowerCase().replace(/\s+/g, ""), display_name: displayName, access_intent: intent }),
  ]);
}

describe("sign-up username collision recovery", () => {
  it("allows John Smith and johnsmith to join without changing their display names", async () => {
    await signup(1, "John Smith");
    await signup(2, "johnsmith");
    expect((await db.query("SELECT username, display_name FROM profiles ORDER BY id")).rows).toEqual([
      { username: "johnsmith", display_name: "John Smith" },
      { username: "johnsmith2", display_name: "johnsmith" },
    ]);
    expect((await db.query("SELECT count(*)::int AS total FROM gate_applications")).rows).toEqual([{ total: 2 }]);
    expect((await db.query("SELECT count(*)::int AS total FROM gate_messages")).rows).toEqual([{ total: 2 }]);
  });

  it("retries when a suffixed username is already taken", async () => {
    await signup(1, "John Smith");
    await signup(2, "johnsmith2");
    await signup(3, "johnsmith");
    expect((await db.query("SELECT username FROM profiles ORDER BY id")).rows).toEqual([
      { username: "johnsmith" }, { username: "johnsmith2" }, { username: "johnsmith3" },
    ]);
  });

  it("keeps duplicate-name Fan Zone sign-ups in the Fan Zone queue only", async () => {
    await signup(1, "John Smith", "fan-zone");
    await signup(2, "johnsmith", "fan-zone");
    expect((await db.query("SELECT status, fan_alias FROM fan_zone_members ORDER BY user_id")).rows).toEqual([
      { status: "pending", fan_alias: "John Smith" }, { status: "pending", fan_alias: "johnsmith" },
    ]);
    expect((await db.query("SELECT count(*)::int AS total FROM gate_applications")).rows).toEqual([{ total: 0 }]);
  });

  it("keeps blacklisted accounts banned without queuing an access request", async () => {
    await signup(1, "John Smith");
    await signup(2, "johnsmith", "fan-zone", "blocked@example.test");
    expect((await db.query("SELECT role FROM user_roles ORDER BY user_id")).rows).toEqual([{ role: "pending" }, { role: "banned" }]);
    expect((await db.query("SELECT count(*)::int AS total FROM fan_zone_members")).rows).toEqual([{ total: 0 }]);
  });
});