import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Hash, ChevronDown, Plus, Trash2, Shield, Smile, Pencil, ChevronUp, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessOpen } from "@/hooks/use-business-open";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoleFlashMap, resolveAvatarUrl, roleFlashClass } from "@/lib/role-flash";
import { VpnBadge } from "@/lib/vpn-flags";
import { MentionsBadge } from "@/components/app/MentionsBadge";
import { NotificationBell } from "@/components/app/NotificationBell";
import { UserAvatarMenu } from "@/components/app/UserAvatarMenu";
import { MyWorkingStatus } from "@/components/app/MyWorkingStatus";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ChannelGroup {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: {
    id?: string;
    to: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: number;
    /** Override the auto path-match active state (useful for query-param views). */
    active?: boolean;
    /** When provided, render as a button instead of a Link. */
    onClick?: () => void;
  }[];
  onAddItem?: () => void;
  onDeleteItem?: (to: string) => void;
  onDeleteGroup?: () => void;
  onEditItemPerms?: (to: string) => void;
  onEditGroupPerms?: () => void;
  onEditItemIcon?: (to: string) => void;
  onEditGroupIcon?: () => void;
  onRenameItem?: (to: string) => void;
  onRenameGroup?: () => void;
}

export function ChannelColumn({
  title,
  groups,
  footer,
  onAddGroup,
  onReorderChannels,
  onReorderGroups,
  inSheet = false,
}: {
  title: string;
  groups: ChannelGroup[];
  footer?: ReactNode;
  onAddGroup?: () => void;
  onReorderChannels?: (ordered: { id: string; groupLabel: string }[]) => void;
  onReorderGroups?: (orderedLabels: string[]) => void;
  inSheet?: boolean;
}) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };
  const businessOpen = useBusinessOpen();
  const isAway = isStaff && !businessOpen;
  const roleFlashMap = useRoleFlashMap();
  const [profile, setProfile] = useState<{
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [dragChan, setDragChan] = useState<{ id: string; group: string } | null>(null);
  const [overChan, setOverChan] = useState<string | null>(null);
  const [settings, setSettings] = useState<
    | { type: "group"; group: ChannelGroup }
    | { type: "item"; group: ChannelGroup; itemTo: string; itemLabel: string }
    | null
  >(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? null));
  }, [user?.id]);

  const flatten = () => {
    const out: { id: string; group: string }[] = [];
    for (const g of groups)
      for (const it of g.items) if (it.id) out.push({ id: it.id, group: g.label });
    return out;
  };

  const dropChannelOnItem = (targetGroup: string, targetItemId: string) => {
    if (!dragChan || !onReorderChannels) return;
    const flat = flatten();
    const fromIdx = flat.findIndex((c) => c.id === dragChan.id);
    if (fromIdx < 0) return;
    const [moved] = flat.splice(fromIdx, 1);
    moved.group = targetGroup;
    let targetIdx = flat.findIndex((c) => c.id === targetItemId);
    if (targetIdx < 0) targetIdx = flat.length;
    flat.splice(targetIdx, 0, moved);
    onReorderChannels(flat.map((c) => ({ id: c.id, groupLabel: c.group })));
  };

  const dropChannelOnGroup = (targetGroup: string) => {
    if (!dragChan || !onReorderChannels) return;
    const flat = flatten();
    const fromIdx = flat.findIndex((c) => c.id === dragChan.id);
    if (fromIdx < 0) return;
    const [moved] = flat.splice(fromIdx, 1);
    moved.group = targetGroup;
    // append at end of target group
    let insertAt = flat.length;
    for (let i = flat.length - 1; i >= 0; i--) {
      if (flat[i].group === targetGroup) {
        insertAt = i + 1;
        break;
      }
      if (i === 0) insertAt = 0;
    }
    if (!flat.some((c) => c.group === targetGroup)) insertAt = flat.length;
    flat.splice(insertAt, 0, moved);
    onReorderChannels(flat.map((c) => ({ id: c.id, groupLabel: c.group })));
  };

  return (
    <nav className={cn(
      "w-60 bg-surface flex-col",
      inSheet
        ? "flex h-full w-full"
        : "shrink-0 hidden md:flex border-r border-border sticky top-12 self-start h-[calc(100vh-3rem)]",
    )}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-border shadow-soft">
        <h2 className="font-display font-semibold text-sm tracking-wide">{title}</h2>
        {onAddGroup && (
          <button
            onClick={onAddGroup}
            title="Add category"
            className="text-muted-foreground hover:text-foreground p-1 rounded-md"
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3 space-y-4">
        {groups.map((g) =>
          (() => {
            const groupIdx = groups.findIndex((x) => x.label === g.label);
            const canMoveUp = !!onReorderGroups && groupIdx > 0;
            const canMoveDown = !!onReorderGroups && groupIdx < groups.length - 1;
            const moveGroup = (dir: -1 | 1) => {
              if (!onReorderGroups) return;
              const labels = groups.map((x) => x.label);
              const j = groupIdx + dir;
              if (j < 0 || j >= labels.length) return;
              [labels[groupIdx], labels[j]] = [labels[j], labels[groupIdx]];
              onReorderGroups(labels);
            };
            return (
              <div
                key={g.label}
                onDragOver={(e) => {
                  if (dragChan) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => {
                  if (dragChan) {
                    e.preventDefault();
                    dropChannelOnGroup(g.label);
                    setDragChan(null);
                  }
                }}
              >
                <div className="group/cat px-2 pb-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1">
                    <ChevronDown className="size-3" />
                    {g.icon ? <g.icon className="size-3" /> : null}
                    <span className="flex-1 truncate">{g.label}</span>
                  </div>
                  {(g.onAddItem ||
                    g.onEditGroupIcon ||
                    g.onRenameGroup ||
                    g.onEditGroupPerms ||
                    g.onDeleteGroup ||
                    onReorderGroups) && (
                    <div className="hidden group-hover/cat:flex items-center gap-1 pt-1 pl-5 text-muted-foreground">
                      {onReorderGroups && (
                        <>
                          <button
                            onClick={() => moveGroup(-1)}
                            disabled={!canMoveUp}
                            title="Move category up"
                            className="hover:text-foreground p-0.5 disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ChevronUp className="size-3.5" />
                          </button>
                          <button
                            onClick={() => moveGroup(1)}
                            disabled={!canMoveDown}
                            title="Move category down"
                            className="hover:text-foreground p-0.5 disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ChevronDown className="size-3.5" />
                          </button>
                        </>
                      )}
                      {g.onAddItem && (
                        <button
                          onClick={g.onAddItem}
                          title="Add channel"
                          className="hover:text-foreground p-0.5"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      )}
                      {(g.onRenameGroup ||
                        g.onEditGroupIcon ||
                        g.onEditGroupPerms ||
                        g.onDeleteGroup) && (
                        <button
                          onClick={() => setSettings({ type: "group", group: g })}
                          title="Category settings"
                          className="hover:text-foreground p-0.5"
                        >
                          <Settings className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-px">
                  {g.items.map((it) => {
                    const Icon = it.icon ?? Hash;
                    const active = it.active ?? (path === it.to || path.startsWith(it.to + "/"));
                    const canDrag = !!onReorderChannels && !!it.id;
                    return (
                      <div
                        key={it.to}
                        className={cn(
                          "group/ch relative",
                          dragChan?.id === it.id && "opacity-40",
                          overChan === it.to &&
                            dragChan &&
                            dragChan.id !== it.id &&
                            "border-t-2 border-primary",
                        )}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          if (!canDrag) return;
                          setDragChan({ id: it.id!, group: g.label });
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", `chan:${it.id}`);
                          e.stopPropagation();
                        }}
                        onDragEnd={() => {
                          setDragChan(null);
                          setOverChan(null);
                        }}
                        onDragOver={(e) => {
                          if (!dragChan || dragChan.id === it.id) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setOverChan(it.to);
                        }}
                        onDragLeave={() => {
                          if (overChan === it.to) setOverChan(null);
                        }}
                        onDrop={(e) => {
                          if (!dragChan || dragChan.id === it.id || !it.id) return;
                          e.preventDefault();
                          e.stopPropagation();
                          dropChannelOnItem(g.label, it.id);
                          setDragChan(null);
                          setOverChan(null);
                        }}
                      >
                        {it.onClick ? (
                          <button
                            type="button"
                            onClick={it.onClick}
                            draggable={false}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors text-left",
                              active
                                ? "bg-surface-2 text-white"
                                : "text-foreground/90 hover:bg-surface-2/60 hover:text-white",
                            )}
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{it.label}</span>
                            {it.badge && it.badge > 0 ? (
                              <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 text-white text-[10px] font-bold grid place-items-center shadow-glow">
                                {it.badge > 99 ? "99+" : it.badge}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                          <Link
                            to={it.to}
                            draggable={false}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
                              active
                                ? "bg-surface-2 text-white"
                                : "text-foreground/90 hover:bg-surface-2/60 hover:text-white",
                            )}
                          >
                            <Icon className="size-4 shrink-0" />
                            <span className="truncate">{it.label}</span>
                            {it.badge && it.badge > 0 ? (
                              <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 text-white text-[10px] font-bold grid place-items-center shadow-glow">
                                {it.badge > 99 ? "99+" : it.badge}
                              </span>
                            ) : null}
                          </Link>
                        )}
                        {(g.onDeleteItem ||
                          g.onEditItemPerms ||
                          g.onEditItemIcon ||
                          g.onRenameItem) && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setSettings({
                                type: "item",
                                group: g,
                                itemTo: it.to,
                                itemLabel: it.label,
                              });
                            }}
                            title="Channel settings"
                            className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover/ch:flex items-center justify-center p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"
                          >
                            <Settings className="size-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })(),
        )}
        {footer}
      </div>
      {user && (
        <div
          className={cn(
            "relative z-10 h-14 border-t border-border bg-rail flex items-center",
            inSheet ? "" : "lg:-ml-[72px]",
          )}
        >
          {!inSheet && (
            <div className="hidden lg:flex w-[72px] shrink-0 items-center justify-center">
              <UserAvatarMenu variant="bar" />
            </div>
          )}
          <div className={cn("flex items-center gap-2 flex-1 min-w-0", inSheet ? "px-3" : "lg:pl-0 pl-3 pr-2")}>
            <div className={cn("shrink-0", !inSheet && "lg:hidden")}>
              <UserAvatarMenu variant="bar" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn("text-xs font-medium truncate", roleFlashClass(roleFlashMap.get(user.id)))}>
                <span className="inline-flex items-center gap-1">
                  {profile?.display_name ?? profile?.username ?? "User"}
                  <VpnBadge userId={user.id} size={11} showInactive />
                </span>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-0.5 shrink-0 text-muted-foreground">
              <MyWorkingStatus />
              <MentionsBadge />
              <NotificationBell />
              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg hover:bg-surface-2 hover:text-destructive transition-colors"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
    {settings && (() => {
      const isGroup = settings.type === "group";
      const g = settings.group;
      const close = () => setSettings(null);
      const run = (fn?: () => void) => { if (fn) { fn(); close(); } };
      const runItem = (fn?: (to: string) => void) => {
        if (fn && settings.type === "item") { fn(settings.itemTo); close(); }
      };
      const title = isGroup
        ? `Category: ${g.label}`
        : `Channel: ${settings.type === "item" ? settings.itemLabel : ""}`;
      const Btn = ({ onClick, icon: Icon, label, danger }: { onClick: () => void; icon: typeof Pencil; label: string; danger?: boolean }) => (
        <button
          onClick={onClick}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-border text-sm font-medium transition-colors",
            danger
              ? "hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
              : "hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          <span>{label}</span>
        </button>
      );
      return (
        <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 pt-1">
              {isGroup ? (
                <>
                  {g.onRenameGroup && <Btn onClick={() => run(g.onRenameGroup)} icon={Pencil} label="Rename category" />}
                  {g.onEditGroupIcon && <Btn onClick={() => run(g.onEditGroupIcon)} icon={Smile} label="Change icon" />}
                  {g.onEditGroupPerms && <Btn onClick={() => run(g.onEditGroupPerms)} icon={Shield} label="Permissions" />}
                  {g.onDeleteGroup && <Btn onClick={() => run(g.onDeleteGroup)} icon={Trash2} label="Delete category" danger />}
                </>
              ) : (
                <>
                  {g.onRenameItem && <Btn onClick={() => runItem(g.onRenameItem)} icon={Pencil} label="Rename channel" />}
                  {g.onEditItemIcon && <Btn onClick={() => runItem(g.onEditItemIcon)} icon={Smile} label="Change icon" />}
                  {g.onEditItemPerms && <Btn onClick={() => runItem(g.onEditItemPerms)} icon={Shield} label="Permissions" />}
                  {g.onDeleteItem && <Btn onClick={() => runItem(g.onDeleteItem)} icon={Trash2} label="Delete channel" danger />}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      );
    })()}
    </>
  );
}
