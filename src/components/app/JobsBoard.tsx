import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, MapPin, CalendarDays, CheckCircle2, Send } from "lucide-react";
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
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <Link to={isBoro ? "/fan-zone" : "/"} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {name}</Link>
      <header className="max-w-2xl py-10 sm:py-14">
        <div className="mb-4 flex items-center gap-3 text-primary"><BriefcaseBusiness className="size-6" /><span className="text-sm font-semibold">Join our team</span></div>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">{name}<br /><span className="text-primary">Staff vacancies</span></h1>
        <p className="mt-5 max-w-xl text-base text-foreground/90">{isBoro ? "Help make our Boro community a welcoming place for every supporter." : "Be part of the team helping our customers get the support they need."}</p>
      </header>
      <section aria-label="Open positions" className="border-t border-border py-8">
        <div className="mb-6 flex items-center justify-between gap-4"><h2 className="font-display text-2xl font-semibold">Open positions</h2><span className="text-sm text-muted-foreground">{vacancies.length} available</span></div>
        {!vacancies.length ? <div className="py-8"><h3 className="text-lg font-semibold">No open positions right now</h3><p className="mt-2 text-muted-foreground">Please check back for future opportunities.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{vacancies.map((job) => <article key={job.id} className="min-w-0 rounded-lg border border-border bg-card/90 p-5 backdrop-blur-sm sm:p-6">
          <h3 className="break-words font-display text-xl font-bold">{job.title}</h3>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{job.location && <span className="flex items-center gap-2"><MapPin className="size-4 shrink-0" />{job.location}</span>}{job.employment_type && <span className="flex items-center gap-2"><BriefcaseBusiness className="size-4 shrink-0" />{job.employment_type}</span>}{positionsLeft(job.positions_available, job.positions_filled) > 0 ? <span className="font-semibold text-primary">{positionsLeft(job.positions_available, job.positions_filled)} of {positionsLabel(job.positions_available)} left to fill</span> : <span className="font-semibold text-muted-foreground">All positions filled</span>}</div>
          <p className="mt-5 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{job.description}</p>
          {job.closing_date && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" />Closes {new Date(`${job.closing_date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>}
          <Button className="mt-6" disabled={positionsLeft(job.positions_available, job.positions_filled) === 0} onClick={() => setSelected(job)}>View position &amp; apply <ArrowRight className="ml-2 size-4" /></Button>
        </article>)}</div>}
      </section>
    </main>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">{selected && <ApplicationForm key={selected.id} job={selected} />}</DialogContent></Dialog>
  </div>;
  if (isBoro) return <div className="boro-theme flex min-h-dvh"><IconRail />{content}</div>;
  return user && !isFanZoneOnly ? <div className="flex min-h-dvh"><IconRail />{content}</div> : content;
}
function ApplicationForm({ job }: { job: JobVacancy }) {
  const send = useServerFn(submitJobApplication);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ token: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  if (sent) { const link = `${window.location.origin}/job-application/${sent.token}`; return <div className="py-8 text-center"><DialogHeader><DialogTitle className="text-center">Application received</DialogTitle><DialogDescription className="text-center">Your application for {job.title} has been sent to our admin team for review.</DialogDescription></DialogHeader><CheckCircle2 className="mx-auto mt-6 size-12 text-success" />
    <p className="mt-6 text-sm">Your private application page — we've emailed you these details too. Save them to view your application and chat with our team:</p>
    <p className="mt-2 break-all rounded-md border border-border bg-muted p-2 text-xs">{link}</p>
    <p className="mt-3 text-sm">Password: <span className="font-mono text-lg font-bold tracking-widest">{sent.password}</span></p>
    <div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => void navigator.clipboard.writeText(link)}>Copy link</Button><Button asChild><a href={link} onClick={() => sessionStorage.setItem(`job-app-pw:${sent.token}`, sent.password)}>Open my application page</a></Button></div></div>; }
  return <><DialogHeader><DialogTitle>{job.title}</DialogTitle><DialogDescription>{job.location}{job.employment_type && ` · ${job.employment_type}`}</DialogDescription></DialogHeader>
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{job.description}</p>
    {job.requirements && <div><h3 className="mb-2 font-semibold">What we're looking for</h3><p className="whitespace-pre-wrap break-words text-sm">{job.requirements}</p></div>}
    <form className="space-y-4 border-t border-border pt-5" onSubmit={async (event) => {
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
    </form></>;
}