import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

describe("Direct Install completion retires only the original download link", () => {
  test("completion deletes the usable code hash while keeping progress and other links", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE TABLE public.direct_install_links (
          id uuid PRIMARY KEY, code_hash text UNIQUE NOT NULL,
          expires_at timestamptz NOT NULL, completed_at timestamptz,
          downloaded_at timestamptz
        );
      `);
      await db.exec(readFileSync(new URL("../drizzle/migrations/0254_retire_completed_direct_install_links.sql", import.meta.url), "utf8"));
      await db.exec(`
        INSERT INTO public.direct_install_links VALUES
          ('00000000-0000-0000-0000-000000000001', 'original-hash', '2026-10-30T23:40:00Z', NULL, '2026-10-30T23:00:00Z'),
          ('00000000-0000-0000-0000-000000000002', 'other-hash', '2026-10-30T23:40:00Z', NULL, NULL);
        UPDATE public.direct_install_links SET completed_at = '2026-10-30T23:12:00Z'
          WHERE code_hash = 'original-hash';
      `);
      const original = await db.query("SELECT id FROM public.direct_install_links WHERE code_hash = 'original-hash'");
      expect(original.rows).toHaveLength(0);
      const saved = await db.query<{ code_hash: string; completed: boolean; downloaded: boolean; expired: boolean }>(`
        SELECT code_hash, completed_at IS NOT NULL AS completed,
          downloaded_at IS NOT NULL AS downloaded, expires_at = completed_at AS expired
        FROM public.direct_install_links WHERE id = '00000000-0000-0000-0000-000000000001'
      `);
      expect(saved.rows[0]).toEqual({ code_hash: "completed:00000000-0000-0000-0000-000000000001", completed: true, downloaded: true, expired: true });
      const other = await db.query("SELECT id FROM public.direct_install_links WHERE code_hash = 'other-hash'");
      expect(other.rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});