import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Plus,
  Paperclip,
  FileText,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import statusHero from "@/assets/status-hero.png";
import statusBg from "@/assets/status-bg.jpg";

export const Route = createFileRoute("/_authenticated/_approved/status")({
  component: StatusPage,
});

type IncidentStatus = "investigating" | "identified" | "monitoring" | "completed";

interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

interface Incident {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  attachments: Attachment[];
}

interface IncidentUpdate {
  id: string;
  incident_id: string;
  status: IncidentStatus;
  message: string;
  created_at: string;
  attachments: Attachment[];
}

const STATUS_META: Record<IncidentStatus, { label: string; classes: string; icon: React.ComponentType<{ className?: string }> }> = {
  investigating: { label: "Investigating", classes: "bg-violet-500/15 text-violet-300 border-violet-500/30", icon: Search },
  identified: { label: "Identified", classes: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30", icon: AlertTriangle },
  monitoring: { label: "Monitoring", classes: "bg-blue-500/15 text-blue-300 border-blue-500/30", icon: Eye },
  completed: { label: "Completed", classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
};

async function uploadFiles(files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) {
      toast.error(`${f.name} is over 25MB`);
      continue;
    }
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error } = await supabase.storage.from("status-attachments").upload(path, f, {
      cacheControl: "3600",
      upsert: false,
      contentType: f.type || undefined,
    });
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      continue;
    }
    const { data } = supabase.storage.from("status-attachments").getPublicUrl(path);
    out.push({ name: f.name, url: data.publicUrl, size: f.size, type: f.type });
  }
  return out;
}

function AttachmentList({ items }: { items: Attachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((a, i) => {
        const isImg = a.type?.startsWith("image/");
        return isImg ? (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
            <img
              src={a.url}
              alt={a.name}
              className="size-20 rounded-lg object-cover border border-border hover:opacity-80"
            />
          </a>
        ) : (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-xs hover:border-primary"
          >
            <FileText className="size-3.5" />
            <span className="max-w-[180px] truncate">{a.name}</span>
          </a>
        );
      })}
    </div>
  );
}

