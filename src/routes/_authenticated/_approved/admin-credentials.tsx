import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Search, Loader2, Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, Eye, EyeOff, ArrowLeft, History, RotateCcw, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCredentialChanges } from "@/hooks/use-credential-changes";
import { useServerFn } from "@tanstack/react-start";
import {
  listCredentialBackups,
  restoreCredentialBackup,
  type CredentialBackupFile,
} from "@/lib/credentials-restore.functions";
import { resetUserVaultPin } from "@/lib/vault-pin-admin.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-credentials")({
  component: AdminCredentialsPage,
});

interface CredentialRow {
  id: string;
  owner_id: string;
  app_login_name: string;
  password: string;
  expiry_at: string | null;
  created_at: string;
  account_type?: string | null;
  account_number: number;
}

const ACCOUNT_TYPES = [
  { value: "single", label: "Single account" },
  { value: "multi", label: "Multi-room account" },
  { value: "triple", label: "Triple-room account" },
] as const;


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
  const [pinBusyFor, setPinBusyFor] = useState<string | null>(null);
  const resetPinFn = useServerFn(resetUserVaultPin);

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: c }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name").order("display_name", { ascending: true }),
      supabase.from("app_credentials").select("*").order("created_at", { ascending: false }),
    ]);
    const sortedProfs = ((profs ?? []) as ProfileLite[]).sort((a, b) => {
      const nameA = (a.display_name || a.username || "").toLowerCase();
      const nameB = (b.display_name || b.username || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
    setProfiles(sortedProfs);
    setCreds((c ?? []) as CredentialRow[]);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  // Live-refresh when a sale completion (or another admin) changes a credential.
  useCredentialChanges(() => { if (isAdmin) load(); });


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

  const resetPin = async (p: ProfileLite) => {
    const label = p.display_name || p.username || "this user";
    if (!confirm(`Reset the credentials vault PIN for ${label}? They'll be prompted to set a new PIN next time they reveal credentials.`)) return;
    setPinBusyFor(p.id);
    try {
      await resetPinFn({ data: { userId: p.id } });
      toast.success("Vault PIN reset");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reset PIN");
    } finally {
      setPinBusyFor(null);
    }
  };

  if (!isAdmin) return <Navigate to="/home" />;

  const totalCreds = creds.length;
  const usersWithCreds = new Set(creds.map((c) => c.owner_id)).size;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-6 py-8">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Back to owner dashboard
        </Link>
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <KeyRound className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">User Credentials Owner Panel</h1>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const list = grouped.get(p.id) ?? [];
              const open = !!expanded[p.id] || !!query.trim();
              const loginNames = list
                .slice()
                .sort((a, b) => a.account_number - b.account_number)
                .map((c) => c.app_login_name)
                .filter(Boolean);
              return (
                <div key={p.id} className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-base">
                        {p.display_name || p.username || "Unnamed"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">@{p.username ?? p.id.slice(0, 8)}</div>
                      {loginNames.length > 0 && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          <span className="text-primary/80 font-medium">Logins:</span> {loginNames.join(" | ")}
                        </div>
                      )}
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border shrink-0", list.length > 0 ? "border-primary text-primary" : "border-border text-muted-foreground")}>
                      {list.length} {list.length === 1 ? "credential" : "credentials"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      {open ? "Hide credentials" : "Show credentials"}
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => resetPin(p)}
                        disabled={pinBusyFor === p.id}
                        title="Reset this user's credentials vault PIN"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-xs font-medium hover:bg-amber-500/20 disabled:opacity-60"
                      >
                        {pinBusyFor === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />} Reset PIN
                      </button>
                      <button
                        onClick={() => setEditor({ ownerId: p.id, row: null })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
                      >
                        <Plus className="size-3.5" /> Add
                      </button>
                    </div>
                  </div>

                  {open && list.length > 0 && (
                    <div className="grid gap-2">
                      {list.slice().sort((a, b) => a.account_number - b.account_number).map((c) => {
                        const exp = c.expiry_at ? new Date(c.expiry_at) : null;
                        const expired = exp && exp.getTime() < Date.now();
                        const soon = exp && !expired && exp.getTime() - Date.now() < 7 * 86400000;
                        return (
                          <div key={c.id} className="rounded-xl border border-border bg-surface-2/50 p-3 grid gap-3">
                            <div className="min-w-0 flex items-start justify-between gap-2">
                              <div>
                                <div className="font-display font-semibold truncate">Account {c.account_number}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {c.app_login_name} · {ACCOUNT_TYPES.find((t) => t.value === (c.account_type ?? "single"))?.label ?? "Single account"}
                                </div>
                                {exp && (
                                  <div className={cn("text-xs", expired ? "text-destructive" : soon ? "text-amber-400" : "text-muted-foreground")}>
                                    {expired ? "Expired" : "Expires"} {exp.toLocaleString("en-GB")}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => setEditor({ ownerId: p.id, row: c })} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                                <button onClick={() => remove(c.id)} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border font-mono text-xs">
                              <span className="flex-1 truncate">{revealed[c.id] ? c.password : "•".repeat(Math.min(c.password.length, 12))}</span>
                              <button onClick={() => setRevealed((s) => ({ ...s, [c.id]: !s[c.id] }))} className="text-muted-foreground hover:text-foreground">
                                {revealed[c.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                              <button onClick={() => { navigator.clipboard.writeText(c.password); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground">Copy</button>
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
            nextAccountNumber={Math.max(0, ...(grouped.get(editor.ownerId) ?? []).map((c) => c.account_number)) + 1}
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
  ownerId, row, nextAccountNumber, currentUserId, onClose, onSaved,
}: {
  ownerId: string;
  row: CredentialRow | null;
  nextAccountNumber: number;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [appLoginName, setAppLoginName] = useState(row?.app_login_name ?? "");
  const [accountType, setAccountType] = useState<string>(row?.account_type ?? "single");
  const [password, setPassword] = useState(row?.password ?? "");
  const [expiry, setExpiry] = useState(row?.expiry_at ? row.expiry_at.slice(0, 16) : "");
  const [busy, setBusy] = useState(false);
  const accountLabel = `Account ${row?.account_number ?? nextAccountNumber}`;


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
        account_type: accountType,
        expiry_at: expiry ? new Date(expiry).toISOString() : null,
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
      <div className="ed-dialog w-full max-w-lg rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="ed-title font-display text-lg font-bold">{row ? "Edit credential" : "New credential"}</h3>
          <button onClick={onClose} className="ed-close p-1.5 rounded"><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Account name">
            <input readOnly value={accountLabel} className="ed-input" />
          </Field>
          <Field label="App login name">
            <input value={appLoginName} onChange={(e) => setAppLoginName(e.target.value)} className="ed-input" placeholder="e.g. IPTV portal" />
          </Field>
          <Field label="Account type">
            <div className="grid gap-1.5">
              {ACCOUNT_TYPES.map((t) => (
                <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#0f172a" }}>
                  <input
                    type="checkbox"
                    checked={accountType === t.value}
                    onChange={() => setAccountType(t.value)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
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
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="ed-cancel px-4 py-2 rounded-lg text-sm font-medium">Cancel</button>
          <button onClick={save} disabled={busy} className="ed-save px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
          </button>
        </div>
        <style>{`
          .ed-dialog{background:linear-gradient(140deg,#fff7ed 0%,#ffffff 45%,#ecfeff 100%);color:#0f172a;border:1px solid #fcd34d;box-shadow:0 25px 60px -15px rgba(244,114,182,.45),0 10px 30px -10px rgba(56,189,248,.35)}
          .ed-title{color:#0f172a;background:linear-gradient(90deg,#db2777,#7c3aed 50%,#0891b2);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
          .ed-close{color:#475569}
          .ed-close:hover{background:#fde68a;color:#0f172a}
          .ed-dialog label > div{color:#7c3aed !important}
          .ed-input{width:100%;padding:.65rem .85rem;border-radius:.6rem;background:#ffffff;border:1.5px solid #c4b5fd;font-size:.95rem;color:#0f172a;outline:none;transition:border-color .15s,box-shadow .15s,background .15s}
          .ed-input::placeholder{color:#94a3b8}
          .ed-input:hover{border-color:#a78bfa;background:#fdfaff}
          .ed-input:focus{border-color:#db2777;background:#ffffff;box-shadow:0 0 0 3px rgba(219,39,119,.2)}
          .ed-input::-webkit-calendar-picker-indicator{filter:none;opacity:1;cursor:pointer;margin-left:.25rem}
          .ed-input::-webkit-datetime-edit-text,
          .ed-input::-webkit-datetime-edit-day-field,
          .ed-input::-webkit-datetime-edit-month-field,
          .ed-input::-webkit-datetime-edit-year-field,
          .ed-input::-webkit-datetime-edit-hour-field,
          .ed-input::-webkit-datetime-edit-minute-field{color:#0f172a}
          .ed-cancel{background:#fff;color:#475569;border:1.5px solid #cbd5e1}
          .ed-cancel:hover{background:#f1f5f9;border-color:#94a3b8;color:#0f172a}
          .ed-save{background:linear-gradient(135deg,#db2777,#7c3aed 55%,#0891b2);color:#ffffff;border:none;box-shadow:0 10px 25px -8px rgba(124,58,237,.55)}
          .ed-save:hover{filter:brightness(1.08)}
          .ed-save:disabled{opacity:.7;cursor:not-allowed}
        `}</style>
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
                    {f.created_at ? new Date(f.created_at).toLocaleString("en-GB") : "—"}
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