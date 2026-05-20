import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.rpc("get_vpn_user_ids" as never);
    const set = new Set<string>();
    if (!error && Array.isArray(data)) {
      for (const row of data as Array<{ get_vpn_user_ids?: string } | string>) {
        const id = typeof row === "string" ? row : row?.get_vpn_user_ids;
        if (id) set.add(id);
      }
    }
    cache = set;
    inflight = null;
    for (const l of listeners) l();
    return set;
  })();
  return inflight;
}

export function useVpnUserSet(): Set<string> {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!cache) load();
    const onFocus = () => { cache = null; load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      listeners.delete(l);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return cache ?? new Set();
}

export function VpnBadge({
  userId,
  className,
  size = 14,
}: {
  userId: string | null | undefined;
  className?: string;
  size?: number;
}) {
  const set = useVpnUserSet();
  if (!userId || !set.has(userId)) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label="Signed up via VPN or proxy"
            className={cn("inline-flex items-center text-amber-400", className)}
          >
            <ShieldAlert size={size} strokeWidth={2.25} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Signed up via VPN / proxy
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}