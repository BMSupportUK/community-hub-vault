import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Globe, Plus, Pencil, Trash2, Check, X, Loader2, Copy, Search, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_approved/admin-dns")({
  component: AdminDnsPage,
});

interface DnsRow {
  id: string;
  label: string;
  code: string;
  notes: string | null;
  created_at: string;
}

function AdminDnsPage() {
  const { user, hasAny, loading } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [rows, setRows] = useState<DnsRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DnsRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("qd_dns_codes")
      .select("*")
      .order("label", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as DnsRow[]);
    setBusy(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (loading) return <main className="flex-1 grid place-items-center text-muted-foreground"><Loader2 className="size-6 animate-spin" /></main>;
  if (!isAdmin) return <Navigate to="/home" />;

  const remove = async (id: string) => {
    if (!confirm("Delete this DNS code?")) return;
    const { error } = await supabase.from("qd_dns_codes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("Copied");
    setTimeout(() => setCopied(null), 1500);
  };

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return r.label.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || (r.notes ?? "").toLowerCase().includes(q);
  });

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Back to admin dashboard
        </Link>
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <Globe className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">QD DNS Codes</h1>
            <p className="text-sm text-muted-foreground">Shared DNS codes available to all approved members.</p>
          </div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm shadow-glow">
            <Plus className="size-4" /> New DNS code
          </button>
        </header>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search DNS codes…"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
        </div>

        {busy ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <Globe className="size-8 mx-auto mb-3 opacity-50" />
            <p>{rows.length === 0 ? "No DNS codes yet. Add your first." : "No DNS codes match your search."}</p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {filtered.map((r) => (
              <li key={r.id} className="rounded-2xl border border-border bg-surface-1 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="size-4 text-primary shrink-0" />
                    <div className="font-display font-semibold truncate">{r.label}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-surface-2" title="Edit"><Pencil className="size-4" /></button>
                    <button onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-surface-2 text-destructive" title="Delete"><Trash2 className="size-4" /></button>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">DNS code</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={r.code} className="flex-1 px-2.5 py-1.5 rounded-md bg-background border border-border text-sm font-mono" />
                    <button onClick={() => copy(r.id, r.code)} className="p-2 rounded-md bg-background border border-border hover:border-primary" title="Copy">
                      {copied === r.id ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                </div>
                {r.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(creating || editing) && (
        <DnsEditor
          row={editing}
          currentUserId={user!.id}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </main>
  );
}

function DnsEditor({ row, currentUserId, onClose, onSaved }: {
  row: DnsRow | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(row?.label ?? "");
  const [code, setCode] = useState(row?.code ?? "");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!label.trim() || !code.trim()) return toast.error("Label and code required");
    setBusy(true);
    try {
      const payload = { label: label.trim(), code: code.trim(), notes: notes.trim() || null };
      if (row) {
        const { error } = await supabase.from("qd_dns_codes").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("qd_dns_codes").insert({ ...payload, created_by: currentUserId });
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
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold">{row ? "Edit DNS code" : "New DNS code"}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100}
              placeholder="e.g. UK IPTV" className={cn("w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm")} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">DNS code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={255}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm font-mono" />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm resize-none" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}