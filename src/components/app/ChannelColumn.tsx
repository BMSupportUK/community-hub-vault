import { Link, useRouterState } from "@tanstack/react-router";
import { Hash, ChevronDown, Plus, Trash2, Shield, Smile, Pencil, GripVertical } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChannelGroup {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: { id?: string; to: string; label: string; icon?: React.ComponentType<{ className?: string }>; badge?: number }[];
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
}: {
  title: string;
  groups: ChannelGroup[];
  footer?: ReactNode;
  onAddGroup?: () => void;
  onReorderChannels?: (ordered: { id: string; groupLabel: string }[]) => void;
  onReorderGroups?: (orderedLabels: string[]) => void;
}) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);
  const [dragChan, setDragChan] = useState<{ id: string; group: string } | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [overChan, setOverChan] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);

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
    for (const g of groups) for (const it of g.items) if (it.id) out.push({ id: it.id, group: g.label });
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
      if (flat[i].group === targetGroup) { insertAt = i + 1; break; }
      if (i === 0) insertAt = 0;
    }
    if (!flat.some((c) => c.group === targetGroup)) insertAt = flat.length;
    flat.splice(insertAt, 0, moved);
    onReorderChannels(flat.map((c) => ({ id: c.id, groupLabel: c.group })));
  };

  const dropGroupOnGroup = (targetLabel: string) => {
    if (!dragGroup || !onReorderGroups || dragGroup === targetLabel) return;
    const labels = groups.map((g) => g.label);
    const fromIdx = labels.indexOf(dragGroup);
    const [moved] = labels.splice(fromIdx, 1);
    const toIdx = labels.indexOf(targetLabel);
    labels.splice(toIdx, 0, moved);
    onReorderGroups(labels);
  };

  return (
    <nav className="w-60 shrink-0 bg-surface flex flex-col border-r border-border">
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
        {groups.map((g) => (
          <div
            key={g.label}
            onDragOver={(e) => {
              if (dragChan || (dragGroup && dragGroup !== g.label)) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              if (dragChan) { e.preventDefault(); dropChannelOnGroup(g.label); setDragChan(null); setOverGroup(null); }
              else if (dragGroup) { e.preventDefault(); dropGroupOnGroup(g.label); setDragGroup(null); setOverGroup(null); }
            }}
            className={cn(overGroup === g.label && dragGroup && dragGroup !== g.label && "ring-1 ring-primary/40 rounded-md")}
          >
            <div
              className={cn(
                "group/cat px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1",
                dragGroup === g.label && "opacity-50",
              )}
              draggable={!!onReorderGroups}
              onDragStart={(e) => {
                if (!onReorderGroups) return;
                setDragGroup(g.label);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => { setDragGroup(null); setOverGroup(null); }}
              onDragEnter={() => { if (dragGroup && dragGroup !== g.label) setOverGroup(g.label); }}
            >
              {onReorderGroups && (
                <GripVertical className="size-3 opacity-0 group-hover/cat:opacity-60 cursor-grab" />
              )}
              <ChevronDown className="size-3" />
              {g.icon ? <g.icon className="size-3" /> : null}
              <span className="flex-1 truncate">{g.label}</span>
              {g.onAddItem && (
                <button
                  onClick={g.onAddItem}
                  title="Add channel"
                  className="opacity-0 group-hover/cat:opacity-100 hover:text-foreground p-0.5"
                >
                  <Plus className="size-3.5" />
                </button>
              )}
              {g.onEditGroupIcon && (
                <button
                  onClick={g.onEditGroupIcon}
                  title="Change category icon"
                  className="opacity-0 group-hover/cat:opacity-100 hover:text-foreground p-0.5"
                >
                  <Smile className="size-3.5" />
                </button>
              )}
              {g.onRenameGroup && (
                <button
                  onClick={g.onRenameGroup}
                  title="Rename category"
                  className="opacity-0 group-hover/cat:opacity-100 hover:text-foreground p-0.5"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              {g.onEditGroupPerms && (
                <button
                  onClick={g.onEditGroupPerms}
                  title="Category permissions"
                  className="opacity-0 group-hover/cat:opacity-100 hover:text-primary p-0.5"
                >
                  <Shield className="size-3.5" />
                </button>
              )}
              {g.onDeleteGroup && (
                <button
                  onClick={g.onDeleteGroup}
                  title="Delete category"
                  className="opacity-0 group-hover/cat:opacity-100 hover:text-destructive p-0.5"
                >
                  <Trash2 className="size-3.5" />
                </button>
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
                      "group/ch flex items-center",
                      dragChan?.id === it.id && "opacity-40",
                      overChan === it.to && dragChan && dragChan.id !== it.id && "border-t-2 border-primary",
                    )}
                    draggable={canDrag}
                    onDragStart={(e) => {
                      if (!canDrag) return;
                      setDragChan({ id: it.id!, group: g.label });
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => { setDragChan(null); setOverChan(null); }}
                    onDragOver={(e) => {
                      if (!dragChan || dragChan.id === it.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setOverChan(it.to);
                    }}
                    onDragLeave={() => { if (overChan === it.to) setOverChan(null); }}
                    onDrop={(e) => {
                      if (!dragChan || dragChan.id === it.id || !it.id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      dropChannelOnItem(g.label, it.id);
                      setDragChan(null); setOverChan(null);
                    }}
                  >
                    <Link
                      to={it.to}
                      className={cn(
                        "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
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
                    {g.onDeleteItem && (
                      <button
                        onClick={(e) => { e.preventDefault(); g.onDeleteItem!(it.to); }}
                        title="Delete channel"
                        className="opacity-0 group-hover/ch:opacity-100 hover:text-destructive p-1"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    {g.onEditItemPerms && (
                      <button
                        onClick={(e) => { e.preventDefault(); g.onEditItemPerms!(it.to); }}
                        title="Channel permissions"
                        className="opacity-0 group-hover/ch:opacity-100 hover:text-primary p-1"
                      >
                        <Shield className="size-3.5" />
                      </button>
                    )}
                    {g.onEditItemIcon && (
                      <button
                        onClick={(e) => { e.preventDefault(); g.onEditItemIcon!(it.to); }}
                        title="Change channel icon"
                        className="opacity-0 group-hover/ch:opacity-100 hover:text-foreground p-1"
                      >
                        <Smile className="size-3.5" />
                      </button>
                    )}
                    {g.onRenameItem && (
                      <button
                        onClick={(e) => { e.preventDefault(); g.onRenameItem!(it.to); }}
                        title="Rename channel"
                        className="opacity-0 group-hover/ch:opacity-100 hover:text-foreground p-1"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {footer}
      </div>
      {user && (
        <div className="h-14 border-t border-border px-3 flex items-center gap-2 bg-rail">
          <img
            src={profile?.avatar_url || "/default-avatar.png"}
            alt=""
            className="size-8 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">
              {profile?.display_name ?? profile?.username ?? "User"}
            </div>
            <div className="text-[10px] text-muted-foreground">Online</div>
          </div>
        </div>
      )}
    </nav>
  );
}
