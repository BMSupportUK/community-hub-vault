import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

test("server VPN order creation keeps the credential while customer ownership remains enforced", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('test.role')$$;
      CREATE TABLE public.test_orders(id uuid,user_id uuid,credential_id uuid);
      CREATE FUNCTION public.tg_orders_iud() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        IF NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
        RETURN NEW;
      END$$;
      CREATE TRIGGER test_insert BEFORE INSERT ON public.test_orders FOR EACH ROW EXECUTE FUNCTION public.tg_orders_iud();`);
    await db.exec(readFileSync(new URL("../drizzle/migrations/0385_vpn_order_server_creation.sql", import.meta.url), "utf8"));
    await db.exec("SET test.role='service_role'; INSERT INTO test_orders VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003')");
    expect((await db.query("SELECT credential_id FROM test_orders")).rows[0].credential_id).toBe("00000000-0000-0000-0000-000000000003");
    await db.exec("SET test.role='authenticated'");
    await expect(db.exec("INSERT INTO test_orders(user_id) VALUES ('00000000-0000-0000-0000-000000000002')")).rejects.toThrow("Not authorized");
  } finally { await db.close(); }
});