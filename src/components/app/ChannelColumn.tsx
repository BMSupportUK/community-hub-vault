import { Link, useRouterState } from "@tanstack/react-router";
import { Hash, ChevronDown, Plus, Trash2, Shield, Smile } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChannelGroup {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  items: { to: string; label: string; icon?: React.ComponentType<{ className?: string }>; badge?: number }[];
  onAddItem?: () => void;
  onDeleteItem?: (to: string) => void;
  onDeleteGroup?: () => void;
  onEditItemPerms?: (to: string) => void;
  onEditGroupPerms?: () => void;
  onEditItemIcon?: (to: string) => void;
  onEditGroupIcon?: () => void;
}

export function ChannelColumn({
  title,
  groups,
  footer,
  onAddGroup,
}: {
  title: string;
  groups: ChannelGroup[];
  footer?: ReactNode;
  onAddGroup?: () => void;
}) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user } = useAuth();
  const [profile, setProfile] = useState<{ display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data ?? null));
  }, [user?.id]);

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
          <div key={g.label}>
            <div className="group/cat px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
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
                return (
                  <div key={it.to} className="group/ch flex items-center">
                    <Link
                      to={it.to}
                      className={cn(
                        "flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                        active
                          ? "bg-surface-2 text-foreground"
                          : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
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
