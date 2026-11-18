import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { vpnProRata } from "../src/lib/vpn-addon";

test("VPN reads the saved TV expiry without exposing credentials or changing its date", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA private;
      CREATE TABLE private.app_credentials(id uuid PRIMARY KEY,owner_id uuid,expiry_at timestamptz,password_enc text);
      INSERT INTO private.app_credentials VALUES
      ('8cdafca2-dbd9-4906-a7b1-b7642555fa05','b6ec8f38-2e2a-41ce-98fc-94681047a288','2027-12-07T13:36:00Z','private-value');`);
    await db.exec(readFileSync(new URL("../drizzle/migrations/0384_vpn_subscription_expiry_read.sql", import.meta.url), "utf8"));
    await db.exec("SET ROLE service_role");
    const result = await db.query<{ owner_id: string; expiry_at: Date }>("SELECT * FROM public.vpn_credential_expiry('8cdafca2-dbd9-4906-a7b1-b7642555fa05')");
    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0]).sort()).toEqual(["expiry_at", "owner_id"]);
    expect(result.rows[0].owner_id).toBe("b6ec8f38-2e2a-41ce-98fc-94681047a288");
    const q = vpnProRata(new Date(result.rows[0].expiry_at).toISOString(), Date.parse("2026-11-18T12:08:00Z"));
    expect(q?.until).toBe("2027-12-07T13:36:00.000Z");
    expect(q?.pence).toBe(2530);
    await db.exec("RESET ROLE; SET ROLE authenticated");
    await expect(db.query("SELECT * FROM public.vpn_credential_expiry('8cdafca2-dbd9-4906-a7b1-b7642555fa05')")).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(db.query("SELECT * FROM public.vpn_credential_expiry('8cdafca2-dbd9-4906-a7b1-b7642555fa05')")).rejects.toThrow("permission denied");
  } finally { await db.close(); }
});