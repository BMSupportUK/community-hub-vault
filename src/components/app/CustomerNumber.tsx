import { useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Permanent 6-digit BM account number (own, or any for staff roles). */
export function useCustomerNumber(userId: string | null | undefined) {
  const [number, setNumber] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) { setNumber(null); return; }
    let active = true;
    supabase.rpc("get_customer_number", { p_user_id: userId }).then(({ data }) => {
      if (active) setNumber((data as number | null) ?? null);
    });
    return () => { active = false; };
  }, [userId]);
  return number;
}

/** Admin/management: a manual (no website account) customer's number, issued on first view if missing. */
export function useManualCustomerNumber(id: string | null | undefined) {
  const [number, setNumber] = useState<number | null>(null);
  useEffect(() => {
    if (!id) { setNumber(null); return; }
    let active = true;
    supabase.rpc("admin_ensure_customer_number", { _id: id }).then(({ data }) => {
      if (active) setNumber((data as number | null) ?? null);
    });
    return () => { active = false; };
  }, [id]);
  return number;
}

export function CustomerNumberBadge({ userId, className, manual }: { userId: string; className?: string; manual?: boolean }) {
  const own = useCustomerNumber(manual ? null : userId);
  const issued = useManualCustomerNumber(manual ? userId : null);
  const number = manual ? issued : own;
  if (!number) return null;
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-sm font-semibold tracking-wider text-primary", className)}
      title="BM Player account number"
    >
      <Hash className="size-4" aria-hidden="true" />Account no. {number}
    </span>
  );
}

/** Each app login's BM Player number (first login = main number; extra logins have their own). */
export function useLoginPlayerNumbers(ownerId: string | null | undefined) {
  const [rows, setRows] = useState<{ credential_id: string; login: string | null; number: number | null }[]>([]);
  useEffect(() => {
    if (!ownerId) { setRows([]); return; }
    let active = true;
    supabase.rpc("login_player_numbers", { _owner: ownerId }).then(({ data }) => {
      if (active) setRows((data ?? []) as never);
    });
    return () => { active = false; };
  }, [ownerId]);
  return rows;
}

/** Every app login on an account with its BM Player number (used on staff cards). */
export function LoginNumberList({ ownerId }: { ownerId: string }) {
  const rows = useLoginPlayerNumbers(ownerId);
  if (!rows.length) return null;
  return <ul className="space-y-1.5" aria-label="App logins">{rows.map((r, i) => (
    <li key={r.credential_id} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Account {i + 1}</span>
      <span className="min-w-0 break-all">{r.login || "Login"}</span>
      {r.number && <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary"><Hash className="size-3" aria-hidden="true" />{r.number}</span>}
    </li>
  ))}</ul>;
}

export function LoginNumberBadge({ ownerId, accountId, login }: { ownerId: string; accountId?: string; login?: string | null }) {
  const rows = useLoginPlayerNumbers(ownerId);
  const key = login?.trim().toLowerCase();
  const row = rows.find((r) => r.credential_id === accountId) ?? rows.find((r) => key && r.login?.trim().toLowerCase() === key);
  if (!row?.number) return null;
  return <span className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary" title="BM Player account number for this login"><Hash className="size-3" aria-hidden="true" />{row.number}</span>;
}
