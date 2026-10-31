import { describe, expect, test } from "bun:test";
import { beginDirectInstallSession, readDirectInstallSession } from "../src/lib/direct-install-session.server";

function database() {
  const rows: Record<string, any>[] = [];
  const db = { from: () => {
    let inserted: Record<string, any> | null = null;
    const filters: ((row: Record<string, any>) => boolean)[] = [];
    const query = {
      insert: (row: Record<string, any>) => { inserted = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() }; rows.push(inserted); return query; },
      select: (_columns: string) => query,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      gt: (key: string, value: string) => { filters.push((row) => row[key] > value); return query; },
      single: async () => ({ data: inserted, error: null }),
      maybeSingle: async () => ({ data: rows.find((row) => filters.every((filter) => filter(row))) ?? null, error: null }),
    };
    return query;
  } };
  return { db, rows };
}

describe("Direct Install setup sessions", () => {
  test("already-installed starts a fresh run without issuing a download link", async () => {
    const { db, rows } = database();
    const old = await beginDirectInstallSession(db, "customer", true);
    rows[0].completed_at = new Date().toISOString();
    const fresh = await beginDirectInstallSession(db, "customer", false);
    expect(fresh.sessionId).not.toBe(old.sessionId);
    expect(fresh.url).toBeUndefined();
    expect(rows[1].code_hash).toStartWith("session:");
    const progress = await readDirectInstallSession(db, "customer", fresh.sessionId);
    expect(progress?.completed_at).toBeUndefined();
    rows[1].signed_in_at = new Date().toISOString();
    rows[1].permission_at = new Date().toISOString();
    expect((await readDirectInstallSession(db, "customer", fresh.sessionId))?.permission_at).toBe(rows[1].permission_at);
  });

  test("no selected run never restores old completed progress", async () => {
    const { db, rows } = database();
    await beginDirectInstallSession(db, "customer", false);
    rows[0].completed_at = new Date().toISOString();
    expect(await readDirectInstallSession(db, "customer", null)).toBeNull();
  });

  test("session reads require ownership and never substitute newer or expired history", async () => {
    const { db, rows } = database();
    const first = await beginDirectInstallSession(db, "customer", false);
    const second = await beginDirectInstallSession(db, "customer", false);
    expect((await readDirectInstallSession(db, "customer", first.sessionId))?.id).toBe(first.sessionId);
    expect(await readDirectInstallSession(db, "another-customer", second.sessionId)).toBeNull();
    rows[0].created_at = "2020-01-01T00:00:00.000Z";
    expect(await readDirectInstallSession(db, "customer", first.sessionId)).toBeNull();
  });
});