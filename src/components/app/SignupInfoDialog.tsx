import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SignupInfo {
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  language: string | null;
  languages: string | null;
  timezone: string | null;
  screen: string | null;
  viewport: string | null;
  platform: string | null;
  referrer: string | null;
  url: string | null;
  vendor: string | null;
  device_memory: string | null;
  hw_concurrency: string | null;
  connection: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
  is_vpn: boolean | null;
  is_proxy: boolean | null;
  vpn_provider: string | null;
  isp: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  geo_latitude: number | null;
  geo_longitude: number | null;
  geo_accuracy_m: number | null;
  geo_permission: string | null;
}

interface Props {
  userId: string;
  trigger?: React.ReactNode;
  displayName?: string | null;
}

export function SignupInfoDialog({ userId, trigger, displayName }: Props) {
  const { hasAny } = useAuth();
  const canView = hasAny(["admin", "management"]);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<SignupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ipGeo, setIpGeo] = useState<{ lat: number; lon: number; label: string } | null>(null);

  useEffect(() => {
    if (!open || !canView) return;
    setLoading(true);
    setErr(null);
    setIpGeo(null);
    supabase
      .from("signup_info")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        setInfo((data as SignupInfo) ?? null);
        setLoading(false);
      });
  }, [open, userId, canView]);

  // Fall back to free IP geolocation (ipapi.co — no API key) when we don't
  // already have precise coords stored from signup.
  useEffect(() => {
    if (!open || !info?.ip) return;
    if (info.geo_latitude != null && info.geo_longitude != null) return;
    let cancelled = false;
    fetch(`https://ipapi.co/${encodeURIComponent(info.ip)}/json/`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j || typeof j.latitude !== "number" || typeof j.longitude !== "number") return;
        const label = [j.city, j.region, j.country_name].filter(Boolean).join(", ");
        setIpGeo({ lat: j.latitude, lon: j.longitude, label });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, info?.ip, info?.geo_latitude, info?.geo_longitude]);

  const mapLat = info?.geo_latitude ?? ipGeo?.lat ?? null;
  const mapLon = info?.geo_longitude ?? ipGeo?.lon ?? null;
  const mapSource =
    info?.geo_latitude != null && info?.geo_longitude != null
      ? "precise (browser-shared)"
      : ipGeo
        ? "approximate (IP-based)"
        : null;

  if (!canView) return null;

  const rows: Array<[string, string | null | undefined]> = info
    ? [
        ["IP address", info.ip],
        [
          "VPN / Proxy",
          info.is_vpn === null && info.is_proxy === null
            ? "Unknown"
            : info.is_vpn
              ? `⚠️ VPN detected${info.vpn_provider ? ` (${info.vpn_provider})` : ""}`
              : info.is_proxy
                ? `⚠️ Proxy detected${info.vpn_provider ? ` (${info.vpn_provider})` : ""}`
                : "✅ Clean (no VPN/proxy)",
        ],
        ["ISP", info.isp],
        ["Location", [info.city, info.region, info.country].filter(Boolean).join(", ") || null],
        [
          "Precise location",
          info.geo_latitude != null && info.geo_longitude != null
            ? `${info.geo_latitude.toFixed(5)}, ${info.geo_longitude.toFixed(5)}${
                info.geo_accuracy_m ? ` (±${Math.round(info.geo_accuracy_m)}m)` : ""
              }`
            : info.geo_permission
              ? `Not shared (${info.geo_permission})`
              : "Not shared",
        ],
        ["User agent", info.user_agent],
        ["Platform", info.platform],
        ["Vendor", info.vendor],
        ["Language", info.language],
        ["All languages", info.languages],
        ["Timezone", info.timezone],
        ["Screen", info.screen],
        ["Viewport", info.viewport],
        ["Device memory (GB)", info.device_memory],
        ["CPU threads", info.hw_concurrency],
        ["Network", info.connection],
        ["Referrer", info.referrer],
        ["Signup URL", info.url],
        ["Captured at", new Date(info.created_at).toLocaleString()],
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger ?? (
          <button
            type="button"
            title="Signup info"
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-surface-2 hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <Info className="size-3.5" />
            Signup info
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Signup details{displayName ? ` — ${displayName}` : ""}</DialogTitle>
          <DialogDescription>Information captured when this user created their account.</DialogDescription>
        </DialogHeader>
        {loading && <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>}
        {err && <div className="text-sm text-destructive py-3">{err}</div>}
        {!loading && !info && !err && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No signup information recorded for this user.
          </div>
        )}
        {info && (
          <div className="space-y-1 text-sm">
            {rows.map(([k, v]) => (
              <div
                key={k}
                className="grid grid-cols-[160px_1fr] gap-3 py-1.5 border-b border-border/50 last:border-0"
              >
                <div className="text-muted-foreground">{k}</div>
                <div className="font-mono text-xs break-all">{v ?? "—"}</div>
              </div>
            ))}
            {mapLat != null && mapLon != null && (
              <div className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="text-muted-foreground">
                    Map {mapSource ? `— ${mapSource}` : ""}
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${mapLat}&mlon=${mapLon}#map=12/${mapLat}/${mapLon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Open in OpenStreetMap
                  </a>
                </div>
                <iframe
                  title="Signup location map"
                  className="w-full h-64 rounded-md border border-border"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapLon - 0.05},${mapLat - 0.05},${mapLon + 0.05},${mapLat + 0.05}&layer=mapnik&marker=${mapLat},${mapLon}`}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}