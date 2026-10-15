import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, MapPin, CalendarDays, CheckCircle2, Send, Search, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LandingHeader } from "@/components/LandingHeader";
import { FanZonePublicHeader } from "./FanZonePublicHeader";
import { IconRail } from "./IconRail";
import { JobsMemberHeader } from "./JobsMemberHeader";
import { applicationSchema, positionsLabel, positionsLeft, type JobZone, type JobVacancy } from "@/lib/jobs";
import { listJobVacancies, submitJobApplication } from "@/lib/jobs.functions";
import interview from "@/assets/jobs-interview.jpg";
import { useAuth } from "@/hooks/use-auth";

export const jobsQueryOptions = (zone: JobZone) => queryOptions({ queryKey: ["public-jobs", zone], queryFn: () => listJobVacancies({ data: { zone } }) });
export function JobsBoard({ zone }: { zone: JobZone }) {
  const { user, isFanZoneOnly } = useAuth();
  const { data: vacancies } = useSuspenseQuery(jobsQueryOptions(zone));
  const [selected, setSelected] = useState<JobVacancy | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const types = Array.from(new Set(vacancies.map((v) => v.employment_type).filter(Boolean) as string[]));
  const needle = q.trim().toLowerCase();
  const filtered = vacancies.filter((v) => (!type || v.employment_type === type) && (!needle || `${v.title} ${v.location ?? ""} ${v.description}`.toLowerCase().includes(needle)));
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`jobs-board-${zone}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_job_vacancies" }, () => { void qc.invalidateQueries({ queryKey: ["public-jobs", zone] }); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [zone, qc]);
  const isBoro = zone === "fanzone";
  const name = isBoro ? "Boro Fan Zone" : "BM Support";
  const content = <div className="relative isolate min-h-dvh min-w-0 flex-1">
    <img src={interview} alt="A candidate meeting two interviewers in a welcoming workplace" width={1536} height={1024} className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-center" />
    <div className="pointer-events-none absolute inset-0 -z-10 bg-background/75" />
    {isBoro ? <FanZonePublicHeader /> : user && !isFanZoneOnly ? <JobsMemberHeader /> : <LandingHeader />}
    {selected ? <main className="w-full px-4 py-6 sm:px-8 lg:px-12">
      <button onClick={() => setSelected(null)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to all jobs</button>
      <section className="mt-5 rounded-xl border border-border bg-card/95 p-6 shadow-sm backdrop-blur-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{name} · Careers</p>
            <h1 className="mt-2 break-words font-display text-3xl font-bold sm:text-4xl">{selected.title}</h1>
            <JobMeta job={selected} />
          </div>
          <a href="#apply" className="shrink-0"><Button size="lg">Apply now <ArrowRight className="ml-2 size-4" /></Button></a>
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-xl border border-border bg-card/95 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <JobDetails job={selected} />
        </div>
        <div id="apply" className="rounded-xl border border-border bg-card/95 p-6 shadow-sm backdrop-blur-sm sm:p-8 lg:sticky lg:top-4">
          <ApplicationForm key={selected.id} job={selected} />
        </div>
      </div>
    </main> : <main className="w-full">
      <section className="border-b border-border bg-card/80 px-4 py-10 backdrop-blur-sm sm:px-8 sm:py-14 lg:px-12">
        <Link to={isBoro ? "/fan-zone" : "/"} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {name}</Link>
        <div className="mt-6 flex items-center gap-3 text-primary"><BriefcaseBusiness className="size-5" /><span className="text-xs font-semibold uppercase tracking-widest">{name} Careers</span></div>
        <h1 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">Find your next role with {name}</h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">{isBoro ? "Help make our Boro community a welcoming place for every supporter." : "Be part of the team helping our customers get the support they need."}</p>
        <div className="mt-8 flex max-w-3xl flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search job title, location or keyword" className="h-12 pl-10" /></div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-12 rounded-md border border-input bg-background px-3 text-sm sm:w-56">
            <option value="">All job types</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </section>
      <section aria-label="Open positions" className="px-4 py-8 sm:px-8 lg:px-12">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 className="font-display text-2xl font-semibold">Open positions</h2><span className="rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? "job" : "jobs"}</span></div>
        {!filtered.length ? <div className="rounded-xl border border-border bg-card/95 p-10 text-center"><h3 className="text-lg font-semibold">{vacancies.length ? "No jobs match your search" : "No open positions right now"}</h3><p className="mt-2 text-muted-foreground">Please check back for future opportunities.</p></div> : <div className="grid gap-4 xl:grid-cols-2">{filtered.map((job) => { const left = positionsLeft(job.positions_available, job.positions_filled); return <article key={job.id} className="group flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card/95 p-6 shadow-sm backdrop-blur-sm transition hover:border-primary/60 hover:shadow-md sm:flex-row sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><BriefcaseBusiness className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-display text-xl font-bold">{job.title}</h3>
            <JobMeta job={job} />
            <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{job.description}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            {left > 0 ? <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{left} of {positionsLabel(job.positions_available)} left</span> : <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">All positions filled</span>}
            <Button disabled={left === 0} onClick={() => { setSelected(job); window.scrollTo({ top: 0 }); }}>View &amp; apply <ArrowRight className="ml-2 size-4" /></Button>
          </div>
        </article>; })}</div>}
      </section>
    </main>}
  </div>;
  if (isBoro) return <div className="boro-theme flex min-h-dvh"><IconRail />{content}</div>;
  return user && !isFanZoneOnly ? <div className="flex min-h-dvh"><IconRail />{content}</div> : content;
}
function JobMeta({ job }: { job: JobVacancy }) {
  return <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
    {job.location && <span className="flex items-center gap-1.5"><MapPin className="size-4 shrink-0" />{job.location}</span>}
    {job.employment_type && <span className="flex items-center gap-1.5"><BriefcaseBusiness className="size-4 shrink-0" />{job.employment_type}</span>}
    {job.hours && <span className="flex items-center gap-1.5"><Clock className="size-4 shrink-0" />{job.hours}</span>}
    <span className="flex items-center gap-1.5"><Users className="size-4 shrink-0" />{positionsLabel(job.positions_available)}</span>
    {job.closing_date && <span className="flex items-center gap-1.5"><CalendarDays className="size-4 shrink-0" />Closes {new Date(`${job.closing_date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
  </div>;
}
function JobDetails({ job }: { job: JobVacancy }) {
  return <div className="space-y-8"><div><h2 className="mb-3 font-display text-xl font-bold">About the role</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{job.description}</p></div>
    {job.requirements && <div className="border-t border-border pt-6"><h2 className="mb-3 font-display text-xl font-bold">What we're looking for</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{job.requirements}</p></div>}</div>;
}
function ApplicationForm({ job }: { job: JobVacancy }) {
  const send = useServerFn(submitJobApplication);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ token: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  if (sent) { const link = `${window.location.origin}/job-application/${sent.token}`; return <div className="py-8 text-center"><h2 className="text-lg font-semibold">Application received</h2><p className="text-sm text-muted-foreground">Your application for {job.title} has been sent to our admin team for review.</p><CheckCircle2 className="mx-auto mt-6 size-12 text-success" />
    <p className="mt-6 text-sm">Your private application page — we've emailed you these details too. Save them to view your application and chat with our team:</p>
    <p className="mt-2 break-all rounded-md border border-border bg-muted p-2 text-xs">{link}</p>
    <p className="mt-3 text-sm">Password: <span className="font-mono text-lg font-bold tracking-widest">{sent.password}</span></p>
    <div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => void navigator.clipboard.writeText(link)}>Copy link</Button><Button asChild><a href={link} onClick={() => sessionStorage.setItem(`job-app-pw:${sent.token}`, sent.password)}>Open my application page</a></Button></div></div>; }
  return <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setError("");
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const input = applicationSchema.safeParse({ ...fields, vacancy_id: job.id, zone: job.zone, consent });
      if (!input.success) { setError("Please complete all required fields, enter a valid email and agree to the application review."); return; }
      setBusy(true);
      try { const r = await send({ data: input.data }); setSent(r); } catch (e) { setError(e instanceof Error ? e.message : "Your application could not be sent. Please try again."); } finally { setBusy(false); }
    }}>
      <h3 className="text-lg font-semibold">Your application</h3>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="job-name">Full name *</Label><Input id="job-name" name="full_name" autoComplete="name" maxLength={150} required /></div><div className="space-y-2"><Label htmlFor="job-email">Email *</Label><Input id="job-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div></div>
      <div className="space-y-2"><Label htmlFor="job-phone">Phone (optional)</Label><Input id="job-phone" name="phone" type="tel" autoComplete="tel" maxLength={50} /></div>
      <div className="space-y-2"><Label htmlFor="job-experience">Relevant experience *</Label><Textarea id="job-experience" name="experience" maxLength={6000} rows={3} required /></div>
      <div className="space-y-2"><Label htmlFor="job-motivation">Why would you like to join us? *</Label><Textarea id="job-motivation" name="motivation" maxLength={6000} rows={3} required /></div>
      <div className="space-y-2"><Label htmlFor="job-availability">Availability *</Label><Textarea id="job-availability" name="availability" maxLength={1000} rows={2} required /></div>
      <input name="website" aria-hidden="true" tabIndex={-1} className="hidden" autoComplete="off" />
      <div className="flex items-start gap-3"><Checkbox id="job-consent" checked={consent} onCheckedChange={(value) => setConsent(value === true)} /><Label htmlFor="job-consent" className="text-sm leading-relaxed">I agree to my details being stored and reviewed by the admin team for this application. *</Label></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}><Send className="mr-2 size-4" />{busy ? "Sending…" : "Send application"}</Button>
    </form>;
}