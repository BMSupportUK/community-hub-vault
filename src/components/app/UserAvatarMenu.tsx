import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { UserCircle2, Pencil, Copy, LogOut, Settings, AtSign, Check, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

interface MiniProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function UserAvatarMenu() {
  const { user, roles, signOut, hasAny } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [copied, setCopied] = useState(false);
  const isAdmin = hasAny(["admin", "management"]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile(data as MiniProfile);
    };
    load();
    const ch = supabase
      .channel(`avatar-menu-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => setProfile(payload.new as MiniProfile),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  if (!user) return null;
  const name = profile?.display_name || profile?.username || user.email?.split("@")[0] || "User";
  const handle = profile?.username ? `@${profile.username}` : user.email ?? "";
  const initial = name.slice(0, 2).toUpperCase();
  const topRole = roles[0] ?? "member";

  const copyHandle = async () => {
    if (!profile?.username) return;
    await navigator.clipboard.writeText(profile.username);
    setCopied(true);
    toast.success("Username copied");
    setTimeout(() => setCopied(false), 1200);
  };

  const goEdit = () => {
    if (profile?.username) {
      navigate({ to: "/u/$username", params: { username: profile.username }, search: { tab: "profile", edit: 1 } as never });
    } else {
      navigate({ to: "/profile" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className="group relative flex items-center gap-2 rounded-full bg-rail/80 ring-1 ring-border hover:ring-primary/60 hover:bg-surface-2 transition-all px-1.5 py-1 shadow-soft"
        >
          <Avatar className="h-7 w-7 ring-2 ring-primary/40 group-hover:ring-primary transition">
            <AvatarImage src={profile?.avatar_url || "/default-avatar.png"} alt={name} />
            <AvatarFallback className="text-[10px] font-bold bg-gradient-primary text-primary-foreground">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:flex flex-col items-start leading-tight pr-2">
            <span className="text-xs font-semibold text-foreground max-w-[120px] truncate">{name}</span>
            <span className="text-[10px] text-muted-foreground capitalize">{topRole}</span>
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-rail" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/30 via-fuchsia-500/20 to-blue-500/20 p-4 pb-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 ring-2 ring-background shadow-lg">
              <AvatarImage src={profile?.avatar_url || "/default-avatar.png"} alt={name} />
              <AvatarFallback className="text-base font-bold bg-gradient-primary text-primary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{name}</div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <AtSign className="size-3" />
                {profile?.username ?? user.email}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded-full bg-background/60 px-2 py-0.5 text-foreground/80 capitalize">
                <Shield className="size-3" />
                {topRole}
              </div>
            </div>
          </div>
        </div>
        <div className="p-1">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Account
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={goEdit} className="cursor-pointer">
            <Pencil className="size-4 mr-2" />
            Edit profile
          </DropdownMenuItem>
          {profile?.username ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/u/$username" params={{ username: profile.username }}>
                <UserCircle2 className="size-4 mr-2" />
                View profile
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); copyHandle(); }} className="cursor-pointer">
            {copied ? <Check className="size-4 mr-2 text-emerald-500" /> : <Copy className="size-4 mr-2" />}
            Copy username
          </DropdownMenuItem>
          {isAdmin ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/admin">
                <Settings className="size-4 mr-2" />
                Admin dashboard
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="size-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
