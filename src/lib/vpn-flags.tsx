import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();
let realtimeSubscribed = false;

function ensureRealtime() {
  if (realtimeSubscribed) return;
  realtimeSubscribed = true;
  supabase
    .channel("signup_info-vpn-flags")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "signup_info" },
      () => {
        cache = null;
        void load();
      },
    )
    .subscribe();
}

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.rpc("get_vpn_user_ids" as never);
    const set = new Set<string>();
    if (error) {
      console.warn("[vpn] failed to load VPN user flags", error);
      inflight = null;
      return set;
    }
    if (Array.isArray(data)) {
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

export function refreshVpnUserSet() {
  cache = null;
  void load();
}

export function useVpnUserSet(): Set<string> {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!cache) load();
    ensureRealtime();
    const onFocus = () => {
      cache = null;
      load();
    };
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
  showInactive = false,
}: {
  userId: string | null | undefined;
  className?: string;
  size?: number;
  showInactive?: boolean;
}) {
  const set = useVpnUserSet();
  const isVpn = Boolean(userId && set.has(userId));
  if (!userId || (!isVpn && !showInactive)) return null;
  const label = isVpn ? "VPN Protected" : "No VPN";
  const Icon = isVpn ? ShieldAlert : ShieldCheck;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            className={cn("inline-flex items-center", isVpn ? "text-amber-400" : "text-emerald-400", className)}
          >
            <Icon size={size} strokeWidth={2.25} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
