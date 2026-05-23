import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  UserCircle2,
  Pencil,
  Copy,
  LogOut,
  Settings,
  AtSign,
  Check,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessOpen } from "@/hooks/use-business-open";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Nameplate } from "@/components/app/Nameplate";
import {
  roleFlashClass,
  type FlashRole,
  resolveAvatarUrl,
  useRoleFlashMap,
} from "@/lib/role-flash";
import { VpnBadge } from "@/lib/vpn-flags";
import { cn } from "@/lib/utils";

interface MiniProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  equipped_nameplate_id: string | null;
}

export function UserAvatarMenu() {
  const { user, roles, signOut, hasAny } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [copied, setCopied] = useState(false);
  const isAdmin = hasAny(["admin", "management"]);
  const businessOpen = useBusinessOpen();
  const roleFlashMap = useRoleFlashMap();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, equipped_nameplate_id")
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
  const handle = profile?.username ? `@${profile.username}` : (user.email ?? "");
  const initial = name.slice(0, 2).toUpperCase();
  const topRole = roles[0] ?? "member";
  const FLASH_PRIORITY: FlashRole[] = ["admin", "management", "moderator", "staff"];
  const flashRole = FLASH_PRIORITY.find((r) => roles.includes(r)) ?? null;
  const flashCls = roleFlashClass(flashRole);
  const resolvedAvatar = resolveAvatarUrl(user.id, profile?.avatar_url, roleFlashMap);
  const isStaffRole = hasAny(["admin", "management", "moderator", "staff"]);
  const isAway = isStaffRole && !businessOpen;
  const statusLabel = isAway ? "Away From The Office" : "Online";

  const copyHandle = async () => {
    if (!profile?.username) return;
    await navigator.clipboard.writeText(profile.username);
    setCopied(true);
    toast.success("Username copied");
    setTimeout(() => setCopied(false), 1200);
  };

  const goEdit = () => {
    if (profile?.username) {
      navigate({
        to: "/u/$username",
        params: { username: profile.username },
        search: { tab: "profile", edit: 1 } as never,
      });
    } else {
      navigate({ to: "/profile" });
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account menu"
                className="group relative flex items-center gap-2 rounded-full bg-rail/80 ring-1 ring-border hover:ring-primary/60 hover:bg-surface-2 transition-all px-1.5 py-1 shadow-soft"
              >
                <Avatar className="h-7 w-7 ring-2 ring-primary/40 group-hover:ring-primary transition">
                  <AvatarImage src={resolvedAvatar} alt={name} />
                  <AvatarFallback className="text-[10px] font-bold bg-gradient-primary text-primary-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden lg:flex flex-col items-start leading-tight pr-2">
                  <span
                    className={cn(
                      "text-xs font-semibold text-foreground max-w-[120px] truncate inline-flex items-center gap-1",
                      flashCls,
                    )}
                  >
                    {name}
                    <VpnBadge userId={user.id} size={11} showInactive />
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">{topRole}</span>
                </span>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-rail",
                    isAway
                      ? "bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)]"
                      : "bg-emerald-500",
                  )}
                  aria-label={statusLabel}
                />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="center"
            sideOffset={8}
            className="z-[1000] whitespace-nowrap bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md ring-1 ring-border"
          >
            {statusLabel}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-0 overflow-hidden">
          <div className="relative p-4 pb-3 overflow-hidden">
            <Nameplate
              id={profile?.equipped_nameplate_id ?? null}
              className="absolute inset-0"
              fallbackStyle={{
                background:
                  "linear-gradient(to bottom right, hsl(var(--primary)/0.3), hsl(330 80% 60% / 0.2), hsl(220 80% 60% / 0.2))",
              }}
            />
            <div className="relative flex items-center gap-3">
              <Avatar className="h-14 w-14 ring-2 ring-background shadow-lg">
                <AvatarImage src={resolvedAvatar} alt={name} />
                <AvatarFallback className="text-base font-bold bg-gradient-primary text-primary-foreground">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "font-semibold text-sm truncate inline-flex items-center gap-1",
                    flashCls,
                  )}
                >
                  {name}
                  <VpnBadge userId={user.id} size={12} showInactive />
                </div>
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
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                copyHandle();
              }}
              className="cursor-pointer"
            >
              {copied ? (
                <Check className="size-4 mr-2 text-emerald-500" />
              ) : (
                <Copy className="size-4 mr-2" />
              )}
              Copy username
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/account-security">
                <ShieldCheck className="size-4 mr-2" />
                Security & 2FA
              </Link>
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
    </TooltipProvider>
  );
}
