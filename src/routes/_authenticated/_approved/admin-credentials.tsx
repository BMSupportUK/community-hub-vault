import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Search, Loader2, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, Eye, EyeOff, ArrowLeft, History, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listCredentialBackups,
  restoreCredentialBackup,
  type CredentialBackupFile,
} from "@/lib/credentials-restore.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-credentials")({
  component: AdminCredentialsPage,
});

interface CredentialRow {
  id: string;
  owner_id: string;
  app_login_name: string;
  password: string;
  expiry_at: string | null;
  notes: string | null;
  created_at: string;
}

interface ProfileLite {
  id: string;
  username: string | null;
  display_name: string | null;
}

function AdminCredentialsPage() {
  const { hasAny, user } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [creds, setCreds] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<{ ownerId: string; row: CredentialRow | null } | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: c }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name").order("created_at", { ascending: true }),
      supabase.from("app_credentials").select("*").order("created_at", { ascending: false }),
    ]);
    setProfiles((profs ?? []) as ProfileLite[]);
    setCreds((c ?? []) as CredentialRow[]);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const grouped = useMemo(() => {
    const map = new Map<string, CredentialRow[]>();
    creds.forEach((c) => {
      const arr = map.get(c.owner_id) ?? [];
      arr.push(c);
      map.set(c.owner_id, arr);
    });
    return map;
  }, [creds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const matchesUser =
        (p.display_name ?? "").toLowerCase().includes(q) ||
        (p.username ?? "").toLowerCase().includes(q);
      const matchesCred = (grouped.get(p.id) ?? []).some((c) =>
        c.app_login_name.toLowerCase().includes(q),
      );
      return matchesUser || matchesCred;
    });
  }, [profiles, grouped, query]);

  const remove = async (id: string) => {
    if (!confirm("Delete this credential?")) return;
    const { error } = await supabase.from("app_credentials").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  if (!isAdmin) return <Navigate to="/home" />;

  const totalCreds = creds.length;
  const usersWithCreds = new Set(creds.map((c) => c.owner_id)).size;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Back to admin dashboard
        </Link>
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <KeyRound className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">User Credentials Admin</h1>
            <p className="text-sm text-muted-foreground">Manage app login credentials assigned to each user.</p>
          </div>
          <button
            onClick={() => setRestoreOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:border-primary"
            title="Restore credentials from a backup snapshot"
          >
            <History className="size-3.5" /> Restore backup
          </button>
          <div className="hidden sm:flex gap-2 text-xs">
            <Stat label="Users" value={profiles.length} />
            <Stat label="With creds" value={usersWithCreds} />
            <Stat label="Total" value={totalCreds} />
          </div>
        </header>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by user or credential name…"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface-1 px-6 py-16 text-center text-muted-foreground text-sm">No users found.</div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden divide-y divide-border">
            {filtered.map((p) => {
              const list = grouped.get(p.id) ?? [];
              const open = !!expanded[p.id] || !!query.trim();
              return (
                <div key={p.id}>
                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2 transition-colors text-left"
                  >
                    {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.display_name || p.username || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground truncate">@{p.username ?? p.id.slice(0, 8)}</div>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border", list.length > 0 ? "border-primary text-primary" : "border-border text-muted-foreground")}>
                      {list.length} {list.length === 1 ? "credential" : "credentials"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditor({ ownerId: p.id, row: null }); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                    >
                      <Plus className="size-3.5" /> Add
                    </button>
                  </button>

                  {open && list.length > 0 && (
                    <div className="px-5 pb-4 pt-1 grid gap-2 bg-surface-2/30">
                      {list.map((c) => {
                        const exp = c.expiry_at ? new Date(c.expiry_at) : null;
                        const expired = exp && exp.getTime() < Date.now();
                        const soon = exp && !expired && exp.getTime() - Date.now() < 7 * 86400000;
                        return (
                          <div key={c.id} className="rounded-lg border border-border bg-background/40 p-3 grid sm:grid-cols-[1fr_auto_auto] gap-3 items-center">
                            <div className="min-w-0">
                              <div className="font-display font-semibold truncate">{c.app_login_name}</div>
                              {exp && (
                                <div className={cn("text-xs", expired ? "text-destructive" : soon ? "text-amber-400" : "text-muted-foreground")}>
                                  {expired ? "Expired" : "Expires"} {exp.toLocaleString()}
                                </div>
                              )}
                              {c.notes && <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.notes}</div>}
                            </div>
                            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-2 border border-border font-mono text-xs min-w-[170px]">
                              <span className="flex-1 truncate">{revealed[c.id] ? c.password : "•".repeat(Math.min(c.password.length, 12))}</span>
                              <button onClick={() => setRevealed((s) => ({ ...s, [c.id]: !s[c.id] }))} className="text-muted-foreground hover:text-foreground">
                                {revealed[c.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                              <button onClick={() => { navigator.clipboard.writeText(c.password); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground">Copy</button>
                            </div>
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => setEditor({ ownerId: p.id, row: c })} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                              <button onClick={() => remove(c.id)} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {editor && (
          <CredentialEditor
            ownerId={editor.ownerId}
            row={editor.row}
            currentUserId={user?.id ?? ""}
            onClose={() => setEditor(null)}
            onSaved={() => { setEditor(null); load(); }}
          />
        )}

        {restoreOpen && (
          <RestoreBackupDialog
            onClose={() => setRestoreOpen(false)}
            onRestored={() => { setRestoreOpen(false); load(); }}
          />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-1.5 rounded-lg border border-border bg-surface-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display font-bold text-sm">{value}</div>
    </div>
  );
}

function CredentialEditor({
  ownerId, row, currentUserId, onClose, onSaved,
}: {
  ownerId: string;
  row: CredentialRow | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [appLoginName, setAppLoginName] = useState(row?.app_login_name ?? "");
  const [password, setPassword] = useState(row?.password ?? "");
  const [expiry, setExpiry] = useState(row?.expiry_at ? row.expiry_at.slice(0, 16) : "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let out = "";
    const buf = new Uint32Array(16);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 16; i++) out += chars[buf[i] % chars.length];
    setPassword(out);
  };

  const save = async () => {
    if (!appLoginName || !password) return toast.error("Name and password required");
    setBusy(true);
    try {
      const payload = {
        app_login_name: appLoginName,
        password,
        owner_id: ownerId,
        expiry_at: expiry ? new Date(expiry).toISOString() : null,
        notes: notes || null,
      };
      if (row) {
        const { error } = await supabase.from("app_credentials").update(payload as never).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("app_credentials").insert({ ...payload, created_by: currentUserId } as never);
        if (error) throw error;
      }
      toast.success("Saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold">{row ? "Edit credential" : "New credential"}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <Field label="App login name">
            <input value={appLoginName} onChange={(e) => setAppLoginName(e.target.value)} className="ed-input" placeholder="e.g. IPTV portal" />
          </Field>
          <Field label="Password">
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)} className="ed-input font-mono" />
              <button type="button" onClick={generate} className="px-3 py-2 rounded-lg border border-border text-xs whitespace-nowrap hover:border-primary">Generate</button>
            </div>
          </Field>
          <Field label="Expiry (optional)">
            <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="ed-input" />
          </Field>
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="ed-input resize-none" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
          </button>
        </div>
        <style>{`.ed-input{width:100%;padding:.55rem .75rem;border-radius:.5rem;background:hsl(var(--muted));border:1px solid hsl(var(--border));font-size:.875rem;color:inherit}`}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

function RestoreBackupDialog({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const listFn = useServerFn(listCredentialBackups);
  const restoreFn = useServerFn(restoreCredentialBackup);
  const [files, setFiles] = useState<CredentialBackupFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listFn();
        if (!cancelled) setFiles(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to list backups");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listFn]);

  const run = async () => {
    if (!selected) return;
    const verb = mode === "replace" ? "REPLACE ALL current credentials" : "merge into current credentials";
    if (!confirm(`Restore snapshot:\n${selected}\n\nThis will ${verb}. Continue?`)) return;
    setBusy(true);
    try {
      const res = await restoreFn({ data: { path: selected, mode } });
      toast.success(`Restored ${res.processed} credentials (${res.inserted} new, ${res.updated} updated)`);
      onRestored();
    } catch (e: any) {
      toast.error(e?.message ?? "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            <h3 className="font-display text-lg font-bold">Restore credentials from backup</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-2"><X className="size-4" /></button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Snapshots are written daily to the private <code className="font-mono">credentials-backups</code> bucket. Passwords and notes are re-encrypted on restore.
        </p>

        <div className="rounded-xl border border-border bg-surface-2/40 max-h-72 overflow-y-auto divide-y divide-border">
          {loading ? (
            <div className="p-6 grid place-items-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">{error}</div>
          ) : !files || files.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No snapshots available yet.</div>
          ) : (
            files.map((f) => (
              <label key={f.path} className={cn("flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-surface-2", selected === f.path && "bg-surface-2")}>
                <input type="radio" name="snap" checked={selected === f.path} onChange={() => setSelected(f.path)} />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{f.path}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {f.created_at ? new Date(f.created_at).toLocaleString() : "—"}
                    {f.size != null && ` · ${(f.size / 1024).toFixed(1)} KB`}
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Mode</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <label className={cn("rounded-lg border p-3 cursor-pointer", mode === "merge" ? "border-primary bg-primary/5" : "border-border")}>
              <div className="flex items-center gap-2 font-medium text-sm">
                <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Upsert by id. Existing rows not in the snapshot are kept.</div>
            </label>
            <label className={cn("rounded-lg border p-3 cursor-pointer", mode === "replace" ? "border-destructive bg-destructive/5" : "border-border")}>
              <div className="flex items-center gap-2 font-medium text-sm">
                <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace all
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Delete all current credentials, then load the snapshot exactly.</div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
          <button
            onClick={run}
            disabled={!selected || busy}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Restore
          </button>
        </div>
      </div>
    </div>
  );
}