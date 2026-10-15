import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getApplicationByToken, postApplicantMessage } from "@/lib/jobs.functions";
import { JobApplicationSecure } from "@/components/app/JobApplicationSecure";

export const Route = createFileRoute("/job-application/$token")({
  head: () => ({ meta: [
    { title: "Your job application | BM Support" },
    { name: "description", content: "Your private job application page and chat with the recruitment team." },
    { property: "og:title", content: "Your job application | BM Support" },
    { property: "og:description", content: "Your private job application page and chat with the recruitment team." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  ssr: false,
  component: ApplicantPage,
});

function ApplicantPage() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getApplicationByToken);
  const send = useServerFn(postApplicantMessage);
  const key = `job-app-pw:${token}`;
  const [password, setPassword] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [checked, setChecked] = useState(false);
  useEffect(() => { setPassword(sessionStorage.getItem(key)); setChecked(true); }, [key]);
  const { data, isPending, error } = useQuery({ queryKey: ["job-app", token, password], queryFn: () => load({ data: { token, password: password! } }), refetchInterval: 8000, enabled: !!password });
  const wrong = !!password && !isPending && !error && !data;
  if (!checked) return null;
  if (!password || wrong) return <main className="grid min-h-dvh place-items-center p-4"><form className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6" onSubmit={(e) => { e.preventDefault(); const pw = entry.trim().toUpperCase(); if (!pw) return; sessionStorage.setItem(key, pw); setPassword(pw); }}>
    <h1 className="flex items-center gap-2 text-xl font-semibold"><Lock className="size-5 text-primary" />Secure application</h1>
    <p className="text-sm text-muted-foreground">Enter the password from your application email to continue.</p>
    <div className="space-y-2"><Label htmlFor="app-pw">Password</Label><Input id="app-pw" value={entry} onChange={(e) => setEntry(e.target.value)} autoComplete="off" placeholder="XXXX-XXXX-XXXX" maxLength={40} /></div>
    {wrong && <p role="alert" className="text-sm text-destructive">That password is incorrect.</p>}
    <Button type="submit" className="w-full">Open application</Button>
  </form></main>;
  if (isPending) return <p role="status" className="p-8">Loading your application…</p>;
  if (error || !data) return <div className="p-8"><h1 className="text-xl font-semibold">Application not found</h1><p className="mt-2 text-muted-foreground">Check you've opened the full link you were given.</p><Link to="/" className="mt-4 inline-block text-primary">Go home</Link></div>;
  return <JobApplicationSecure app={data} messages={data.messages} viewer="applicant"
    header={<p className="rounded-lg border border-border bg-card/90 p-3 text-sm">Keep this page's link and password private. Bookmark it to come back and chat with us.</p>}
    onSend={async (body) => { await send({ data: { token, password, body } }); await qc.invalidateQueries({ queryKey: ["job-app", token] }); }} />;
}
