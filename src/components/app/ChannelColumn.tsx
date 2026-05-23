import { Link, useRouterState } from "@tanstack/react-router";
import { Hash, ChevronDown, Plus, Trash2, Shield, Smile, Pencil, ChevronUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessOpen } from "@/hooks/use-business-open";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoleFlashMap, resolveAvatarUrl, roleFlashClass } from "@/lib/role-flash";
import { VpnBadge } from "@/lib/vpn-flags";

export interface ChannelGroup {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: {
    id?: string;
    to: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    badge?: number;
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
  const { user } = useAuth();
  const { isStaff } = useAuth();
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
      inSheet ? "flex h-full w-full" : "shrink-0 hidden md:flex border-r border-border",
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
                      {g.onRenameGroup && (
                        <button
                          onClick={g.onRenameGroup}
                          title="Rename category"
                          className="hover:text-foreground p-0.5"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {g.onEditGroupIcon && (
                        <button
                          onClick={g.onEditGroupIcon}
                          title="Change category icon"
                          className="hover:text-foreground p-0.5"
                        >
                          <Smile className="size-3.5" />
                        </button>
                      )}
                      {g.onEditGroupPerms && (
                        <button
                          onClick={g.onEditGroupPerms}
                          title="Category permissions"
                          className="hover:text-primary p-0.5"
                        >
                          <Shield className="size-3.5" />
                        </button>
                      )}
                      {g.onDeleteGroup && (
                        <button
                          onClick={g.onDeleteGroup}
                          title="Delete category"
                          className="hover:text-destructive p-0.5"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-px">
                  {g.items.map((it) => {
                    const Icon = it.icon ?? Hash;
                    const active = path === it.to || path.startsWith(it.to + "/");
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
                        {(g.onDeleteItem ||
                          g.onEditItemPerms ||
                          g.onEditItemIcon ||
                          g.onRenameItem) && (
                          <div className="flex items-center gap-1 pl-6 pr-2 pb-1 -mt-0.5 text-muted-foreground">
                            {g.onRenameItem && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  g.onRenameItem!(it.to);
                                }}
                                title="Rename channel"
                                className="hover:text-foreground p-1"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            )}
                            {g.onEditItemIcon && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  g.onEditItemIcon!(it.to);
                                }}
                                title="Change channel icon"
                                className="hover:text-foreground p-1"
                              >
                                <Smile className="size-3.5" />
                              </button>
                            )}
                            {g.onEditItemPerms && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  g.onEditItemPerms!(it.to);
                                }}
                                title="Channel permissions"
                                className="hover:text-primary p-1"
                              >
                                <Shield className="size-3.5" />
                              </button>
                            )}
                            {g.onDeleteItem && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  g.onDeleteItem!(it.to);
                                }}
                                title="Delete channel"
                                className="hover:text-destructive p-1"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
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
        <div className="h-14 border-t border-border px-3 flex items-center gap-2 bg-rail">
          <img
            src={resolveAvatarUrl(user.id, profile?.avatar_url, roleFlashMap)}
            alt=""
            className="size-8 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className={cn("text-xs font-medium truncate", roleFlashClass(roleFlashMap.get(user.id)))}>
              <span className="inline-flex items-center gap-1">
                {profile?.display_name ?? profile?.username ?? "User"}
                <VpnBadge userId={user.id} size={11} showInactive />
              </span>
            </div>
            <div className={cn("text-[10px] flex items-center gap-1", isAway ? "text-yellow-400" : "text-muted-foreground")}>
              <span className={cn("size-1.5 rounded-full", isAway ? "bg-yellow-400" : "bg-emerald-500")} />
              {isAway ? "Away From The Office" : "Online"}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
