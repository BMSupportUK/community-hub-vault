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

export function CustomerNumberBadge({ userId, className }: { userId: string; className?: string }) {
  const number = useCustomerNumber(userId);
  if (!number) return null;
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary", className)}
      title="BM Player account number"
    >
      <Hash className="size-3" aria-hidden="true" />Account no. {number}
    </span>
  );
}