function FilePicker({
  files,
  setFiles,
  disabled,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface-2 text-xs cursor-pointer hover:border-primary">
        <Paperclip className="size-3.5" />
        <span>Attach files</span>
        <input
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            setFiles([...files, ...list]);
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border bg-surface-2 text-[11px]"
            >
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPage() {
  const { hasAny } = useAuth();
  const canManage = hasAny(["admin", "management", "staff"]);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [editor, setEditor] = useState<{ open: boolean; incident?: Incident }>({ open: false });

  const load = async () => {
    const { data } = await supabase
      .from("status_incidents")
      .select("id, title, description, status, created_at, updated_at, resolved_at, attachments")
      .order("created_at", { ascending: false });
    setIncidents((data as Incident[] | null) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("status-incidents")
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incidents" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incident_updates" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const active = (incidents ?? []).filter((i) => i.status !== "completed");
  const completed = (incidents ?? []).filter((i) => i.status === "completed");
  const list = tab === "active" ? active : completed;

  return (
    <main
      className="flex-1 overflow-y-auto bg-[#1a0b2e] bg-cover bg-center bg-no-repeat bg-fixed relative"
      style={{ backgroundImage: `url(${statusBg})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0b2e]/75 via-[#1a0b2e]/65 to-[#1a0b2e]/85 pointer-events-none" aria-hidden />
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Hero illustration */}
        <div className="relative rounded-3xl overflow-hidden border border-primary/30 shadow-glow bg-gradient-primary">
          <img
            src={statusHero}
            alt="BM Support engineer monitoring systems"
            className="w-full h-44 sm:h-56 object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
            <div className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow">BM Support · System Status</div>
            <div className="text-sm text-white/85">Real-time infrastructure monitoring</div>
          </div>
        </div>

        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
              <Activity className="size-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">Incidents</h1>
              <p className="text-sm text-muted-foreground">Track active and resolved issues across our services.</p>
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => setEditor({ open: true })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-accent text-white font-medium shadow-glow hover:opacity-90"
            >
              <Plus className="size-4" /> Add Issue
            </button>
          )}
        </header>

        {/* Banner */}
        <div
          className={`rounded-2xl border p-6 flex items-center gap-4 ${
            active.length === 0
              ? "border-success/40 bg-gradient-to-r from-success/10 via-primary/5 to-accent/10"
              : "border-primary/40 bg-gradient-to-r from-primary/15 via-fuchsia-500/10 to-accent/15"
          }`}
        >
          {active.length === 0 ? (
            <CheckCircle2 className="size-10 text-success shrink-0" />
          ) : (
            <ShieldAlert className="size-10 text-primary shrink-0" />
          )}
          <div>
            <div className="font-display text-lg font-bold">
              {active.length === 0
                ? "All Services are Operational"
                : `${active.length} active issue${active.length === 1 ? "" : "s"}`}
            </div>
            <div className="text-sm text-muted-foreground">
              {active.length === 0
                ? "No active incidents reported."
                : "Our team is working to resolve the issues below."}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          {(["active", "completed"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "active" ? "Active Issues" : "Completed"} ({t === "active" ? active.length : completed.length})
            </button>
          ))}
        </div>

        {/* List */}
        {incidents === null ? (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            {tab === "active" ? "No active incidents." : "No completed incidents yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((i) => (
              <IncidentCard
                key={i.id}
                incident={i}
                canManage={canManage}
                onEdit={() => setEditor({ open: true, incident: i })}
              />
            ))}
          </div>
        )}
      </div>

      {editor.open && (
        <IncidentEditor
          incident={editor.incident}
          onClose={() => setEditor({ open: false })}
          onSaved={load}
        />
      )}
    </main>
  );
}

function IncidentCard({ incident, canManage, onEdit }: { incident: Incident; canManage: boolean; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const [updates, setUpdates] = useState<IncidentUpdate[] | null>(null);
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const { user } = useAuth();

  const meta = STATUS_META[incident.status];
  const Icon = meta.icon;

  const loadUpdates = async () => {
    const { data } = await supabase
      .from("status_incident_updates")
      .select("id, incident_id, status, message, created_at, attachments")
      .eq("incident_id", incident.id)
      .order("created_at", { ascending: false });
    setUpdates((data as IncidentUpdate[] | null) ?? []);
  };

  useEffect(() => {
    if (open && updates === null) loadUpdates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const post = async () => {
    if (!user || (!msg.trim() && updateFiles.length === 0)) return;
    setPosting(true);
    try {
      const uploaded = updateFiles.length ? await uploadFiles(updateFiles) : [];
      const { error: uErr } = await supabase
        .from("status_incident_updates")
        .insert({
          incident_id: incident.id,
          status,
          message: msg.trim(),
          created_by: user.id,
          attachments: uploaded as unknown as never,
        });
      if (uErr) throw uErr;
      const patch: { status: IncidentStatus; resolved_at?: string | null } = { status };
      if (status === "completed" && !incident.resolved_at) patch.resolved_at = new Date().toISOString();
      if (status !== "completed" && incident.resolved_at) patch.resolved_at = null;
      const { error: iErr } = await supabase.from("status_incidents").update(patch).eq("id", incident.id);
      if (iErr) throw iErr;
      setMsg("");
      setUpdateFiles([]);
      await loadUpdates();
      toast.success("Update posted");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setPosting(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this incident?")) return;
    const { error } = await supabase.from("status_incidents").delete().eq("id", incident.id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full p-4 flex items-center gap-3 text-left hover:bg-surface-2/50 transition-colors">
        <div className={`size-10 rounded-xl border grid place-items-center ${meta.classes}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold truncate">{incident.title}</span>
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.classes}`}>{meta.label}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Opened {new Date(incident.created_at).toLocaleString()}
            {incident.resolved_at && ` · Resolved ${new Date(incident.resolved_at).toLocaleString()}`}
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border space-y-4">
          {incident.description && (
            <p className="text-sm text-muted-foreground pt-3 whitespace-pre-wrap">{incident.description}</p>
          )}
          <AttachmentList items={incident.attachments ?? []} />

          <div>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Updates</h3>
            {updates === null ? (
              <div className="text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin inline" /></div>
            ) : updates.length === 0 ? (
              <div className="text-sm text-muted-foreground">No updates yet.</div>
            ) : (
              <ol className="space-y-3 border-l border-border pl-4">
                {updates.map((u) => {
                  const um = STATUS_META[u.status];
                  return (
                    <li key={u.id} className="relative">
                      <span className={`absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-surface-1 ${um.classes.split(" ")[0].replace("/15", "")}`} />
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${um.classes}`}>{um.label}</span>
                        <span className="text-[11px] text-muted-foreground">{new Date(u.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-sm mt-1 whitespace-pre-wrap">{u.message}</div>
                      <AttachmentList items={u.attachments ?? []} />
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {canManage && (
            <div className="space-y-2 pt-2 border-t border-border">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Post update</h3>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(STATUS_META) as IncidentStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      status === s ? STATUS_META[s].classes : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={2}
                placeholder="What's the latest?"
                className="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm outline-none focus:border-primary resize-none"
              />
              <FilePicker files={updateFiles} setFiles={setUpdateFiles} disabled={posting} />
              <div className="flex justify-between">
                <button onClick={onEdit} className="text-xs text-muted-foreground hover:text-foreground">
                  Edit issue details
                </button>
                <div className="flex gap-2">
                  <button onClick={remove} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive flex items-center gap-1">
                    <Trash2 className="size-3" /> Delete
                  </button>
                  <button
                    onClick={post}
                    disabled={posting || (!msg.trim() && updateFiles.length === 0)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
                  >
                    {posting ? "Posting…" : "Post update"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IncidentEditor({
  incident,
  onClose,
  onSaved,
}: {
  incident?: Incident;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(incident?.title ?? "");
  const [description, setDescription] = useState(incident?.description ?? "");
  const [status, setStatus] = useState<IncidentStatus>(incident?.status ?? "investigating");
  const [initialUpdate, setInitialUpdate] = useState("");
  const [issueFiles, setIssueFiles] = useState<File[]>([]);
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast.error("Title required");
    setBusy(true);
    try {
      const issueUploads = issueFiles.length ? await uploadFiles(issueFiles) : [];
      if (incident) {
        const merged = [...(incident.attachments ?? []), ...issueUploads];
        const { error } = await supabase
          .from("status_incidents")
          .update({ title, description, status, attachments: merged as unknown as never })
          .eq("id", incident.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("status_incidents")
          .insert({
            title,
            description,
            status,
            created_by: user?.id,
            attachments: issueUploads as unknown as never,
          })
          .select("id")
          .single();
        if (error) throw error;
        const updateUploads = updateFiles.length ? await uploadFiles(updateFiles) : [];
        if ((initialUpdate.trim() || updateUploads.length) && data) {
          await supabase.from("status_incident_updates").insert({
            incident_id: data.id,
            status,
            message: initialUpdate.trim(),
            created_by: user?.id,
            attachments: updateUploads as unknown as never,
          });
        }
      }
      toast.success(incident ? "Issue updated" : "Issue created");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-1 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{incident ? "Edit issue" : "Add issue"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm outline-none focus:border-primary"
              placeholder="e.g. Login is failing for some users"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm outline-none focus:border-primary resize-none"
              placeholder="What's affected, scope, etc."
            />
          </div>
          {incident && incident.attachments?.length ? (
            <div>
              <label className="text-xs text-muted-foreground">Existing attachments</label>
              <AttachmentList items={incident.attachments} />
            </div>
          ) : null}
          <div>
            <label className="text-xs text-muted-foreground">Attachments</label>
            <div className="mt-1">
              <FilePicker files={issueFiles} setFiles={setIssueFiles} disabled={busy} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {(Object.keys(STATUS_META) as IncidentStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    status === s ? STATUS_META[s].classes : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
          {!incident && (
            <div>
              <label className="text-xs text-muted-foreground">Initial update (optional)</label>
              <textarea
                value={initialUpdate}
                onChange={(e) => setInitialUpdate(e.target.value)}
                rows={2}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm outline-none focus:border-primary resize-none"
                placeholder="First update message"
              />
              <div className="mt-2">
                <FilePicker files={updateFiles} setFiles={setUpdateFiles} disabled={busy} />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border border-border text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {busy ? "Saving…" : incident ? "Save changes" : "Create issue"}
          </button>
        </div>
      </div>
    </div>
  );
}