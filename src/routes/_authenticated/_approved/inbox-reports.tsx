import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Flag, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Report = { id: string; sender_name: string; reporter_name: string; message_snapshot: string; reason: string; status: string; created_at: string };
export const Route = createFileRoute("/_authenticated/_approved/inbox-reports")({
  head: () => ({ meta: [{ title: "Inbox Reports | BM Support" }, { name: "description", content: "Admin and management review of BM Support inbox reports." }, { property: "og:title", content: "Inbox Reports | BM Support" }, { property: "og:description", content: "Admin and management review of BM Support inbox reports." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: InboxReports,
});
function InboxReports() {
  const { hasAny } = useAuth();
  const allowed = hasAny(["admin", "management"]);
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["bm-inbox-reports"], enabled: allowed, queryFn: async () => { const result = await supabase.rpc("bm_inbox_review", {}); if (result.error) throw result.error; return result.data as unknown as Report[]; }, refetchInterval: 15000 });
  async function review(id: string, status: string) { const result = await supabase.rpc("bm_inbox_review", { _id: id, _status: status }); if (result.error) toast.error("Could not update this report."); else { toast.success("Report updated."); void refetch(); } }
  if (!allowed) return <p className="p-8">Admin and management only.</p>;
  return <main className="w-full min-w-0 p-4 md:p-8"><header className="mb-6 flex items-center gap-3"><Button size="icon" variant="outline" asChild><Link to="/inbox" aria-label="Back to inbox"><ArrowLeft className="size-4" /></Link></Button><h1 className="flex items-center gap-2 font-display text-2xl font-bold"><Flag className="size-5 text-primary" />BM Support Inbox Reports</h1></header>{error ? <p className="text-destructive">Reports unavailable.</p> : isPending ? <p>Loading reports…</p> : !data?.length ? <p className="text-muted-foreground">No reports.</p> : <div className="space-y-4">{data.map(r => <article key={r.id} className="rounded-lg border border-border bg-surface p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{r.sender_name} · reported by {r.reporter_name}</h2><span className="text-sm text-muted-foreground">{r.status}</span></div><blockquote className="my-4 whitespace-pre-wrap break-words border-l-2 border-primary pl-4">{r.message_snapshot}</blockquote><p className="whitespace-pre-wrap break-words text-sm">{r.reason}</p><time className="mt-3 block text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</time>{r.status === "pending" && <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => review(r.id, "reviewed")}><Check className="mr-2 size-4" />Mark reviewed</Button><Button size="sm" variant="outline" onClick={() => review(r.id, "dismissed")}><X className="mr-2 size-4" />Dismiss</Button></div>}</article>)}</div>}</main>;
}