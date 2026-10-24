import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, MonitorUp, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpRequests, History, LiveSessions } from "@/components/tv/TvRemote";
import { canConnectTvByCode, canOpenTvRemoteOverview, normalizePairCode, screenShareDestination } from "@/lib/tv-remote";

export const Route = createFileRoute("/_authenticated/_approved/tv-remote")({
  component: TvRemotePage,
  head: () => ({
    meta: [
      { title: "TV Remote | BM Support Staff" },
      { name: "description", content: "Answer customers' TV help requests and view their screen with other staff." },
      { property: "og:title", content: "TV Remote | BM Support Staff" },
      { property: "og:description", content: "Answer customers' TV help requests and view their screen with other staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Admin/management-only box: type the six-digit code from the customer's TV to take control. */
function ConnectByCodeBox() {
  const { roles, user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canConnectTvByCode(roles)) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_tv_pair_code", { _code: code, _customer: customer || undefined });
    setBusy(false);
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) { toast.error(error?.message ?? "That code is wrong or has expired"); return; }
    void navigate({ to: "/tv-remote/$sessionId", params: { sessionId: row.id } });
  };
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><MonitorUp className="h-5 w-5 text-primary" />Connect with a code</h2>
      <p className="text-sm text-muted-foreground">Enter the six-digit code shown in BM Remote Helper on the customer's TV to view and control it.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Code on the TV</span>
          <Input inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(normalizePairCode(e.target.value))}
            placeholder="123456" className="h-12 text-center font-mono text-2xl tracking-[0.4em]" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Customer username (optional, for the log)</span>
          <Input value={customer} maxLength={80} onChange={(e) => setCustomer(e.target.value)} />
        </label>
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6 || !user}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MonitorUp className="size-4" />}
          {busy ? "Connecting…" : "Connect to TV"}
        </Button>
      </form>
    </section>
  );
}

function TvRemotePage() {
  const { roles, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!canOpenTvRemoteOverview(roles)) return <Navigate to="/home" replace />;
  const open = (sessionId: string) => navigate({ to: "/tv-remote/$sessionId", params: { sessionId } });
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Tv className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">TV Remote</h1>
          <p className="text-sm text-muted-foreground">Each customer request gets its own page. Answer one to open it.</p>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6 lg:grid-cols-2">
          <HelpRequests onOpen={open} />
          <LiveSessions onJoin={(l) => {
            const destination = screenShareDestination(l.linkKind, l.linkId);
            if (destination) void navigate(destination);
            else void open(l.id);
          }} />
        </div>
        <ConnectByCodeBox />
      </div>
      <History />
    </div>
  );
}
