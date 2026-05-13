import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, KeyRound, ShieldCheck, Eye, EyeOff, Plus, Trash2, Pencil, Globe, Loader2, Search, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/vault")({
  component: VaultPage,
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

interface DnsRow {
  id: string;
  label: string;
  code: string;
  notes: string | null;
}

interface ProfileLite {
  id: string;
  username: string | null;
  display_name: string | null;
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UNLOCK_TTL_MS = 5 * 60 * 1000;

function VaultPage() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [tab, setTab] = useState<"credentials" | "dns">("credentials");

  // Lock state
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockedUntil, setUnlockedUntil] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("vault_pins").select("user_id").eq("user_id", user.id).maybeSingle();
      setHasPin(!!data);
    })();
  }, [user]);

  // Auto-relock after TTL
  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(() => setUnlocked(false), Math.max(0, unlockedUntil - Date.now()));
    return () => clearTimeout(t);
  }, [unlocked, unlockedUntil]);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <ShieldCheck className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">Credentials Vault</h1>
            <p className="text-sm text-muted-foreground">App logins and QD DNS codes — protected by your password and PIN.</p>
          </div>
          {unlocked && (
            <button
              onClick={() => setUnlocked(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm hover:border-primary"
            >
              <Lock className="size-4" /> Lock
            </button>
          )}
        </header>

        <div className="flex gap-1 p-1 rounded-xl bg-surface-2 border border-border w-fit mb-6">
          {(["credentials", "dns"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "credentials" ? "App Credentials" : "QD DNS Codes"}
            </button>
          ))}
        </div>

        {hasPin === null ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : !unlocked ? (
          <LockGate
            hasPin={hasPin}
            onUnlocked={() => {
              setUnlocked(true);
              setUnlockedUntil(Date.now() + UNLOCK_TTL_MS);
              setHasPin(true);
            }}
          />
        ) : tab === "credentials" ? (
          <CredentialsPanel isAdmin={isAdmin} />
        ) : (
          <DnsPanel isAdmin={isAdmin} />
        )}
      </div>
    </main>
  );
}

function LockGate({ hasPin, onUnlocked }: { hasPin: boolean; onUnlocked: () => void }) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  const setupPin = async () => {
    if (!user) return;
    if (pin.length < 4) return toast.error("PIN must be at least 4 characters");
    if (pin !== confirmPin) return toast.error("PINs do not match");
    setBusy(true);
    try {
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { error } = await supabase.from("vault_pins").upsert({ user_id: user.id, pin_hash: hash });
      if (error) throw error;
      toast.success("PIN set. Now unlock your vault.");
      setPin("");
      setConfirmPin("");
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to set PIN");
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!user?.email) return;
    if (!password || !pin) return toast.error("Enter password and PIN");
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (signErr) throw new Error("Incorrect password");
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { data: row } = await supabase.from("vault_pins").select("pin_hash").eq("user_id", user.id).maybeSingle();
      if (!row || row.pin_hash !== hash) throw new Error("Incorrect PIN");
      toast.success("Vault unlocked");
      onUnlocked();
    } catch (e: any) {
      toast.error(e.message ?? "Unlock failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-border bg-surface-1 p-6">
      <div className="size-12 rounded-2xl bg-surface-2 grid place-items-center mb-4">
        <Lock className="size-5 text-primary" />
      </div>
      {!hasPin ? (
        <>
          <h2 className="font-display text-lg font-bold">Set your vault PIN</h2>
          <p className="text-sm text-muted-foreground mb-4">A personal PIN (min 4 chars) plus your account password will be required to view credentials.</p>
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="New PIN" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <input value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} type="password" placeholder="Confirm PIN" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <button onClick={setupPin} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">
            {busy ? "Saving…" : "Save PIN"}
          </button>
        </>
      ) : (
        <>
          <h2 className="font-display text-lg font-bold">Unlock vault</h2>
          <p className="text-sm text-muted-foreground mb-4">Enter your account password and your vault PIN.</p>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Account password" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="Vault PIN" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" onKeyDown={(e) => e.key === "Enter" && unlock()} />
          <button onClick={unlock} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Unlock
          </button>
        </>
      )}
    </div>
  );
}

function CredentialsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<CredentialRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: creds }, { data: profs }] = await Promise.all([
      supabase.from("app_credentials").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, username, display_name"),
    ]);
    setRows((creds ?? []) as CredentialRow[]);
    setProfiles((profs ?? []) as ProfileLite[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const profMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const owner = profMap.get(r.owner_id);
      return (
        r.app_login_name.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q) ||
        (owner?.display_name ?? owner?.username ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, profMap]);

  const remove = async (id: string) => {
    if (!confirm("Delete this credential?")) return;
    const { error } = await supabase.from("app_credentials").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search credentials…" className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
        </div>
        {isAdmin && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm shadow-glow">
            <Plus className="size-4" /> New credential
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-1 px-6 py-16 text-center text-muted-foreground text-sm">
          No credentials yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((row) => {
            const owner = profMap.get(row.owner_id);
            const exp = row.expiry_at ? new Date(row.expiry_at) : null;
            const expired = exp && exp.getTime() < Date.now();
            const soon = exp && !expired && exp.getTime() - Date.now() < 7 * 86400000;
            return (
              <div key={row.id} className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display font-bold truncate">{row.app_login_name}</div>
                    <div className="text-xs text-muted-foreground truncate">For: {owner?.display_name || owner?.username || row.owner_id.slice(0, 8)}</div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(row)} className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                      <button onClick={() => remove(row.id)} className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border font-mono text-sm">
                  <span className="flex-1 truncate">{revealed[row.id] ? row.password : "•".repeat(Math.min(row.password.length, 14))}</span>
                  <button onClick={() => setRevealed((s) => ({ ...s, [row.id]: !s[row.id] }))} className="text-muted-foreground hover:text-foreground" title="Reveal">
                    {revealed[row.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(row.password); toast.success("Copied"); }}
                    className="text-muted-foreground hover:text-foreground text-xs px-2 py-0.5 rounded border border-border"
                  >
                    Copy
                  </button>
                </div>
                {exp && (
                  <div className={cn("text-xs", expired ? "text-destructive" : soon ? "text-amber-400" : "text-muted-foreground")}>
                    {expired ? "Expired" : "Expires"} {exp.toLocaleString()}
                  </div>
                )}
                {row.notes && <div className="text-xs text-muted-foreground line-clamp-2">{row.notes}</div>}
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && isAdmin && (
        <CredentialEditor
          row={editing}
          profiles={profiles}
          currentUserId={user?.id ?? ""}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function CredentialEditor({
  row, profiles, currentUserId, onClose, onSaved,
}: {
  row: CredentialRow | null;
  profiles: ProfileLite[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [appLoginName, setAppLoginName] = useState(row?.app_login_name ?? "");
  const [password, setPassword] = useState(row?.password ?? "");
  const [ownerId, setOwnerId] = useState(row?.owner_id ?? "");
  const [expiry, setExpiry] = useState(row?.expiry_at ? row.expiry_at.slice(0, 16) : "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!appLoginName || !password || !ownerId) return toast.error("Fill name, password and owner");
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
        const { error } = await supabase.from("app_credentials").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("app_credentials").insert({ ...payload, created_by: currentUserId });
        if (error) throw error;
      }
      toast.success("Saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
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
            <input value={appLoginName} onChange={(e) => setAppLoginName(e.target.value)} className="input" />
          </Field>
          <Field label="Password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} className="input font-mono" />
          </Field>
          <Field label="Assign to user">
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input">
              <option value="">Select user…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name || p.username || p.id.slice(0, 8)}</option>
              ))}
            </select>
          </Field>
          <Field label="Expiry (optional)">
            <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="input" />
          </Field>
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input resize-none" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
          </button>
        </div>
      </div>
      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;background:hsl(var(--surface-2,var(--muted)));border:1px solid hsl(var(--border));font-size:.875rem;color:inherit}`}</style>
    </div>
  );
}

function DnsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<DnsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<DnsRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("qd_dns_codes").select("*").order("label");
    setRows((data ?? []) as DnsRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setLabel(""); setCode(""); setNotes(""); setCreating(true); };
  const openEdit = (r: DnsRow) => { setEditing(r); setLabel(r.label); setCode(r.code); setNotes(r.notes ?? ""); setCreating(true); };

  const save = async () => {
    if (!label || !code) return toast.error("Label and code required");
    setBusy(true);
    try {
      if (editing) {
        const { error } = await supabase.from("qd_dns_codes").update({ label, code, notes: notes || null }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("qd_dns_codes").insert({ label, code, notes: notes || null });
        if (error) throw error;
      }
      toast.success("Saved");
      setCreating(false); setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this DNS code?")) return;
    const { error } = await supabase.from("qd_dns_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Pick a QD DNS code below. Codes are managed by admins.</p>
        {isAdmin && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm shadow-glow">
            <Plus className="size-4" /> New code
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-1 px-6 py-16 text-center text-muted-foreground text-sm">No DNS codes yet.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="size-4 text-primary shrink-0" />
                  <div className="font-display font-bold truncate">{r.label}</div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground"><Pencil className="size-3.5" /></button>
                    <button onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-surface-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border font-mono text-sm mb-2">
                <span className="flex-1 truncate">{revealed[r.id] ? r.code : "•".repeat(Math.min(r.code.length, 16))}</span>
                <button onClick={() => setRevealed((s) => ({ ...s, [r.id]: !s[r.id] }))} className="text-muted-foreground hover:text-foreground">
                  {revealed[r.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(r.code); toast.success("Copied"); }}
                  className="text-muted-foreground hover:text-foreground text-xs px-2 py-0.5 rounded border border-border"
                >
                  Copy
                </button>
              </div>
              {r.notes && <div className="text-xs text-muted-foreground line-clamp-2">{r.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {creating && isAdmin && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">{editing ? "Edit DNS code" : "New DNS code"}</h3>
              <button onClick={() => setCreating(false)} className="p-1.5 rounded hover:bg-surface-2"><X className="size-4" /></button>
            </div>
            <div className="space-y-3">
              <Field label="Label"><input value={label} onChange={(e) => setLabel(e.target.value)} className="input" /></Field>
              <Field label="Code"><input value={code} onChange={(e) => setCode(e.target.value)} className="input font-mono" /></Field>
              <Field label="Notes (optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input resize-none" /></Field>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
              </button>
            </div>
            <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;background:hsl(var(--muted));border:1px solid hsl(var(--border));font-size:.875rem;color:inherit}`}</style>
          </div>
        </div>
      )}
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