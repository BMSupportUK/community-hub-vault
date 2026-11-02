import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Save, Wifi, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePlayerDns, testPlayerDns } from "@/lib/player.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-player")({
  component: AdminPlayerPage,
  head: () => ({ meta: [
    { title: "BM Player DNS | Admin" },
    { name: "description", content: "Set the DNS address every BM Player app uses." },
    { property: "og:title", content: "BM Player DNS | Admin" },
    { property: "og:description", content: "Set the DNS address every BM Player app uses." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function AdminPlayerPage() {
  const { hasAny, loading } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const save = useServerFn(savePlayerDns), test = useServerFn(testPlayerDns);
  const [dns, setDns] = useState(""), [updated, setUpdated] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isAdmin) return;
    void supabase.from("player_settings").select("dns, updated_at").eq("id", 1).maybeSingle().then(({ data }) => {
      setDns(data?.dns ?? ""); setUpdated(data?.updated_at ?? null);
    });
    void supabase.from("player_devices").select("platform").not("user_id", "is", null).then(({ data }) => {
      const c: Record<string, number> = {};
      for (const r of data ?? []) c[r.platform] = (c[r.platform] ?? 0) + 1;
      setCounts(c);
    });
  }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/admin" />;

  return <main className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-8">
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-2xl font-bold">BM Player – DNS</h1>
      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <Label htmlFor="dns">DNS address</Label>
        <Input id="dns" placeholder="http://example.com:8080" value={dns} onChange={(e) => { setDns(e.target.value); setResult(null); }} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={async () => {
            setBusy("test");
            try { const r = await test({ data: { dns } }); setResult(r.reachable); } catch (e) { toast.error(e instanceof Error ? e.message : "Test failed"); }
            finally { setBusy(null); }
          }}>{busy === "test" ? <Loader2 className="animate-spin" /> : <Wifi />}Test connection</Button>
          <Button disabled={!!busy} onClick={async () => {
            setBusy("save");
            try { const r = await save({ data: { dns } }); setDns(r.dns); setUpdated(new Date().toISOString()); toast.success("DNS saved"); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
            finally { setBusy(null); }
          }}>{busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
        </div>
        {result !== null && <p className={result ? "flex items-center gap-1.5 text-sm text-primary" : "flex items-center gap-1.5 text-sm text-destructive"}>
          {result ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}{result ? "The DNS answered" : "The DNS didn't answer"}</p>}
        {updated && <p className="text-xs text-muted-foreground">Last changed {new Date(updated).toLocaleString("en-GB")}</p>}
        <p className="text-xs text-muted-foreground">Linked apps pick up a new DNS the next time they open.</p>
      </section>
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-display font-semibold">Linked devices</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[["android", "Android TV"], ["firetv", "Fire TV"], ["phone", "Phone"], ["windows", "Windows"]].map(([k, l]) =>
            <li key={k} className="rounded-md border border-border p-3"><div className="text-muted-foreground">{l}</div><div className="text-lg font-semibold">{counts[k] ?? 0}</div></li>)}
        </ul>
      </section>
    </div>
  </main>;
}
