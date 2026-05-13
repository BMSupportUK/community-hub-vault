import { Link, useRouterState } from "@tanstack/react-router";
import { Hash, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface ChannelGroup {
  label: string;
  items: { to: string; label: string; icon?: React.ComponentType<{ className?: string }> }[];
}

export function ChannelColumn({ title, groups, footer }: { title: string; groups: ChannelGroup[]; footer?: ReactNode }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user } = useAuth();

  return (
    <nav className="w-60 shrink-0 bg-surface flex flex-col border-r border-border">
      <div className="h-14 flex items-center px-4 border-b border-border shadow-soft">
        <h2 className="font-display font-semibold text-sm tracking-wide">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3 space-y-4">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ChevronDown className="size-3" />
              {g.label}
            </div>
            <div className="space-y-px">
              {g.items.map((it) => {
                const Icon = it.icon ?? Hash;
                const active = path === it.to || path.startsWith(it.to + "/");
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                      active
                        ? "bg-surface-2 text-foreground"
                        : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{it.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {footer}
      </div>
      {user && (
        <div className="h-14 border-t border-border px-3 flex items-center gap-2 bg-rail">
          <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
            {(user.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{user.email}</div>
            <div className="text-[10px] text-muted-foreground">Online</div>
          </div>
        </div>
      )}
    </nav>
  );
}
