import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { LifeBuoy, MessagesSquare, Radio, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useBmInbox } from "@/lib/bm-inbox";
import { useTalkChannelTotalCount } from "@/hooks/use-talk-channel-presence";

const OPEN_TICKET = ["open", "in_progress", "waiting"];

/** Live counters on the portal home sidebar; each tile opens its page. Read-only counts. */
export function PortalCounters({ staff }: { staff: boolean }) {
  const { user, hasRole } = useAuth();
  const inbox = useBmInbox();
  const talk = useTalkChannelTotalCount();
  const canOrders = staff && (hasRole("admin") || hasRole("management"));
  const [tickets, setTickets] = useState(0);
  const [orders, setOrders] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const load = async () => {
      let tq = supabase.from("tickets").select("id", { count: "exact", head: true }).in("status", OPEN_TICKET);
      if (!staff) tq = tq.eq("user_id", user.id);
      const { count: t } = await tq;
      let o = 0;
      if (canOrders) {
        const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]).is("paid_at", null);
        o = count ?? 0;
      } else if (!staff) {
        const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["pending", "processing"]).is("paid_at", null);
        o = count ?? 0;
      }
      if (!active) return;
      setTickets(t ?? 0);
      setOrders(o);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(id); };
  }, [user?.id, staff, canOrders]);

  type Tile = { label: string; value: number; Icon: ComponentType<{ className?: string }>; to: string; search?: Record<string, string> };
  const tiles: Tile[] = [
    { label: "Open tickets", value: tickets, Icon: LifeBuoy, to: "/tickets" },
    ...(inbox.enabled ? [{ label: "Unread inbox", value: inbox.data?.unread ?? 0, Icon: MessagesSquare, to: "/inbox" }] : []),
    { label: "In Talk", value: talk, Icon: Radio, to: "/talk" },
    ...(canOrders
      ? [{ label: "Orders waiting", value: orders, Icon: Receipt, to: "/admin", search: { tab: "order-status" } }]
      : !staff
        ? [{ label: "To pay", value: orders, Icon: Receipt, to: "/shop", search: { view: "orders" } }]
        : []),
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map(({ label, value, Icon, to, search }) => (
        <Link key={label} to={to as never} search={search as never} className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-2.5 py-2 text-white transition-colors hover:bg-white/20">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15"><Icon className="size-4" /></span>
          <span className="min-w-0">
            <span className="block font-display text-lg font-extrabold leading-none tabular-nums">{value > 99 ? "99+" : value}</span>
            <span className="block truncate text-[10px] font-medium text-white/80">{label}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
