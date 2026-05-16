import { useEffect, useState } from "react";
import { AtSign, Bell, Check, ShieldCheck, ShoppingBag, UserPlus, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link_path: string | null;
  entity_id: string | null;
  created_at: string;
  // for user_notifications, we mark unread via read_at; staff_notifications use a separate table
  read_at?: string | null;
  source: "staff" | "user";
};

export function NotificationBell() {
  const { user, isStaff, isMod, isPending, hasAny } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const canManageOrders = hasAny(["admin", "management"]);

  useEffect(() => {
    if (!user || isPending) return;
    let active = true;

    const load = async () => {
      const userRes = await supabase
          .from("user_notifications")
          .select("id, kind, title, body, link_path, source_id, created_at, read_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
        .limit(50);
      const staffRes = isStaff
        ? await supabase.from("staff_notifications").select("*").order("created_at", { ascending: false }).limit(50)
        : null;
      const readsRes = isStaff
        ? await supabase.from("staff_notification_reads").select("notification_id").eq("user_id", user.id)
        : null;
      if (!active) return;
      const userRows =
        ((userRes.data as Array<{
          id: string; kind: string; title: string; body: string | null;
          link_path: string | null; source_id: string | null; created_at: string; read_at: string | null;
        }>) ?? []).map((x) => ({
          id: x.id, kind: x.kind, title: x.title, body: x.body,
          link_path: x.link_path, entity_id: x.source_id, created_at: x.created_at,
          read_at: x.read_at, source: "user" as const,
        }));
      const reads = readsRes
        ? new Set(((readsRes.data as Array<{ notification_id: string }>) ?? []).map((x) => x.notification_id))
        : new Set<string>();
      const staffRows = staffRes
        ? (((staffRes.data as Notif[]) ?? [])
            .filter((s) => !reads.has(s.id))
            .map((s) => ({ ...s, source: "staff" as const })))
        : [];
      // user notification "read" state lives on the row itself
      userRows.forEach((u) => { if (u.read_at) reads.add(u.id); });
      const merged = [...userRows, ...staffRows].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setItems(merged);
      setReadIds(reads);
    };
    load();

    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const r = payload.new as {
            id: string; kind: string; title: string; body: string | null;
            link_path: string | null; source_id: string | null; created_at: string; read_at: string | null;
          };
          const n: Notif = {
            id: r.id, kind: r.kind, title: r.title, body: r.body,
            link_path: r.link_path, entity_id: r.source_id, created_at: r.created_at,
            read_at: r.read_at, source: "user",
          };
          setItems((prev) => [n, ...prev].slice(0, 80));
          if (n.kind === "mention") {
            toast(`📣 ${n.title}`, {
              description: n.body ?? undefined,
              duration: 6000,
              action: n.link_path
                ? { label: "Open", onClick: () => navigate({ to: n.link_path! } as never) }
                : undefined,
            });
          } else {
            toast(n.title, { description: n.body ?? undefined });
          }
        },
      )
      .subscribe();

    let staffCh: ReturnType<typeof supabase.channel> | null = null;
    if (isStaff) {
      staffCh = supabase
        .channel("staff-notifications")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_notifications" }, (payload) => {
          const n = { ...(payload.new as Notif), source: "staff" as const };
          setItems((prev) => [n, ...prev].slice(0, 80));
          toast(n.title, { description: n.body ?? undefined });
        })
        .subscribe();
    }

    return () => {
      active = false;
      supabase.removeChannel(ch);
      if (staffCh) supabase.removeChannel(staffCh);
    };
  }, [user, isStaff, isPending]);

  if (!user || isPending) return null;

  const unread = items.filter((i) => !readIds.has(i.id));

  const markRead = async (id: string) => {
    if (readIds.has(id)) return;
    const it = items.find((x) => x.id === id);
    setReadIds((prev) => new Set(prev).add(id));
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (it?.source === "user") {
      await supabase.from("user_notifications").delete().eq("id", id);
    } else {
      await supabase.from("staff_notification_reads").insert({ notification_id: id, user_id: user.id });
    }
  };

  const markAll = async () => {
    const toMark = unread.map((u) => u.id);
    if (!toMark.length) return;
    const userIds = unread.filter((u) => u.source === "user").map((u) => u.id);
    const staffIds = unread.filter((u) => u.source === "staff").map((u) => u.id);
    setReadIds((prev) => {
      const next = new Set(prev);
      toMark.forEach((id) => next.add(id));
      return next;
    });
    setItems((prev) => prev.filter((x) => !toMark.includes(x.id)));
    if (userIds.length) {
      await supabase
        .from("user_notifications")
        .delete()
        .in("id", userIds);
    }
    if (staffIds.length) {
      await supabase.from("staff_notification_reads").insert(
        staffIds.map((id) => ({ notification_id: id, user_id: user.id })),
      );
    }
  };

  const approveApplication = async (appId: string, approve: boolean) => {
    if (!isMod) return;
    const { data: app } = await supabase.from("gate_applications").select("user_id").eq("id", appId).maybeSingle();
    if (!app) return toast.error("Application not found");
    const { error: e1 } = await supabase
      .from("gate_applications")
      .update({ status: approve ? "approved" : "denied", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", appId);
    if (e1) return toast.error(e1.message);
    if (approve) {
      // upgrade role from pending -> member
      await supabase.from("user_roles").delete().eq("user_id", app.user_id).eq("role", "pending");
      await supabase.from("user_roles").insert({ user_id: app.user_id, role: "member" });
    }
    toast.success(approve ? "Approved" : "Denied");
  };

  const updateOrderStatus = async (orderId: string, status: "processing" | "shipped" | "completed" | "cancelled") => {
    if (!canManageOrders) return;
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) return toast.error(error.message);
    toast.success(`Order ${status}`);
  };

  const iconFor = (kind: string) =>
    kind === "gate_application" ? UserPlus
      : kind === "order_placed" ? ShoppingBag
      : kind === "mention" ? AtSign
      : Bell;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative size-12 rounded-2xl flex items-center justify-center bg-surface-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:rounded-xl transition-all"
          title="Notifications"
        >
          <Bell className="size-5" />
          {unread.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center ring-2 ring-rail">
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-96 p-0" sideOffset={12}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-display font-semibold">Notifications</div>
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll} className="h-7 text-xs">
              <Check className="size-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[480px]">
          {items.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">You're all caught up.</div>
          )}
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const Icon = iconFor(n.kind);
              const isUnread = !readIds.has(n.id);
              return (
                <li key={n.id} className={cn("px-4 py-3 transition-colors", isUnread && "bg-primary/5")}>
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        "size-9 rounded-lg grid place-items-center shrink-0",
                        n.kind === "order_placed" ? "bg-emerald-500/10 text-emerald-500"
                          : n.kind === "mention" ? "bg-indigo-500/15 text-indigo-400"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{n.title}</div>
                          {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                          <div className="text-[10px] text-muted-foreground/70 mt-1">
                            {new Date(n.created_at).toLocaleString()}
                          </div>
                        </div>
                        {isUnread && (
                          <button
                            onClick={() => markRead(n.id)}
                            className="text-muted-foreground hover:text-foreground p-1 -mr-1"
                            title="Mark read"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {n.link_path && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs"
                            onClick={() => {
                              markRead(n.id);
                              setOpen(false);
                              if (n.kind === "gate_application") {
                                navigate({ to: "/admin", search: { next: "/moderation" } } as never);
                                } else if (n.kind === "order_placed" && n.entity_id) {
                                  navigate({ to: "/shop", search: { view: "orders", id: n.entity_id } } as never);
                              } else {
                                navigate({ to: n.link_path! } as never);
                              }
                            }}
                          >
                            Open
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}