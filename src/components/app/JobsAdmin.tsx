import { useState } from 'react';
import { Link, Navigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, Plus, Pencil, Save, Eye, ClipboardList, BriefcaseBusiness } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { isAdminUnlocked } from '@/lib/admin-unlock';
import { vacancySchema, jobAdminAllowed, jobStatusSchema, type JobZone, type VacancyInput, type JobApplication } from '@/lib/jobs';
import { getJobAdminData, saveJobVacancy, reviewJobApplication } from '@/lib/jobs.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import interview from '@/assets/jobs-interview.jpg';

export function JobsAdmin({ zone }: { zone: JobZone }) {
  const { roles, user } = useAuth();
  const parent = zone === 'bm' ? '/admin' : '/fan-zone-admin';
  if (!jobAdminAllowed(roles)) return <Navigate to={parent} />;
  if (!isAdminUnlocked(user?.id)) return <Navigate to={parent} search={{ next: zone === 'bm' ? '/admin-jobs' : '/fan-zone-jobs-admin' } as never} />;
  return <JobsAdminContent zone={zone} />;
}
function JobsAdminContent({ zone }: { zone: JobZone }) {
  const qc = useQueryClient();
  const getData = useServerFn(getJobAdminData);
  const saveVacancy = useServerFn(saveJobVacancy);
  const review = useServerFn(reviewJobApplication);
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['jobs-admin', zone], queryFn: () => getData({ data: { zone } }) });
  const [tab, setTab] = useState('positions');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<VacancyInput | null>(null);
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['jobs-admin', zone] }), qc.invalidateQueries({ queryKey: ['public-jobs', zone] })]); };
  const applications = (data?.applications ?? []).filter((a) => filter === 'all' || a.status === filter);
  return <main className="relative isolate min-h-dvh min-w-0 flex-1">
    <img src={interview} alt="" width={1536} height={1024} className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover" /><div className="pointer-events-none absolute inset-0 -z-10 bg-background/85" />
    <div className="space-y-6 px-4 py-6 sm:px-8">
      <Link to={zone === 'bm' ? '/admin' : '/fan-zone-admin'} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" />{zone === 'bm' ? 'Owner tools' : 'Fan Zone tools'}</Link>
      <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">{zone === 'bm' ? 'BM Support' : 'Boro Fan Zone'}</p><h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-bold"><BriefcaseBusiness className="size-7 text-primary" />Jobs &amp; applications</h1></div><Button asChild variant="outline"><Link to={zone === 'bm' ? '/jobs' : '/fan-zone/jobs'}><Eye className="mr-2 size-4" />View jobs board</Link></Button></header>
      <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="positions">Positions ({data?.vacancies.length ?? 0})</TabsTrigger><TabsTrigger value="applications">Applications ({data?.applications.length ?? 0})</TabsTrigger></TabsList></Tabs>
      {isPending ? <p role="status">Loading recruitment…</p> : error ? <div role="alert"><p>{error.message}</p><Button onClick={() => void refetch()} variant="outline">Try again</Button></div> : tab === 'positions' ? <>
        <Button onClick={() => setEditing({ zone, title: '', location: '', employment_type: '', description: '', requirements: '', closing_date: null, published: false, positions_available: 1 })}><Plus className="mr-2 size-4" />Add position</Button>
        {!data?.vacancies.length ? <p className="py-8 text-muted-foreground">No positions added yet.</p> : <div className="grid gap-4 lg:grid-cols-2">{data.vacancies.map((job) => <article key={job.id} className="rounded-lg border border-border bg-card/90 p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="break-words text-xl font-semibold">{job.title}</h2><span className={job.published ? 'text-success' : 'text-muted-foreground'}>{job.published ? 'Published' : 'Draft / closed'}</span></div><p className="mt-2 text-sm text-muted-foreground">{job.location} {job.employment_type && `· ${job.employment_type}`}</p><p className="mt-3 text-sm">{job.positions_available ?? 1} position{(job.positions_available ?? 1) === 1 ? '' : 's'} · {data.applications.filter((a) => a.vacancy_id === job.id).length} applications</p><Button className="mt-4" variant="outline" onClick={() => setEditing(job)}><Pencil className="mr-2 size-4" />Edit position</Button></article>)}</div>}
      </> : <>
        <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-52" aria-label="Filter applications"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All applications</SelectItem>{jobStatusSchema.options.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select>
        {!applications.length ? <p className="py-8 text-muted-foreground">No applications found.</p> : <div className="grid gap-4 lg:grid-cols-2">{applications.map((a) => <article key={a.id} className="min-w-0 rounded-lg border border-border bg-card/90 p-5"><h2 className="break-words text-xl font-semibold">{a.full_name}</h2><p className="mt-2 text-sm">{data?.vacancies.find((v) => v.id === a.vacancy_id)?.title}</p><p className="mt-2 break-all text-sm text-muted-foreground">{a.email}</p><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span className="capitalize">{a.status}</span><span>{new Date(a.created_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button asChild><Link to="/admin-job-application/$id" params={{ id: a.id }}><ClipboardList className="mr-2 size-4" />Open secure page &amp; chat</Link></Button><Button variant="outline" onClick={() => setApplication(a)}>Quick review</Button></div></article>)}</div>}
      </>}
    </div>
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing?.id ? 'Edit position' : 'Add position'}</DialogTitle></DialogHeader>{editing && <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); const parsed = vacancySchema.safeParse(editing);
      if (!parsed.success) return toast.error('Please add a title and description, and check the closing date.');
      setBusy(true); try { await saveVacancy({ data: parsed.data }); await refresh(); setEditing(null); toast.success('Position saved'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save position'); } finally { setBusy(false); }
    }}>
      {([ ['title', 'Position title', 150], ['location', 'Location', 200], ['employment_type', 'Employment type / hours', 100] ] as const).map(([field, label, max]) => <div className="space-y-2" key={field}><Label htmlFor={`vacancy-${field}`}>{label}</Label><Input id={`vacancy-${field}`} maxLength={max} required={field === 'title'} value={editing[field]} onChange={(e) => setEditing({ ...editing, [field]: e.target.value })} /></div>)}
      <div className="space-y-2"><Label htmlFor="vacancy-description">Position description *</Label><Textarea id="vacancy-description" rows={5} maxLength={12000} required value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="vacancy-requirements">Requirements</Label><Textarea id="vacancy-requirements" rows={4} maxLength={12000} value={editing.requirements} onChange={(e) => setEditing({ ...editing, requirements: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="vacancy-positions">Number of positions</Label><Input id="vacancy-positions" type="number" min={1} max={100} className="w-32" value={editing.positions_available ?? 1} onChange={(e) => setEditing({ ...editing, positions_available: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} /></div>
      <div className="space-y-2"><Label htmlFor="vacancy-closing">Closing date (optional)</Label><Input id="vacancy-closing" type="date" value={editing.closing_date ?? ''} onChange={(e) => setEditing({ ...editing, closing_date: e.target.value || null })} /></div>
      <div className="flex items-center gap-3"><Switch id="vacancy-published" checked={editing.published} onCheckedChange={(published) => setEditing({ ...editing, published })} /><Label htmlFor="vacancy-published">Published — accepting applications</Label></div>
      <Button type="submit" disabled={busy}><Save className="mr-2 size-4" />{busy ? 'Saving…' : 'Save position'}</Button>
    </form>}</DialogContent></Dialog>
    <Dialog open={!!application} onOpenChange={(open) => { if (!open && !busy) setApplication(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{application?.full_name}</DialogTitle></DialogHeader>{application && <div className="space-y-5">
      <p className="font-semibold">{data?.vacancies.find((v) => v.id === application.vacancy_id)?.title}</p><p className="break-all text-sm">{application.email}{application.phone && ` · ${application.phone}`}</p>
      {([['experience', 'Relevant experience'], ['motivation', 'Why they want to join'], ['availability', 'Availability']] as const).map(([key, title]) => <section key={key}><h3 className="mb-2 font-semibold">{title}</h3><p className="whitespace-pre-wrap break-words text-sm">{application[key]}</p></section>)}
      <p className="text-xs text-muted-foreground">Application review consent provided.</p>
      <div className="space-y-2"><Label>Review status</Label><Select value={application.status} onValueChange={(status) => setApplication({ ...application, status: jobStatusSchema.parse(status) })}><SelectTrigger aria-label="Review status"><SelectValue /></SelectTrigger><SelectContent className="z-[120]">{jobStatusSchema.options.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="application-notes">Private admin notes</Label><Textarea id="application-notes" rows={3} maxLength={6000} value={application.admin_notes} onChange={(e) => setApplication({ ...application, admin_notes: e.target.value })} /></div>
      <Button disabled={busy} onClick={async () => { setBusy(true); try { await review({ data: { id: application.id, status: application.status, admin_notes: application.admin_notes } }); await refresh(); setApplication(null); toast.success('Application review saved'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save review'); } finally { setBusy(false); } }}><Save className="mr-2 size-4" />{busy ? 'Saving…' : 'Save review'}</Button>
    </div>}</DialogContent></Dialog>
  </main>;
}
