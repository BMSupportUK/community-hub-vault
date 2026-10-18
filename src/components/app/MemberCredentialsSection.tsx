import { useEffect, useState } from "react";
import { CUSTOMER_LIST_CHANGED } from "@/lib/customer-list-refresh";
import { ChevronDown, ChevronRight, Check, Eye, EyeOff, History, Loader2, Lock, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listCredentialBackups, restoreCredentialBackup, type CredentialBackupFile } from "@/lib/credentials-restore.functions";
import { resetUserVaultPin } from "@/lib/vault-pin-admin.functions";
import { CREDENTIAL_TIME_STEP, credentialTimeInput, formatCredentialTime } from "@/lib/credential-time";

export interface CredentialRow {
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

export function MemberCredentialsSection({ ownerId, ownerLabel, currentUserId }: { ownerId: string; ownerLabel: string; currentUserId: string }) {
  const [creds, setCreds] = useState<CredentialRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<{ row: CredentialRow | null } | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const resetPinFn = useServerFn(resetUserVaultPin);

  const load = async () => {
    const { data, error } = await supabase
      .from("app_credentials")
      .select("*")
      .eq("owner_id", ownerId)
      .order("account_number", { ascending: true });
    if (error) return toast.error("Credentials could not be loaded.");
    setCreds((data ?? []) as CredentialRow[]);
    setLoaded(true);
  };

  useEffect(() => { if (open && !loaded) void load(); }, [open, loaded]);

  const remove = async (id: string) => {
    if (!confirm("Delete this credential?")) return;
    const { error } = await supabase.from("app_credentials").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    void load();
    window.dispatchEvent(new Event(CUSTOMER_LIST_CHANGED));
  };

  const resetPin = async () => {
    if (!confirm(`Reset the credentials vault PIN for ${ownerLabel}? They'll be prompted to set a new PIN next time they reveal credentials.`)) return;
    setPinBusy(true);
    try {
      await resetPinFn({ data: { userId: ownerId } });
      toast.success("Vault PIN reset");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reset PIN");
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3" aria-label={`Credentials for ${ownerLabel}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Credentials {loaded && <span className="text-primary">({creds.length})</span>}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void resetPin()}
            disabled={pinBusy}
            title="Reset this user's credentials vault PIN"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 text-xs font-medium hover:bg-amber-500/20 disabled:opacity-60"
          >
            {pinBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />} Reset PIN
          </button>
          <button
            onClick={() => { setOpen(true); setEditor({ row: null }); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
          >
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      </div>

      {open && !loaded && <div className="grid place-items-center py-4 text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>}

      {open && loaded && creds.length === 0 && (
        <p className="text-xs text-muted-foreground">No credentials saved for this customer.</p>
      )}

      {open && loaded && creds.length > 0 && (
        <div className="grid gap-2">
          {creds.map((c) => {
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
                        {expired ? "Expired" : "Expires"} {formatCredentialTime(exp)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditor({ row: c })} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground" aria-label={`Edit credential ${c.app_login_name}`}><Pencil className="size-3.5" /></button>
                    <button onClick={() => void remove(c.id)} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-destructive" aria-label={`Delete credential ${c.app_login_name}`}><Trash2 className="size-3.5" /></button>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border font-mono text-xs">
                  <span className="flex-1 truncate">{revealed[c.id] ? c.password : "•".repeat(Math.min(c.password.length, 12))}</span>
                  <button onClick={() => setRevealed((s) => ({ ...s, [c.id]: !s[c.id] }))} className="text-muted-foreground hover:text-foreground" aria-label={revealed[c.id] ? "Hide password" : "Reveal password"}>
                    {revealed[c.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(c.password); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground">Copy</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <CredentialEditor
          ownerId={ownerId}
          row={editor.row}
          nextAccountNumber={Math.max(0, ...creds.map((c) => c.account_number)) + 1}
          currentUserId={currentUserId}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); void load(); window.dispatchEvent(new Event(CUSTOMER_LIST_CHANGED)); }}
        />
      )}
    </section>
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
  const [expiry, setExpiry] = useState(row?.expiry_at ? credentialTimeInput(row.expiry_at) : "");
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
            <input type="datetime-local" step={CREDENTIAL_TIME_STEP} value={expiry} onChange={(e) => setExpiry(credentialTimeInput(e.target.value))} className="ed-input" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="ed-cancel px-4 py-2 rounded-lg text-sm font-medium">Cancel</button>
          <button onClick={() => void save()} disabled={busy} className="ed-save px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
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

export function RestoreCredentialsBackupButton({ onRestored }: { onRestored?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:border-primary"
        title="Restore credentials from a backup snapshot"
      >
        <History className="size-3.5" /> Restore backup
      </button>
      {open && (
        <RestoreBackupDialog
          onClose={() => setOpen(false)}
          onRestored={() => { setOpen(false); onRestored?.(); }}
        />
      )}
    </>
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
            onClick={() => void run()}
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
