import { createFileRoute, Link } from "@tanstack/react-router";
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
  const { data, isPending, error } = useQuery({ queryKey: ["job-app", token], queryFn: () => load({ data: { token } }), refetchInterval: 8000 });
  if (isPending) return <p role="status" className="p-8">Loading your application…</p>;
  if (error || !data) return <div className="p-8"><h1 className="text-xl font-semibold">Application not found</h1><p className="mt-2 text-muted-foreground">Check you've opened the full link you were given.</p><Link to="/" className="mt-4 inline-block text-primary">Go home</Link></div>;
  return <JobApplicationSecure app={data} messages={data.messages} viewer="applicant"
    header={<p className="rounded-lg border border-border bg-card/90 p-3 text-sm">Keep this page's link private — anyone with it can see your application. Bookmark it to come back and chat with us.</p>}
    onSend={async (body) => { await send({ data: { token, body } }); await qc.invalidateQueries({ queryKey: ["job-app", token] }); }} />;
}
