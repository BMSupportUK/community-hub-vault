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
