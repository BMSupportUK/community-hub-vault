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

  useEffect(() => {
    if (!open || !canView) return;
    setLoading(true);
    setErr(null);
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

  if (!canView) return null;

  const rows: Array<[string, string | null | undefined]> = info
    ? [
        ["IP address", info.ip],
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}