import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
  Smartphone,
  Lock,
} from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { lockScreenNow } from "@/components/app/ScreenLockProvider";

import { usePresence } from "@/components/app/PresenceIndicators";
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
import { Nameplate } from "@/components/app/Nameplate";
import {
  roleFlashClass,
  type FlashRole,
  resolveAvatarUrl,
  useRoleFlashMap,
} from "@/lib/role-flash";
import { VpnBadge } from "@/lib/vpn-flags";
import { cn } from "@/lib/utils";
import { isFanZonePath } from "@/lib/fan-zone-nav";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ANDROID_APK_URL = androidApkAsset.url;
const ANDROID_APK_ABSOLUTE_URL = `https://bmsupport.uk${androidApkAsset.url}`;

interface MiniProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  equipped_nameplate_id: string | null;
  custom_status: string | null;
}

export function UserAvatarMenu({ variant = "header" }: { variant?: "header" | "bar" } = {}) {
  const { user, roles, signOut, hasAny, isFanZoneOnly } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [copied, setCopied] = useState(false);
  const [apkOpen, setApkOpen] = useState(false);
  const [apkQr, setApkQr] = useState<string | null>(null);
  const isAdmin = hasAny(["admin", "management"]);
  const roleFlashMap = useRoleFlashMap();
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;
  const presence = usePresence(user?.id, Boolean(user));
  const path = useRouterState({ select: (s) => s.location.pathname });
  const inFanZone = isFanZonePath(path) || isFanZoneOnly;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, equipped_nameplate_id, custom_status")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile(data as MiniProfile);
    };
    load();
    const ch = supabase
      .channel(`avatar-menu-${user.id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => setProfile(payload.new as MiniProfile),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, instanceId]);

  useEffect(() => {
    if (!apkOpen || apkQr) return;
    let cancel = false;
    QRCode.toDataURL(ANDROID_APK_URL, {
      width: 220,
      margin: 2,
      color: { dark: "#0b0616", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancel) setApkQr(url);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [apkOpen, apkQr]);

  if (!user) return null;
  const name = profile?.display_name || profile?.username || user.email?.split("@")[0] || "User";
  const handle = profile?.username ? `@${profile.username}` : (user.email ?? "");
  const initial = name.slice(0, 2).toUpperCase();
  const topRole = roles[0] ?? "member";
  const FLASH_PRIORITY: FlashRole[] = ["admin", "management", "moderator", "staff"];
  const flashRole = FLASH_PRIORITY.find((r) => roles.includes(r)) ?? null;
  const flashCls = roleFlashClass(flashRole);
  const resolvedAvatar = resolveAvatarUrl(user.id, profile?.avatar_url, roleFlashMap);
  const isDnd = presence.kind === "dnd";
  const statusLabel = presence.shortLabel;
  const trigger =
    variant === "bar" ? (
      <button
        aria-label="Account menu"
        title={statusLabel}
        className="group relative rounded-full focus:outline-none focus:ring-2 focus:ring-primary/60"
      >
        <Avatar className="h-9 w-9 ring-2 ring-primary/40 group-hover:ring-primary transition">
          <AvatarImage src={resolvedAvatar} alt={name} />
          <AvatarFallback className="text-[11px] font-bold bg-gradient-primary text-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-rail",
            isDnd ? "bg-violet-500 shadow-[0_0_10px_rgba(167,139,250,0.85)]" : "bg-emerald-500",
          )}
          aria-label={statusLabel}
        />
      </button>
    ) : (
      <button
        aria-label="Account menu"
        title={statusLabel}
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
            isDnd ? "bg-violet-500 shadow-[0_0_10px_rgba(167,139,250,0.85)]" : "bg-emerald-500",
          )}
          aria-label={statusLabel}
        />
      </button>
    );

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
    <>
    <Dialog open={apkOpen} onOpenChange={setApkOpen}>
      <DialogContent className="max-w-xs sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-4 text-primary" /> Get the Android app
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with your phone camera to download the BM Support app.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl bg-white p-2">
            {apkQr ? (
              <img src={apkQr} alt="QR code to download the BM Support Android app" className="block size-[200px]" />
            ) : (
              <div className="size-[200px] animate-pulse rounded bg-muted" />
            )}
          </div>
          <Button asChild size="sm" className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
            <a href={ANDROID_APK_URL} target="_blank" rel="noopener noreferrer">
              Download on this device
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "bar" ? "top" : "bottom"}
        align={variant === "bar" ? "start" : "end"}
        sideOffset={8}
        className="w-72 p-0 overflow-hidden"
      >
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
            {inFanZone ? "Fan Zone account" : "Account"}
          </DropdownMenuLabel>
          {!inFanZone ? (
            <DropdownMenuItem onSelect={goEdit} className="cursor-pointer">
              <Pencil className="size-4 mr-2" />
              Edit profile
            </DropdownMenuItem>
          ) : null}
          {inFanZone ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/fanzone/profile">
                <Settings className="size-4 mr-2" />
                Fan Zone profile &amp; settings
              </Link>
            </DropdownMenuItem>
          ) : null}
          {inFanZone ? (
            user ? (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/fanzone/u/$userId" params={{ userId: user.id }}>
                  <UserCircle2 className="size-4 mr-2" />
                  View profile
                </Link>
              </DropdownMenuItem>
            ) : null
          ) : profile?.username ? (
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
          {!inFanZone ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setApkOpen(true);
              }}
              className="cursor-pointer"
            >
              <Smartphone className="size-4 mr-2" />
              Get the Android app
            </DropdownMenuItem>
          ) : null}
          {!inFanZone && isAdmin ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/admin">
                <Settings className="size-4 mr-2" />
                Owner dashboard
              </Link>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => lockScreenNow()} className="cursor-pointer">
            <Lock className="size-4 mr-2" />
            Lock screen
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={async () => {
              await signOut();
              window.location.replace("/login");
            }}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <LogOut className="size-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}
