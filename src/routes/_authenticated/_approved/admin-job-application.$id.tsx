import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { jobAdminAllowed, jobStatusSchema } from "@/lib/jobs";
import { getApplicationAdmin, postAdminApplicationMessage, reviewJobApplication } from "@/lib/jobs.functions";
import { JobApplicationSecure } from "@/components/app/JobApplicationSecure";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_approved/admin-job-application/$id")({
  head: () => ({ meta: [
    { title: "Job application | BM Support admin" },
    { name: "description", content: "Secure job application page with applicant chat." },
    { property: "og:title", content: "Job application | BM Support admin" },
    { property: "og:description", content: "Secure job application page with applicant chat." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminApplication,
});

function AdminApplication() {
  const { roles } = useAuth();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getApplicationAdmin);
  const send = useServerFn(postAdminApplicationMessage);
  const review = useServerFn(reviewJobApplication);
  const { data, isPending, error } = useQuery({ queryKey: ["job-app-admin", id], queryFn: () => load({ data: { id } }), refetchInterval: 8000, enabled: jobAdminAllowed(roles) });
  const [status, setStatus] = useState("new");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setStatus(data.application.status); setNotes(data.application.admin_notes ?? ""); } }, [data?.application.id]);
  if (!jobAdminAllowed(roles)) return <Navigate to="/home" />;
  if (isPending) return <p role="status" className="p-8">Loading application…</p>;
  if (error || !data) return <p role="alert" className="p-8">{error?.message ?? "Application not found."}</p>;
  const a = data.application;
  const back = data.zone === "bm" ? "/admin-jobs" : "/fan-zone-jobs-admin";
  const link = `${window.location.origin}/job-application/${a.access_token}`;
  return <JobApplicationSecure viewer="admin" messages={data.messages}
    app={{ ...a, vacancy_title: data.vacancy_title }}
    onSend={async (body) => { await send({ data: { id, body } }); await qc.invalidateQueries({ queryKey: ["job-app-admin", id] }); }}
    header={<div className="flex flex-wrap items-center justify-between gap-3"><Link to={back} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Jobs &amp; applications</Link>
      <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Applicant's secure link copied"); }}><Copy className="mr-2 size-4" />Copy applicant link</Button></div>}
    extra={<section className="space-y-4 rounded-lg border border-border bg-card/90 p-5">
      <div className="space-y-2"><Label>Review status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Review status" className="w-60"><SelectValue /></SelectTrigger><SelectContent>{jobStatusSchema.options.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="app-notes">Private admin notes</Label><Textarea id="app-notes" rows={3} maxLength={6000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button disabled={busy} onClick={async () => { setBusy(true); try { await review({ data: { id, status: jobStatusSchema.parse(status), admin_notes: notes } }); await qc.invalidateQueries({ queryKey: ["job-app-admin", id] }); toast.success("Review saved"); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); } }}><Save className="mr-2 size-4" />{busy ? "Saving…" : "Save review"}</Button>
    </section>} />;
}
